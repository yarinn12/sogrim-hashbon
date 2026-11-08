"""Synthetic original-archive AX service scope controls, never an App test."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('auth79_ax_services',ROOT/'scripts/qa/native-auth-session/inspect-auth79-ax-services.py')
D = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(D)
SPEC_OLD = importlib.util.spec_from_file_location('auth79_original_test_helpers',ROOT/'tests/ios_auth79_daemon_log_test.py')
LEGACY = importlib.util.module_from_spec(SPEC_OLD)
SPEC_OLD.loader.exec_module(LEGACY)
OLD = LEGACY.D
ARCHIVE = LEGACY.ARCHIVE
BRANCH = 'codex/ios-auth79-ax-services-20261108'


def event(name='testmanagerd',pid=None,subsystem='com.apple.dt.xctest'):
    return dict(timestamp='2026-11-07 23:02:45.435000+0000',processImagePath='/owned/'+name,
                processID=D.TARGETS.get(name,90001) if pid is None else pid,
                eventMessage='synthetic AX service event; no causal verdict',subsystem=subsystem)


def ax_event(**changes):
    item=event('AXService',subsystem='com.apple.Accessibility.AXSupport')
    item.update(changes)
    return item


def payload(events=None,footer=False):
    raw=json.dumps([ax_event()] if events is None else events).encode()
    return raw+(('==========\n'+ARCHIVE+'\n==========\n').encode() if footer else b'')


class IdentityControls(unittest.TestCase):
    def test_same_frozen_original_identity_and_private_module_isolation(self):
        for key in ['RUN_ID','JOB_ID','ARTIFACT_ID','SOURCE_SHA','SOURCE_TREE','ZIP_BYTES','ZIP_SHA256']:
            self.assertEqual(getattr(D.ORIGINAL,key),getattr(OLD.ORIGINAL,key),key)
        self.assertEqual(D.SESSION,OLD.SESSION)
        self.assertEqual(D.UDID,OLD.UDID)
        self.assertEqual(D.TARGETS,{'AuthProbeUITests-Runner':35064,'testmanagerd':34398})
        self.assertNotIn('BEGINSWITH',OLD.PREDICATE)
        self.assertEqual(OLD.PRIVATE_NAME,'auth79-daemon-log-private')
        self.assertEqual(D.PRIVATE_NAME,'auth79-ax-services-private')
    def test_bounds_and_utc_window_are_unchanged(self):
        for key in ['MAX_ARCHIVE_FILES','MAX_ARCHIVE_BYTES','MAX_ARCHIVE_FILE_BYTES','HELP_BYTES',
                    'EXPORT_STDOUT_BYTES','LOG_STDOUT_BYTES','STDERR_BYTES','HELP_SECONDS','EXPORT_SECONDS',
                    'LOG_SECONDS','MAX_PROOF_FILES','MAX_PROOF_BYTES','MAX_PROOF_FILE','START_UTC','END_UTC']:
            self.assertEqual(getattr(D,key),getattr(OLD,key),key)
        for key in ['MAX_MEMBERS','MAX_ENTRY','MAX_UNCOMPRESSED']:
            self.assertEqual(getattr(D.ORIGINAL,key),getattr(OLD.ORIGINAL,key),key)
    def test_exact_query_adds_only_case_insensitive_ax_namespace(self):
        self.assertEqual(D.PREDICATE,'('+OLD.PREDICATE+' OR subsystem BEGINSWITH[c] "com.apple.Accessibility")')
        with tempfile.TemporaryDirectory() as temp:
            _,archive=LEGACY.ArchiveAndQueryControls().fixture(temp)
            argv=D.log_show_argv(archive)
            D.validate_command(argv)
            old=OLD.log_show_argv(archive)
            self.assertEqual(argv[:argv.index('--predicate')+1],old[:old.index('--predicate')+1])
            self.assertEqual(argv[argv.index('--timezone'):],old[old.index('--timezone'):])
            self.assertEqual(argv[-1],str(archive))
    def test_changed_scope_time_archive_or_live_command_cannot_run(self):
        with tempfile.TemporaryDirectory() as temp:
            _,archive=LEGACY.ArchiveAndQueryControls().fixture(temp)
            good=D.log_show_argv(archive)
            for bad in [OLD.log_show_argv(archive),['/usr/bin/log','stream'],['xcodebuild','test'],
                        [v.replace('23:02:21','23:02:20') for v in good],
                        [v.replace('35064','35065') for v in good],good[:-1]+['/tmp/system.logarchive'],
                        [v.replace('com.apple.Accessibility','foreign') for v in good]]:
                with self.subTest(argv=bad),self.assertRaises(D.InspectionError):D.validate_command(bad)
    def test_generic_cli_and_foreign_archive_identity_still_rejected(self):
        for command in ['run','download','test','stream']:
            with self.subTest(command=command),self.assertRaises(D.InspectionError):D.main(['tool',command,'x','y'])
        for archive in [None,'/foreign/system.logarchive',ARCHIVE.replace(D.UDID,LEGACY.OLD.UDID)]:
            with self.subTest(archive=archive):
                self.assertEqual(D.output_status(0,payload(),False,False,archive),'UNAVAILABLE_EVENT_SCOPE_OR_FORMAT')


class EventControls(unittest.TestCase):
    def status(self,raw,**changes):
        args=dict(exit_code=0,stdout=raw,timed_out=False,truncated=False,expected_archive=ARCHIVE)
        args.update(changes)
        return D.output_status(**args)
    def test_new_ax_actor_is_available_without_changing_old_reader(self):
        raw=payload([event(),event('AuthProbeUITests-Runner'),ax_event()],footer=True)
        self.assertEqual(OLD.output_status(0,raw,False,False,ARCHIVE),'UNAVAILABLE_EVENT_SCOPE_OR_FORMAT')
        self.assertEqual(self.status(raw),'AVAILABLE')
        self.assertEqual(D.verified_events(raw,ARCHIVE)[2],ax_event())
    def test_original_actor_scope_does_not_require_ax_subsystem(self):
        items=[event(),event('AuthProbeUITests-Runner')]
        del items[0]['subsystem']
        self.assertEqual(self.status(payload(items)),'AVAILABLE')
    def test_ax_namespace_match_is_beginswith_and_case_insensitive(self):
        for subsystem in ['com.apple.Accessibility','COM.APPLE.ACCESSIBILITY.AXSupport','com.apple.Accessibility.AXRuntime']:
            with self.subTest(subsystem=subsystem):
                self.assertEqual(self.status(payload([ax_event(subsystem=subsystem)])),'AVAILABLE')
    def test_foreign_namespace_never_admits_an_additional_actor(self):
        for subsystem in ['com.apple.dt.xctest','foreign.com.apple.Accessibility','com.apple.Accessibilit',None,7,'']:
            with self.subTest(subsystem=subsystem):
                self.assertEqual(self.status(payload([ax_event(subsystem=subsystem)])),'UNAVAILABLE_EVENT_SCOPE_OR_FORMAT')
    def test_known_names_require_exact_original_pids_even_in_ax_namespace(self):
        for name in D.TARGETS:
            for pid in [90001,True,0,-1,'35064']:
                with self.subTest(name=name,pid=pid):
                    bad=event(name,pid=pid,subsystem=D.AX_NAMESPACE)
                    self.assertEqual(self.status(payload([bad])),'UNAVAILABLE_EVENT_SCOPE_OR_FORMAT')
    def test_known_pids_require_exact_original_names_even_in_ax_namespace(self):
        for pid in D.TARGETS.values():
            with self.subTest(pid=pid):
                self.assertEqual(self.status(payload([ax_event(processID=pid)])),'UNAVAILABLE_EVENT_SCOPE_OR_FORMAT')
    def test_additional_actor_requires_complete_valid_event_structure(self):
        for key in ['timestamp','processImagePath','processID','eventMessage','subsystem']:
            with self.subTest(missing=key):
                item=ax_event();del item[key]
                self.assertEqual(self.status(payload([item])),'UNAVAILABLE_EVENT_SCOPE_OR_FORMAT')
        changes=[('processID',True),('processID',0),('processID',-1),('processID','90001'),
                 ('processImagePath','AXService'),('processImagePath','/'),('processImagePath','/owned/'),
                 ('processImagePath','/owned/..'),('processImagePath','/owned/AX\0Service'),
                 ('eventMessage',' '),('eventMessage',None)]
        for key,value in changes:
            with self.subTest(key=key,value=value):
                self.assertEqual(self.status(payload([ax_event(**{key:value})])),'UNAVAILABLE_EVENT_SCOPE_OR_FORMAT')
    def test_additional_actor_requires_fixed_original_utc_date_and_window(self):
        for stamp in ['2026-11-06 23:02:45.000000+0000','2026-11-07 23:02:20.999999+0000',
                      '2026-11-07 23:03:54.000000+0000','2026-11-07 23:02:45.000000+0200',
                      '2026-99-07 23:02:45.000000+0000','bad']:
            with self.subTest(stamp=stamp):
                self.assertEqual(self.status(payload([ax_event(timestamp=stamp)])),'UNAVAILABLE_EVENT_SCOPE_OR_FORMAT')
    def test_one_foreign_or_incomplete_event_rejects_entire_output(self):
        for bad in [None,{},ax_event(subsystem='foreign'),ax_event(processID=35064)]:
            with self.subTest(bad=bad):self.assertNotEqual(self.status(payload([event(),ax_event(),bad])),'AVAILABLE')
    def test_inherited_json_footer_gate_stays_exact(self):
        good=payload(footer=True)
        for raw in [b'[',good[:-1],good+b'junk',good.replace(ARCHIVE.encode(),b'/foreign'),payload()+b'\n==========\n']:
            with self.subTest(raw=raw):self.assertNotEqual(self.status(raw),'AVAILABLE')
    def test_inherited_status_distinguishes_timeout_cap_failure_and_empty(self):
        self.assertEqual(self.status(payload(),timed_out=True),'INCOMPLETE_TIMEOUT')
        self.assertEqual(self.status(payload(),truncated=True),'INCOMPLETE_OUTPUT_CAP')
        self.assertEqual(self.status(payload(),exit_code=1),'UNAVAILABLE_COMMAND_FAILED')
        for raw in [b'',b'\n',b'[]']:
            with self.subTest(raw=raw):self.assertEqual(self.status(raw),'EMPTY')
    def test_known_ndjson_and_object_envelopes_keep_scope_checks(self):
        for raw in [(json.dumps(ax_event())+'\n'+json.dumps(event())).encode(),
                    json.dumps(ax_event()).encode(),json.dumps(dict(events=[ax_event()])).encode()]:
            with self.subTest(raw=raw):self.assertEqual(self.status(raw),'AVAILABLE')
    def test_notification_content_does_not_determine_availability_or_cause(self):
        for message in ['3031','Did not post. Not allowed.','synthetic service activity']:
            with self.subTest(message=message):
                self.assertEqual(self.status(payload([ax_event(eventMessage=message)])),'AVAILABLE')


class FullInspectionControls(unittest.TestCase):
    def invoke(self,**options):
        with patch.object(LEGACY,'D',D),patch.object(LEGACY,'R',D.ORIGINAL):
            return LEGACY.FullInspectionControls().invoke(**options)
    def test_same_bounded_original_sequence_can_include_ax_service_actor(self):
        with patch.object(LEGACY,'payload',return_value=payload([event(),event('AuthProbeUITests-Runner'),ax_event()])):
            error,manifest,seen=self.invoke()
        self.assertIsNone(error)
        self.assertEqual(manifest['status'],'AVAILABLE')
        self.assertEqual([row[0] for row in seen],['xcresult-version','xcresult-export-help','xcresult-export','log-help-show','log-show'])
        self.assertEqual(seen[-1][2:],(OLD.LOG_SECONDS,OLD.LOG_STDOUT_BYTES,OLD.STDERR_BYTES))
        self.assertEqual(manifest['sourceRunId'],42422409479)
        self.assertEqual(manifest['sourceArtifactId'],13594830607)
        self.assertEqual(manifest['exportProvenance']['sessionIdentifier'],OLD.SESSION)
        self.assertEqual(manifest['additionalActorSubsystemPrefix'],D.AX_NAMESPACE)
        for key in ['releaseAcceptance','newAppOrXCTestRun','originalTestPassed','causeDetermined','productCauseProven','readinessAccepted']:
            self.assertFalse(manifest[key],key)
    def test_failure_scope_and_original_provenance_stay_in_retained_manifest(self):
        for state,expected in [('timeout','INCOMPLETE_TIMEOUT'),('cap','INCOMPLETE_OUTPUT_CAP'),
                               ('foreign','UNAVAILABLE_EVENT_SCOPE_OR_FORMAT'),('empty','EMPTY')]:
            with self.subTest(state=state):
                error,manifest,_=self.invoke(query_state=state)
                self.assertIsNotNone(error)
                self.assertEqual(manifest['status'],expected)
                self.assertEqual(manifest['additionalActorSubsystemPrefix'],D.AX_NAMESPACE)
                self.assertFalse(manifest['newAppOrXCTestRun'])
                self.assertFalse(manifest['productCauseProven'])
    def test_foreign_metadata_or_archive_never_queries_a_fallback(self):
        for options in [dict(bad_metadata=True),dict(wrong_archive=True),dict(missing_runner=True)]:
            with self.subTest(options=options):
                error,_,seen=self.invoke(**options)
                self.assertIsNotNone(error)
                self.assertNotIn('log-show',[row[0] for row in seen])


class WorkflowControls(unittest.TestCase):
    def test_unique_first_branch_creation_is_read_only_and_pins_same_source(self):
        text=(ROOT/'.github/workflows/ios-auth79-ax-services-20261108.yml').read_text(encoding='utf8')
        for value in [BRANCH,'github.event.created == true','github.event.deleted == false','github.event.forced == false',
                      'github.run_attempt == 1','github.run_number == 1','runs-on: macos-26-intel','Xcode_26.6.app',
                      'contents: read','actions: read','persist-credentials: false',str(D.ORIGINAL.RUN_ID),
                      str(D.ORIGINAL.JOB_ID),str(D.ORIGINAL.ARTIFACT_ID),'newAppOrXCTestRun',
                      'inspect-auth79-original.py','inspect-auth79-ax-services.py']:
            self.assertIn(value,text)
        for value in ['workflow_dispatch:','pull_request:','continue-on-error','npm ','xcodebuild ','simctl ',
                      'log stream','--method POST','--method PATCH','--method PUT','--method DELETE','sudo ']:
            self.assertNotIn(value,text)
        self.assertEqual(text.count('gh api --method GET'),2)
        config=json.loads((ROOT/'vercel.json').read_text(encoding='utf8'))
        self.assertFalse(config['git']['deploymentEnabled'][BRANCH])


if __name__=='__main__':unittest.main(verbosity=2)
