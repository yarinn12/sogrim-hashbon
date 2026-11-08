"""Synthetic exported-stack discovery; never a live collection or Native test."""
from contextlib import ExitStack, contextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('original_stacks',ROOT/'scripts/qa/native-auth-session/inspect-original-diagnostic-stacks.py')
H = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(H)
START = datetime(2026,11,7,23,11,5,tzinfo=timezone.utc)
END = START + timedelta(seconds=48)
ACTORS = {('SpringBoard',90001,'/original/SpringBoard')}
STAMP = '2026-11-07 23:11:07.123000+0000'


def ips(**changes):
    body=dict(procName='SpringBoard',pid=90001,procPath='/original/SpringBoard',captureTime=STAMP,
              threads=[dict(id=1,frames=[dict(imageIndex=0,imageOffset=16)])])
    body.update(changes)
    return json.dumps(body).encode()


def crash(stamp=STAMP,name='SpringBoard',pid=90001,frames=True,sample=False):
    head=f'Process: {name} [{pid}]\nPath: /original/{name}\nDate/Time: {stamp}\n'
    if sample:
        return (head+'Call graph:\n    20 Thread_0x123 DispatchQueue_main\n'+
                ('      20 mach_msg_trap + 8 (libsystem_kernel.dylib) [0x1234]\n' if frames else '')).encode()
    return (head+'Thread 0 Crashed:\n'+('0 libsystem_kernel.dylib 0x1234 mach_msg_trap + 8\n'if frames else '')).encode()


@contextmanager
def fixture(scenario='native503'):
    reader=H.load_reader(scenario)
    with tempfile.TemporaryDirectory() as temp,ExitStack() as stack:
        root=Path(temp);private=root/reader.PRIVATE_NAME;private.mkdir();report=root/'report';report.mkdir()
        export=private/'diagnostics-export';export.mkdir()
        archive=export/'X/simctl_diagnostics'/reader.UDID/'system.logarchive';archive.mkdir(parents=True)
        (archive/'must-never-be-read.ips').write_bytes(ips())
        proof=(reader.SESSION+'\n'+reader.UDID+'\nsynthetic original Runner proof').encode()
        (export/'original-session.log').write_bytes(proof)
        if hasattr(reader,'RUNNER_LOG_SHA256'):
            stack.enter_context(patch.object(reader,'RUNNER_LOG_BYTES',len(proof)))
            stack.enter_context(patch.object(reader,'RUNNER_LOG_SHA256',hashlib.sha256(proof).hexdigest()))
        stamp=datetime.strptime(reader.START_UTC,'%Y-%m-%d %H:%M:%S')+timedelta(seconds=2)
        stamp=stamp.strftime('%Y-%m-%d %H:%M:%S')+'.123000+0000'
        items=[dict(timestamp=stamp,processImagePath='/original/'+name,processID=pid,eventMessage='synthetic original event')
               for name,pid in reader.TARGETS.items()]
        items.append(dict(timestamp=stamp,processImagePath='/original/SpringBoard',processID=90001,
                          eventMessage='synthetic original AX/service event',subsystem='com.apple.Accessibility'))
        raw=json.dumps(items).encode();command=private/'command-output';command.mkdir();(command/'log-show.stdout').write_bytes(raw)
        r=reader.ORIGINAL
        manifest=dict(status='AVAILABLE',sourceRunId=r.RUN_ID,sourceAttempt=1,sourceJobId=r.JOB_ID,
                      sourceArtifactId=r.ARTIFACT_ID,sourceSha=r.SOURCE_SHA,sourceTree=r.SOURCE_TREE,
                      originalSessionIdentifier=reader.SESSION,releaseAcceptance=False,
                      archive=dict(relativePath=archive.relative_to(export).as_posix()),
                      exportProvenance=dict(sourceRunId=r.RUN_ID,sourceJobId=r.JOB_ID,udid=reader.UDID,sessionIdentifier=reader.SESSION,
                          archiveRelativePath=archive.relative_to(export).as_posix(),runnerLogs=[dict(relativePath='original-session.log',bytes=len(proof),sha256=hashlib.sha256(proof).hexdigest())]),
                      commands=[dict(argv=['/usr/bin/xcrun','xcresulttool','export','diagnostics','--path',str(private/'extracted/result.xcresult'),'--output-path',str(export)],exitCode=0,timedOut=False,outputTruncated=False),
                                dict(argv=reader.log_show_argv(archive),exitCode=0,timedOut=False,outputTruncated=False,
                                     stdout=dict(bytes=len(raw),rawSha256=hashlib.sha256(raw).hexdigest()))])
        r.write_json(report/'system-log/manifest.json',manifest)
        r.write_json(report/'archive-validation.json',dict(archiveValidated=True,safeExtraction=True,archiveSha256=r.ZIP_SHA256))
        (private/'original.zip').write_bytes(b'synthetic ZIP; immutable validator is mocked explicitly')
        validation=stack.enter_context(patch.object(r,'validate_archive',return_value=dict(archiveValidated=True)))
        stack.enter_context(patch.object(H,'load_reader',return_value=reader))
        yield dict(reader=reader,private=private,report=report,export=export,archive=archive,manifest=manifest,
                   environment=dict(RUNNER_TEMP=str(root)),stamp=stamp,validation=validation)


