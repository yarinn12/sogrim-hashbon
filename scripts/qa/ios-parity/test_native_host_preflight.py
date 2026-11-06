"""Synthetic controls for same-job host calibration; no simulator/PID commands."""
import hashlib
import json
import os
import plistlib
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import native_host_preflight as cal

SHA="1"*40
TREE="2"*40
UDID="19C74233-1198-45BC-918D-0868A613CCF3"
RUNTIME="com.apple.CoreSimulator.SimRuntime.iOS-26-5"
DEVICE="com.apple.CoreSimulator.SimDeviceType.iPhone-16"

class CalibrationTests(unittest.TestCase):
    def setUp(self):
        tmp=tempfile.TemporaryDirectory(prefix="cal-");self.addCleanup(tmp.cleanup)
        self.root=Path(tmp.name);self.out=self.root/"evidence";self.out.mkdir()
        self.uid=self.root.stat().st_uid
        for target,kwargs in (("native_host_preflight.os.getuid",dict(return_value=self.uid,create=True)),
                              ("native_host_preflight.host_identity",dict(return_value="a"*64)),
                              ("native_host_preflight.Path.home",dict(return_value=self.root))):
            mock=patch(target,**kwargs);mock.start();self.addCleanup(mock.stop)
        env=patch.dict(os.environ,{"GITHUB_RUN_ID":"123","GITHUB_RUN_ATTEMPT":"1","GITHUB_JOB":"native-parity"})
        env.start();self.addCleanup(env.stop)
        self.manifest=self.out/"package-manifest.json"
        tool_sha=hashlib.sha256(Path(cal.__file__).read_bytes()).hexdigest()
        self.manifest.write_text(json.dumps(dict(sourceSha=SHA,sourceTree=TREE,fixtureSha="3"*40,fixtureTree="4"*40,
                                                qaFixtures={Path(cal.__file__).name:tool_sha})))
        self.owner_path=self.out/"owned-simulator.json"
        self.owner=cal.make_ownership(self.manifest,UDID,RUNTIME,DEVICE)
        self.owner_path.write_text(json.dumps(self.owner))
        self.device_path=self.root/"Library/Developer/CoreSimulator/Devices"/UDID/"device.plist"
        self.device_path.parent.mkdir(parents=True)
        self.device_path.write_bytes(plistlib.dumps(dict(UDID=UDID,state=3)))
        self.tool=self.root/"Xcode.app/Contents/Developer/usr/bin/simctl"
        self.tool.parent.mkdir(parents=True);self.tool.write_bytes(b"synthetic simctl")
        self.clock=SimpleNamespace(now=0.0)
        self.commands=[];self.query_count=0
        self.row=dict(udid=UDID,state="Booted",isAvailable=True,deviceTypeIdentifier=DEVICE)
        self.runtime=RUNTIME
        self.on_query=None

    def command(self,args,deadline,clock):
        self.commands.append(args);self.clock.now+=0.1
        if args==["/usr/bin/xcrun","--find","simctl"]:return str(self.tool).encode()
        self.assertEqual(args,[str(self.tool),"list","devices","-j",UDID])
        self.query_count+=1
        if self.on_query:self.on_query(self.query_count)
        return json.dumps({"devices":{self.runtime:[self.row]}}).encode()

    def run_probe(self,**changes):
        args=dict(manifest_path=self.manifest,ownership_path=self.owner_path,sha=SHA,tree=TREE,udid=UDID,
                  command=self.command,clock=lambda:self.clock.now)
        args.update(changes);return cal.run_preflight(**args)

    def assert_unverified(self,report):
        self.assertFalse(report["verified"],report)
        self.assertFalse(report["newHostRouteVerified"],report)
        self.assertTrue(report["legacyVerificationRequired"],report)

    def receipt(self):
        r=self.run_probe();self.assertTrue(r["verified"],r)
        path=self.out/"host-calibration.json";path.write_text(json.dumps(r));return path,r

    def test_valid_same_job_host_observation_is_bound_and_loads(self):
        path,r=self.receipt()
        self.assertEqual(len(self.commands),3)
        self.assertLess(r["elapsedSeconds"],8)
        self.assertEqual(r["localDevice"]["observedState"],3)
        self.assertEqual([v["state"] for v in r["cliObservations"]],["Booted","Booted"])
        self.assertEqual(r["context"]["sourceSha"],SHA)
        loaded=cal.load_calibration(path,self.owner_path,self.manifest,SHA,TREE,UDID)
        self.assertEqual(loaded,r)

    def test_state_three_without_cli_booted_observation_is_rejected(self):
        self.row["state"]="Shutdown"
        self.assert_unverified(self.run_probe())

    def test_foreign_run_attempt_job_host_source_tree_or_udid_ownership_is_rejected(self):
        for field,value in (("runId","999"),("runAttempt","2"),("job","other-job"),("hostIdentity","b"*64),
                            ("sourceSha","9"*40),("sourceTree","8"*40),("udid","00000000-0000-0000-0000-000000000000")):
            with self.subTest(field=field):
                changed=dict(self.owner,context=dict(self.owner["context"],**{field:value}))
                self.owner_path.write_text(json.dumps(changed))
                self.assert_unverified(self.run_probe())
        self.assertEqual(self.commands,[])

    def test_missing_foreign_or_ambiguous_device_json_is_rejected(self):
        for payload in ([], {}, {"devices":{}}, {"devices":{RUNTIME:[]}},
                        {"devices":{RUNTIME:[dict(self.row,udid="foreign")]}},
                        {"devices":{RUNTIME:[self.row,self.row]}}, {"devices":{RUNTIME:[3]}}):
            with self.subTest(payload=payload):
                def command(args,deadline,clock):
                    return str(self.tool).encode() if args[0]=="/usr/bin/xcrun" else json.dumps(payload).encode()
                self.assert_unverified(self.run_probe(command=command))

    def test_missing_or_foreign_ownership_and_manifest_are_rejected(self):
        self.owner_path.unlink();self.assert_unverified(self.run_probe())
        self.owner_path.write_text(json.dumps(self.owner))
        self.assert_unverified(self.run_probe(ownership_path=self.root/"foreign.json"))
        self.assert_unverified(self.run_probe(sha="9"*40))
        self.assert_unverified(self.run_probe(tree="8"*40))
        self.assert_unverified(self.run_probe(udid="booted"))
        self.assertEqual(self.commands,[])

    def test_different_local_format_and_state_are_rejected(self):
        for value in ({}, {"UDID":UDID,"state":"3"}, {"UDID":UDID,"state":True},
                      {"UDID":UDID,"state":4}, {"UDID":"foreign","state":3}, []):
            with self.subTest(value=value):
                self.device_path.write_bytes(plistlib.dumps(value))
                self.assert_unverified(self.run_probe())
        self.device_path.unlink();self.assert_unverified(self.run_probe())

    def test_foreign_runtime_type_or_unavailable_device_is_rejected(self):
        for changes in ({"deviceTypeIdentifier":"foreign"},{"isAvailable":False}):
            self.row.update(changes);self.assert_unverified(self.run_probe())
        self.row=dict(udid=UDID,state="Booted",isAvailable=True,deviceTypeIdentifier=DEVICE)
        self.runtime="com.apple.CoreSimulator.SimRuntime.iOS-18-0"
        self.assert_unverified(self.run_probe())

    def test_timeout_and_late_positive_never_authorize_host_route(self):
        calls=[]
        def timeout(args,deadline,clock):
            calls.append(args);self.clock.now=8.01
            raise cal.CalibrationError("preflight-deadline-exceeded")
        self.assert_unverified(self.run_probe(command=timeout));self.assertEqual(len(calls),1)
        self.clock.now=0
        self.on_query=lambda count:setattr(self.clock,"now",8.01) if count==2 else None
        report=self.run_probe();self.assert_unverified(report)
        self.assertEqual(report["reason"],"preflight-deadline-exceeded")
        self.assertEqual(self.query_count,2)

    def test_output_cap_and_foreign_tool_are_rejected(self):
        def oversized(args,deadline,clock):
            return str(self.tool).encode() if args[0]=="/usr/bin/xcrun" else b"x"*(cal.MAX_OUTPUT+1)
        self.assert_unverified(self.run_probe(command=oversized))
        self.assert_unverified(self.run_probe(command=lambda *args:b"/tmp/simctl"))

    def test_second_cli_and_local_snapshot_must_remain_consistent(self):
        self.on_query=lambda count:self.row.update(state="Shutdown") if count==2 else None
        self.assert_unverified(self.run_probe())
        self.row["state"]="Booted";self.query_count=0
        self.on_query=lambda count:self.device_path.write_bytes(plistlib.dumps(dict(UDID=UDID,state=2))) if count==2 else None
        self.assert_unverified(self.run_probe())

    def test_source_bound_helper_and_current_tool_must_match(self):
        path,r=self.receipt()
        self.tool.write_bytes(b"substituted tool")
        with self.assertRaises(cal.CalibrationError):cal.load_calibration(path,self.owner_path,self.manifest,SHA,TREE,UDID)
        self.tool.write_bytes(b"synthetic simctl")
        manifest=json.loads(self.manifest.read_text());manifest["qaFixtures"][Path(cal.__file__).name]="0"*64
        self.manifest.write_text(json.dumps(manifest))
        self.assert_unverified(self.run_probe())

    def test_calibration_cannot_be_reused_on_another_job_or_host(self):
        path,r=self.receipt()
        for env in ({"GITHUB_RUN_ID":"999"},{"GITHUB_RUN_ATTEMPT":"2"},{"GITHUB_JOB":"foreign"}):
            with self.subTest(env=env),patch.dict(os.environ,env),self.assertRaises(cal.CalibrationError):
                cal.load_calibration(path,self.owner_path,self.manifest,SHA,TREE,UDID)
        with patch("native_host_preflight.host_identity",return_value="b"*64),self.assertRaises(cal.CalibrationError):
            cal.load_calibration(path,self.owner_path,self.manifest,SHA,TREE,UDID)

    def test_false_missing_and_malformed_receipts_never_authorize(self):
        path,r=self.receipt()
        for changes in ({"verified":False},{"newHostRouteVerified":False},{"legacyVerificationRequired":True},
                        {"cliObservations":[]},{"cliObservations":["x","y"]},{"elapsedSeconds":8.0},
                        {"tool":[]},{"localDevice":[]},{"schemaVersion":True}):
            path.write_text(json.dumps(dict(r,**changes)))
            with self.subTest(changes=changes),self.assertRaises(cal.CalibrationError):
                cal.load_calibration(path,self.owner_path,self.manifest,SHA,TREE,UDID)
        changed=dict(r,cliObservations=[dict(v,state="Shutdown") for v in r["cliObservations"]])
        path.write_text(json.dumps(changed))
        with self.assertRaises(cal.CalibrationError):
            cal.load_calibration(path,self.owner_path,self.manifest,SHA,TREE,UDID)
        path.unlink()
        with self.assertRaises((cal.CalibrationError,OSError)):
            cal.load_calibration(path,self.owner_path,self.manifest,SHA,TREE,UDID)

    def test_bounded_command_reads_once_and_caps_combined_output(self):
        class Pipe:
            def __init__(self,fd):self.fd=fd
            def close(self):pass
        class Process:
            def __init__(self):self.stdout=Pipe(1);self.stderr=Pipe(2);self.kills=0;self.done=False
            def poll(self):return 0 if self.done else None
            def kill(self):self.kills+=1;self.done=True
            def wait(self,timeout):self.done=True;return 0
        class Selector:
            def __init__(self):self.rows={}
            def register(self,obj,events,data):self.rows[obj.fd]=SimpleNamespace(fd=obj.fd,fileobj=obj,data=data)
            def unregister(self,obj):self.rows.pop(obj.fd)
            def get_map(self):return self.rows
            def select(self,timeout):return [(row,1) for row in list(self.rows.values())]
            def close(self):pass
        for oversized in (False,True):
            process=Process();chunks={1:[b"x"*(cal.MAX_OUTPUT+1) if oversized else b"ok",b""],2:[b""]}
            with patch("native_host_preflight.subprocess.Popen",return_value=process) as popen, \
                 patch("native_host_preflight.selectors.DefaultSelector",Selector), \
                 patch("native_host_preflight.os.read",side_effect=lambda fd,size:chunks[fd].pop(0)):
                if oversized:
                    with self.assertRaisesRegex(cal.CalibrationError,"output-over-limit"):
                        cal.bounded_command([str(self.tool),"list"],8,lambda:0)
                    self.assertEqual(process.kills,1)
                else:
                    self.assertEqual(cal.bounded_command([str(self.tool),"list"],8,lambda:0),b"ok")
                    self.assertEqual(process.kills,0)
                self.assertEqual(popen.call_count,1)

    def test_expired_command_deadline_never_starts_a_process(self):
        with patch("native_host_preflight.subprocess.Popen") as popen:
            with self.assertRaises(cal.CalibrationError):cal.bounded_command([str(self.tool)],8,lambda:8)
            popen.assert_not_called()

    def test_missing_job_identity_and_symlink_ownership_never_start_cli(self):
        with patch.dict(os.environ,{"GITHUB_RUN_ID":""}):self.assert_unverified(self.run_probe())
        with patch.object(Path,"is_symlink",autospec=True,side_effect=lambda p:p==self.owner_path):
            self.assert_unverified(self.run_probe())
        self.assertEqual(self.commands,[])

    def test_unsupported_ownership_format_is_rejected_before_cli(self):
        for changed in ([],dict(self.owner,schemaVersion=True),dict(self.owner,createdWall=float("nan"))):
            self.owner_path.write_text(json.dumps(changed));self.assert_unverified(self.run_probe())
        self.assertEqual(self.commands,[])

if __name__=="__main__":unittest.main()