def invoke(f):
    return H.inspect('native503',f['private'],f['report'],f['environment'])


class FormatControls(unittest.TestCase):
    def parse(self,raw,suffix='.ips'):
        return H.parse_report(raw,suffix,ACTORS,START,END)
    def test_public_ips_one_body_and_two_object_header_formats(self):
        self.assertEqual(self.parse(ips())['frames'],1)
        raw=json.dumps(dict(app_name='SpringBoard',pid=90001,timestamp='2026-11-07 23:11:07+0000')).encode()+b'\n'+ips()
        self.assertEqual(self.parse(raw)['process'],'SpringBoard')
    def test_single_process_crash_and_sample_have_actual_thread_frames(self):
        self.assertEqual(self.parse(crash(),'.crash')['frames'],1)
        self.assertEqual(self.parse(crash(sample=True),'.sample')['frames'],1)
    def test_header_only_call_graph_or_thread_never_provides_stack_evidence(self):
        for raw in [crash(frames=False),crash(frames=False,sample=True),ips(threads=[]),ips(threads=[dict(frames=[])])]:
            with self.subTest(raw=raw),self.assertRaises(ValueError):self.parse(raw,'.ips'if raw.startswith(b'{')else'.sample')
    def test_foreign_actor_name_pid_or_path_is_unavailable(self):
        for change in [dict(procName='foreign'),dict(pid=90002),dict(pid=True),dict(procPath='/foreign/SpringBoard')]:
            with self.subTest(change=change),self.assertRaises(ValueError):self.parse(ips(**change))
    def test_foreign_dates_timezone_and_window_edges_are_unavailable(self):
        for stamp in ['2026-11-06 23:11:07+0000','2026-11-07 23:11:04.999999+0000',
                      '2026-11-07 23:11:53+0000','2026-11-07 23:11:07+0200','2026-99-07 23:11:07+0000','unknown']:
            with self.subTest(stamp=stamp),self.assertRaises(ValueError):self.parse(ips(captureTime=stamp))
    def test_mixed_reports_or_conflicting_headers_are_unavailable(self):
        cases=[crash()+crash(),ips()+b'\n'+ips(),
               json.dumps(dict(app_name='foreign',pid=90001)).encode()+b'\n'+ips(),
               json.dumps(dict(app_name='SpringBoard',pid=90001,procPath='/foreign/SpringBoard')).encode()+b'\n'+ips(),
               json.dumps(dict(app_name='SpringBoard',pid=90001,timestamp='2026-11-07 23:11:08+0000')).encode()+b'\n'+ips()]
        for raw in cases:
            with self.subTest(raw=raw),self.assertRaises(ValueError):self.parse(raw,'.crash'if raw.startswith(b'Process')else'.ips')
    def test_binary_opaque_and_malformed_reports_are_not_parsed(self):
        for raw in [b'\x1f\x8b\xff',b'csviz0jgtm opaque',b'PK\x00fake',b'{',b'[]',ips()+b'junk']:
            with self.subTest(raw=raw),self.assertRaises(ValueError):self.parse(raw)
    def test_supported_filename_markers_do_not_expand_into_generic_log_parsing(self):
        for name in ['SpringBoard.ips','SpringBoard.crash','SpringBoard.hang','spindump.txt','SpringBoard.sample.txt']:
            self.assertTrue(H.candidate(Path(name)),name)
        self.assertFalse(H.candidate(Path('ordinary.log')))


class BindingAndInventoryControls(unittest.TestCase):
    def test_both_fixed_originals_preserve_only_sanitized_matching_stack_text(self):
        for scenario in ['auth79','native503']:
            with self.subTest(scenario=scenario),fixture(scenario) as f:
                raw=ips(captureTime=f['stamp'],note='https://example.invalid/path?token=private')
                (f['export']/'SpringBoard.ips').write_bytes(raw)
                m=H.inspect(scenario,f['private'],f['report'],f['environment'])
                f['validation'].assert_called_once_with(f['private']/'original.zip')
                self.assertEqual(m['status'],'MATCHING_STACK_TEXT');self.assertTrue(m['stackEvidenceAvailable'])
                self.assertEqual(len(m['matches']),1);self.assertEqual(len(m['excludedLogarchives']),1)
                kept=(f['report']/'diagnostic-stacks'/m['matches'][0]['publishedFile']).read_bytes()
                self.assertNotIn(b'https://',kept);self.assertNotIn(b'token=private',kept)
                row=next(r for r in m['inventory']if r['relativePath']=='SpringBoard.ips')
                self.assertEqual(row['sha256'],hashlib.sha256(raw).hexdigest())
                self.assertFalse(m['releaseAcceptance']);self.assertFalse(m['newAppOrXCTestRun'])
    def test_no_matching_report_is_explicit_and_never_proves_absence(self):
        with fixture() as f:
            m=invoke(f)
            self.assertEqual(m['status'],'NO_VALIDATED_STACKS');self.assertFalse(m['stackEvidenceAvailable'])
            self.assertFalse(m['stacksProvenAbsent']);self.assertEqual(m['matches'],[])
    def test_ambiguous_binary_missing_frames_and_foreign_reports_are_inventoried_not_preserved(self):
        with fixture() as f:
            for name,raw in [('foreign.ips',ips(pid=99999)),('binary.ips',b'\x00\xff'),('header.sample',crash(frames=False,sample=True)),
                             ('outside.crash',crash(stamp='2026-11-07 23:11:54+0000'))]:
                (f['export']/name).write_bytes(raw)
            m=invoke(f);self.assertEqual(m['matches'],[])
            self.assertEqual(sum(r.get('result')=='UNAVAILABLE_FORMAT_OR_SCOPE'for r in m['inventory']),4)
            self.assertEqual(list((f['report']/'diagnostic-stacks').glob('stack-*.txt')),[])
    def test_logarchive_contents_are_never_read_or_inventoried(self):
        with fixture() as f:
            original=H.bounded_bytes
            def read(path,cap):
                self.assertNotIn('system.logarchive',path.parts)
                return original(path,cap)
            with patch.object(H,'bounded_bytes',side_effect=read):m=invoke(f)
            self.assertFalse(any('must-never' in r['relativePath']for r in m['inventory']))
    def test_logarchive_named_files_are_also_excluded(self):
        with fixture() as f:
            (f['export']/'extra.logarchive').write_bytes(b'opaque data; must not be read')
            m=invoke(f)
            self.assertIn('extra.logarchive',m['excludedLogarchives'])
            self.assertFalse(any(r['relativePath']=='extra.logarchive'for r in m['inventory']))
    def test_zip_validation_failure_prevents_export_scan(self):
        with fixture() as f:
            f['validation'].side_effect=f['reader'].ORIGINAL.EvidenceError('synthetic wrong ZIP')
            with patch.object(H.os,'walk') as walk,self.assertRaises(H.StackError):invoke(f)
            walk.assert_not_called()
            m=json.loads((f['report']/'diagnostic-stacks/manifest.json').read_text(encoding='utf-8'))
            self.assertFalse(m['inventoryComplete']);self.assertFalse(m['stackEvidenceAvailable'])
    def test_foreign_missing_or_incomplete_reader_binding_prevents_scan(self):
        for field,value in [('sourceRunId',0),('sourceAttempt',True),('originalSessionIdentifier','foreign'),('status','UNAVAILABLE'),('releaseAcceptance',True)]:
            with self.subTest(field=field),fixture() as f:
                f['manifest'][field]=value;f['reader'].ORIGINAL.write_json(f['report']/'system-log/manifest.json',f['manifest'])
                with patch.object(H.os,'walk') as walk,self.assertRaises(H.StackError):invoke(f)
                walk.assert_not_called()
    def test_export_query_or_session_proof_changes_are_rejected(self):
        for mode in ['export-cap','query-timeout','query-hash','runner-hash','runner-session','wrong-archive','proof-in-archive','malformed-proof','foreign-event']:
            with self.subTest(mode=mode),fixture() as f:
                m=f['manifest']
                if mode=='export-cap':m['commands'][0]['outputTruncated']=True
                if mode=='query-timeout':m['commands'][1]['timedOut']=True
                if mode=='query-hash':m['commands'][1]['stdout']['rawSha256']='0'*64
                if mode=='runner-hash':m['exportProvenance']['runnerLogs'][0]['sha256']='0'*64
                if mode=='runner-session':m['exportProvenance']['sessionIdentifier']='foreign'
                if mode=='wrong-archive':m['archive']['relativePath']='../foreign'
                if mode=='proof-in-archive':m['exportProvenance']['runnerLogs'][0]['relativePath']=f['archive'].relative_to(f['export']).as_posix()+'/must-never-be-read.ips'
                if mode=='malformed-proof':m['exportProvenance']['runnerLogs'][0]=None
                if mode=='foreign-event':
                    p=f['private']/'command-output/log-show.stdout';items=json.loads(p.read_text());items[-1]['processID']=10072
                    raw=json.dumps(items).encode();p.write_bytes(raw);m['commands'][1]['stdout']=dict(bytes=len(raw),rawSha256=hashlib.sha256(raw).hexdigest())
                f['reader'].ORIGINAL.write_json(f['report']/'system-log/manifest.json',m)
                with patch.object(H.os,'walk') as walk,self.assertRaises(H.StackError):invoke(f)
                walk.assert_not_called()
    def test_symlink_inside_export_is_rejected_before_file_read(self):
        with fixture() as f:
            blocked=f['export']/'fake-link.ips';blocked.write_bytes(ips());original=Path.is_symlink
            with patch.object(Path,'is_symlink',lambda p:p==blocked or original(p)),self.assertRaises(H.StackError):invoke(f)
            m=json.loads((f['report']/'diagnostic-stacks/manifest.json').read_text(encoding='utf-8'))
            self.assertFalse(m['stackEvidenceAvailable'])
    def test_file_byte_aggregate_and_count_caps_never_supply_availability(self):
        for cap in ['MAX_FILES','MAX_ENTRIES','MAX_FILE_BYTES','MAX_TOTAL_BYTES']:
            with self.subTest(cap=cap),fixture() as f:
                (f['export']/'SpringBoard.ips').write_bytes(ips(captureTime=f['stamp']))
                with patch.object(H,cap,0),self.assertRaises(H.StackError):invoke(f)
                m=json.loads((f['report']/'diagnostic-stacks/manifest.json').read_text(encoding='utf-8'))
                self.assertFalse(m['inventoryComplete']);self.assertFalse(m['stackEvidenceAvailable'])
    def test_unknown_scenario_or_cli_cannot_supply_ids_or_run_commands(self):
        for scenario in ['latest','other','42422409530']:
            with self.subTest(scenario=scenario),self.assertRaises(H.StackError):H.load_reader(scenario)
        for command in ['run','download','collect','test']:
            with self.subTest(command=command),self.assertRaises(H.StackError):H.main(['tool',command,'native503','x','y'])


class WorkflowControls(unittest.TestCase):
    def test_only_one_first_push_workflow_adds_scan_after_the_same_original_readers(self):
        text=(ROOT/'.github/workflows/ios-original-stack-inventory-20261108.yml').read_text(encoding='utf-8')
        for value in ['github.event.created == true','github.event.deleted == false','github.event.forced == false',
                      'github.run_attempt == 1','github.run_number == 1','persist-credentials: false']:
            self.assertEqual(text.count(value),2,value)
        self.assertIn('branches: [codex/ios-original-stack-inventory-20261108]',text)
        for scenario in ['auth79','native503']:self.assertIn('inspect-original-diagnostic-stacks.py inspect '+scenario,text)
        self.assertIn('inspect-auth79-ax-services.py inspect',text);self.assertIn('inspect-native503-home-log.py inspect',text)
        for value in ['workflow_dispatch:','pull_request:','continue-on-error','xcodebuild ','simctl ','sudo ',
                      '--method POST','--method PATCH','--method PUT','--method DELETE']:self.assertNotIn(value,text)
        config=json.loads((ROOT/'vercel.json').read_text(encoding='utf-8'))
        self.assertFalse(config['git']['deploymentEnabled']['codex/ios-original-stack-inventory-20261108'])


if __name__=='__main__':unittest.main(verbosity=2)
