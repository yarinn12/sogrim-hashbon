"""Synthetic-only Auth79 adapter, archive, scope and failure controls."""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('auth79_daemon',ROOT/'scripts/qa/native-auth-session/inspect-auth79-daemon-log.py')
D = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(D)
R = D.ORIGINAL
OLD = D.load('auth76_untouched_control','inspect-original-system-log.py')
ARCHIVE = '/private/auth79/diagnostics-export/X/simctl_diagnostics/'+D.UDID+'/system.logarchive'


def metadata():
    repo=dict(id=R.REPO_ID,full_name=R.REPO,fork=False)
    run=dict(id=R.RUN_ID,repository=copy.deepcopy(repo),head_repository=copy.deepcopy(repo),head_sha=R.SOURCE_SHA,
             head_branch=R.SOURCE_BRANCH,path=R.SOURCE_WORKFLOW,event='pull_request',run_attempt=1,status='completed',conclusion='failure')
    job=dict(id=R.JOB_ID,run_id=R.RUN_ID,run_attempt=1,head_sha=R.SOURCE_SHA,head_branch=R.SOURCE_BRANCH,name='native',status='completed',conclusion='failure')
    artifact=dict(id=R.ARTIFACT_ID,name=R.ARTIFACT_NAME,size_in_bytes=R.ZIP_BYTES,expired=False,digest='sha256:'+R.ZIP_SHA256,
                  workflow_run=dict(id=R.RUN_ID,repository_id=R.REPO_ID,head_repository_id=R.REPO_ID,head_branch=R.SOURCE_BRANCH,head_sha=R.SOURCE_SHA))
    return dict(repo=repo,run=run,job=job,attempt_jobs=dict(total_count=1,jobs=[copy.deepcopy(job)]),artifact=artifact,
                run_artifacts=dict(total_count=1,artifacts=[copy.deepcopy(artifact)]))


def event(name='testmanagerd'):
    return dict(timestamp='2026-11-07 23:02:45.435000+0000',processImagePath='/owned/'+name,
                processID=D.TARGETS[name],eventMessage='synthetic AX loading event',subsystem='com.apple.dt.xctest')


def payload(events=None,footer=False):
    raw=json.dumps([event()] if events is None else events).encode()
    return raw+(('==========\n'+ARCHIVE+'\n==========\n').encode() if footer else b'')


class IdentityControls(unittest.TestCase):
    def test_exact_identity_and_auth76_module_isolation(self):
        self.assertEqual((R.RUN_ID,R.JOB_ID,R.ARTIFACT_ID,R.ZIP_BYTES),(42422409479,128553466429,13594830607,62833001))
        self.assertEqual(R.ZIP_SHA256,'613af51c8e16ecbd0d662663ed1a77c69eb2e99e1a0e2079a07fee771cb725af')
        self.assertEqual(R.SOURCE_SHA,'b19b57ec071ab0fbd3cd799b217198ccfd013a75')
        self.assertEqual(R.SOURCE_TREE,'a54f15852c16ad7b9c2b04b8d632b93599d0419f')
        self.assertEqual(OLD.ORIGINAL.RUN_ID,42396343370)
        self.assertEqual(OLD.UDID,'DD0F04E6-F694-4A74-AB2C-70453176B7BB')
        self.assertNotEqual(OLD.PREDICATE,D.PREDICATE)
        result=R.validate_metadata(metadata());self.assertTrue(result['metadataValidated'])
        self.assertEqual(result['sourceRunId'],42422409479);self.assertFalse(result['releaseAcceptance'])
    def test_old_or_foreign_metadata_is_rejected(self):
        changes=[('repo','fork',True),('repo','id',7),('run','id',42396343370),('run','head_sha','0'*40),
                 ('run','head_branch','foreign'),('run','event','workflow_dispatch'),('run','path','other.yml'),
                 ('run','run_attempt',2),('run','conclusion','success'),('job','id',7),('job','run_id',7),
                 ('job','run_attempt',2),('job','head_sha','0'*40),('job','name','other'),('job','status','queued'),
                 ('artifact','id',13584775403),('artifact','digest','sha256:'+'0'*64),('artifact','expired',True),
                 ('artifact','size_in_bytes',R.ZIP_BYTES+1)]
        for section,key,value in changes:
            with self.subTest(section=section,key=key),self.assertRaises(R.EvidenceError):
                data=metadata();data[section][key]=value;R.validate_metadata(data)
    def test_attempt_membership_and_artifact_link_stay_required(self):
        for change in [lambda d:d['attempt_jobs']['jobs'].clear(),lambda d:d['attempt_jobs']['jobs'].append(d['job']),
                       lambda d:d['run_artifacts']['artifacts'].clear(),lambda d:d['artifact']['workflow_run'].update(head_sha='0'*40),
                       lambda d:d['run']['head_repository'].update(fork=True)]:
            with self.subTest(change=change),self.assertRaises(R.EvidenceError):
                data=metadata();change(data);R.validate_metadata(data)
    def test_generic_result_inspect_and_unknown_cli_are_forbidden(self):
        for command in ['inspect','run','download','test']:
            with self.subTest(command=command),self.assertRaises(R.EvidenceError):R.main(['tool',command,'x','y'])
    def test_archive_byte_and_hash_checks_are_real(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'original.zip';path.write_bytes(b'synthetic original')
            with self.assertRaises(R.EvidenceError):R.validate_archive(path)
            with patch.object(R.ORIGINAL,'ZIP_BYTES',len(b'synthetic original')),patch.object(R.ORIGINAL,'ZIP_SHA256',hashlib.sha256(b'synthetic original').hexdigest()):
                self.assertTrue(R.validate_archive(path)['archiveValidated'])
                path.write_bytes(b'x'*len(b'synthetic original'))
                with self.assertRaisesRegex(R.EvidenceError,'sha256'):R.validate_archive(path)
    def test_all_existing_bounds_are_preserved(self):
        for key in ['MAX_ARCHIVE_FILES','MAX_ARCHIVE_BYTES','MAX_ARCHIVE_FILE_BYTES','HELP_BYTES','EXPORT_STDOUT_BYTES',
                    'LOG_STDOUT_BYTES','STDERR_BYTES','HELP_SECONDS','EXPORT_SECONDS','LOG_SECONDS']:
            self.assertEqual(getattr(D,key),getattr(OLD,key),key)
        for key in ['MAX_MEMBERS','MAX_ENTRY','MAX_UNCOMPRESSED']:
            self.assertEqual(getattr(R,key),getattr(OLD.ORIGINAL,key),key)


class ArchiveAndQueryControls(unittest.TestCase):
    def fixture(self,root,udid=None):
        export=Path(root)/'diagnostics-export'
        archive=export/'X/simctl_diagnostics'/(udid or D.UDID)/'system.logarchive'
        archive.mkdir(parents=True);(archive/'data.bin').write_bytes(b'synthetic archive')
        (export/'arbitrary-runner-proof-name.txt').write_text('\n'.join([
            'Xcode version: 26.6 (17F113)','Beginning test session AuthProbeUITests-'+D.SESSION,
            D.UDID,'AuthProbeUITests-Runner[35064:100517]','XCTDaemonErrorDomain Code=18',
            'Timed out waiting for AX loaded notification']),encoding='utf8')
        return export,archive
    def test_exact_original_archive_udid_and_fingerprint(self):
        with tempfile.TemporaryDirectory() as temp:
            export,archive=self.fixture(temp)
            self.assertEqual(D.select_archive(export),archive)
            self.assertEqual(D.EXPORT_PROOF['runnerPid'],35064)
            self.assertEqual(D.EXPORT_PROOF['archiveRelativePath'],archive.relative_to(export).as_posix())
            self.assertEqual(D.fingerprint_archive(archive)['bytes'],len(b'synthetic archive'))
            wrong,_=self.fixture(Path(temp)/'wrong',OLD.UDID)
            with self.assertRaises(D.InspectionError):D.select_archive(wrong)
    def test_duplicate_archive_and_symlink_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            export,archive=self.fixture(temp)
            with patch.object(Path,'is_symlink',return_value=True),self.assertRaises(D.InspectionError):D.select_archive(export)
            extra=export/'Y/simctl_diagnostics'/D.UDID/'system.logarchive';extra.mkdir(parents=True)
            with self.assertRaises(D.InspectionError):D.select_archive(export)
    def test_query_is_exact_original_utc_ax_window_and_two_pids(self):
        with tempfile.TemporaryDirectory() as temp:
            _,archive=self.fixture(temp);argv=D.log_show_argv(archive);D.validate_command(argv)
            self.assertEqual(argv[-1],str(archive));self.assertNotIn('--archive',argv);self.assertNotIn('--last',argv)
            self.assertEqual(argv[argv.index('--start')+1],'2026-11-07 23:02:21+0000')
            self.assertEqual(argv[argv.index('--end')+1],'2026-11-07 23:03:54+0000')
            self.assertIn('processID == 35064',D.PREDICATE);self.assertIn('processID == 34398',D.PREDICATE)
            self.assertNotIn('subsystem !=',D.PREDICATE);self.assertNotIn('Safari',D.PREDICATE)
    def test_all_live_or_changed_commands_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            _,archive=self.fixture(temp);good=D.log_show_argv(archive)
            bad=[['xcodebuild','test'],['/usr/bin/log','stream'],['/usr/bin/log','show','--last','5m'],
                 ['/usr/bin/xcrun','simctl','boot','x'],['/usr/bin/xcrun','simctl','spawn','x','log','show'],
                 good[:-1],good[:-1]+['/tmp/system.logarchive'],[x.replace('35064','35065') for x in good],
                 [x.replace('23:02:21','23:02:20') for x in good]]
            for argv in bad:
                with self.subTest(argv=argv),self.assertRaises(D.InspectionError):D.validate_command(argv)
    def test_known_native_help_stderr_format_stays_supported(self):
        text=(ROOT/'tests/fixtures/auth76/log-help-show-macos26.6.1.stderr.txt').read_text(encoding='utf8')
        self.assertTrue(D.validate_log_help_result(dict(exitCode=64,timedOut=False,outputTruncated=False),text))
        with self.assertRaises(D.InspectionError):D.validate_log_help_result(dict(exitCode=64,timedOut=True,outputTruncated=False),text)
    def test_clean_environment_drops_tokens(self):
        env=D.clean_environment(dict(PATH='/bin',HOME='/owned',DEVELOPER_DIR='/Xcode',GH_TOKEN='private',GITHUB_TOKEN='private',AWS_SECRET_ACCESS_KEY='private'))
        self.assertNotIn('GH_TOKEN',env);self.assertNotIn('GITHUB_TOKEN',env);self.assertNotIn('AWS_SECRET_ACCESS_KEY',env)
        self.assertEqual(env['TZ'],'UTC')
    def test_archive_requires_matching_original_runner_and_session(self):
        for token in [D.SESSION,D.UDID,'35064','XCTDaemonErrorDomain Code=18','26.6 (17F113)']:
            with self.subTest(token=token),tempfile.TemporaryDirectory() as temp:
                export,_=self.fixture(temp);path=export/'arbitrary-runner-proof-name.txt'
                path.write_text(path.read_text(encoding='utf8').replace(token,'foreign'),encoding='utf8')
                with self.assertRaisesRegex(D.InspectionError,'runner/session'):D.select_archive(export)
                self.assertIsNone(D.EXPORT_PROOF)
    def test_runner_proof_caps_cannot_be_ignored(self):
        with tempfile.TemporaryDirectory() as temp:
            export,_=self.fixture(temp)
            with patch.object(D,'MAX_PROOF_BYTES',1),self.assertRaises(D.InspectionError):D.select_archive(export)


class OutputControls(unittest.TestCase):
    def status(self,raw,**changes):
        args=dict(exit_code=0,stdout=raw,timed_out=False,truncated=False,expected_archive=ARCHIVE);args.update(changes)
        return D.output_status(**args)
    def test_valid_current_runner_and_daemon_events_are_available(self):
        self.assertEqual(self.status(payload([event(),event('AuthProbeUITests-Runner')])),'AVAILABLE')
        self.assertEqual(len(D.verified_events(payload(footer=True),ARCHIVE)),1)
        self.assertEqual(self.status(payload(footer=True)),'AVAILABLE')
    def test_new_scope_guard_rejects_old_counter_only_acceptance(self):
        for bad in [dict(timestamp='2026-11-07 23:02:45.435000+0000'),{**event(),'processID':999},
                    {**event(),'processImagePath':'/owned/Other'}]:
            with self.subTest(bad=bad):
                raw=payload([bad])
                self.assertEqual(D.RAW_STATUS(0,raw,False,False,expected_archive=ARCHIVE),'AVAILABLE')
                self.assertEqual(self.status(raw),'UNAVAILABLE_EVENT_SCOPE_OR_FORMAT')
    def test_plain_json_still_requires_auth79_archive_identity(self):
        for archive in [None,'/foreign/system.logarchive',ARCHIVE.replace(D.UDID,OLD.UDID)]:
            with self.subTest(archive=archive):
                self.assertEqual(self.status(payload(),expected_archive=archive),'UNAVAILABLE_EVENT_SCOPE_OR_FORMAT')
    def test_foreign_time_pid_message_and_timezone_never_supply_availability(self):
        mutations=[('timestamp','2026-11-07 23:02:20.999999+0000'),('timestamp','2026-11-07 23:03:54.000000+0000'),
                   ('timestamp','2026-11-07 23:02:46.000000+0200'),('timestamp','bad'),('timestamp','2026-99-07 23:02:46.000000+0000'),
                   ('processID',True),('processID',35064),('eventMessage',''),('processImagePath','testmanagerd')]
        for key,value in mutations:
            with self.subTest(key=key,value=value):
                item=event();item[key]=value;self.assertEqual(self.status(payload([item])),'UNAVAILABLE_EVENT_SCOPE_OR_FORMAT')
    def test_partial_json_and_foreign_footer_remain_unavailable(self):
        good=payload(footer=True)
        for raw in [b'[',good[:-1],good+b'junk',good.replace(ARCHIVE.encode(),b'/foreign'),payload()+b'\n==========\n']:
            with self.subTest(raw=raw):self.assertNotEqual(self.status(raw),'AVAILABLE')
    def test_timeout_cap_failure_empty_and_whitespace_are_distinct(self):
        self.assertEqual(self.status(payload(),timed_out=True),'INCOMPLETE_TIMEOUT')
        self.assertEqual(self.status(payload(),truncated=True),'INCOMPLETE_OUTPUT_CAP')
        self.assertEqual(self.status(payload(),exit_code=1),'UNAVAILABLE_COMMAND_FAILED')
        for raw in [b'',b'\n',b'[]']:
            with self.subTest(raw=raw):self.assertEqual(self.status(raw),'EMPTY')
    def test_ndjson_and_known_object_envelopes_retain_strict_event_checks(self):
        for raw in [(json.dumps(event())+'\n'+json.dumps(event('AuthProbeUITests-Runner'))).encode(),
                    json.dumps(event()).encode(),json.dumps(dict(events=[event()])).encode()]:
            with self.subTest(raw=raw):self.assertEqual(self.status(raw),'AVAILABLE')
    def test_non_event_array_and_unknown_fields_do_not_fake_availability(self):
        for raw in [b'[null]',b'[{}]',payload([event(),{}]),b'{"events":[null]}']:
            with self.subTest(raw=raw):self.assertNotEqual(self.status(raw),'AVAILABLE')


class WorkflowControls(unittest.TestCase):
    def test_only_first_exact_branch_creation_has_read_only_gets(self):
        text=(ROOT/'.github/workflows/ios-auth79-daemon-log-20261108.yml').read_text(encoding='utf8')
        for value in ['github.event.created == true','github.event.forced == false','github.run_attempt == 1','github.run_number == 1',
                      'runs-on: macos-26-intel','Xcode_26.6.app','contents: read','actions: read',str(R.RUN_ID),str(R.JOB_ID),str(R.ARTIFACT_ID),
                      'persist-credentials: false','if: always()']:
            self.assertIn(value,text)
        for value in ['workflow_dispatch:','pull_request:','continue-on-error','npm ','xcodebuild ','simctl ','log stream','--method POST','--method PATCH','--method PUT','--method DELETE','sudo ']:
            self.assertNotIn(value,text)
        self.assertEqual(text.count('gh api --method GET'),2)
        config=json.loads((ROOT/'vercel.json').read_text(encoding='utf8'))
        self.assertFalse(config['git']['deploymentEnabled']['codex/ios-auth79-daemon-log-20261108'])


class FullInspectionControls(unittest.TestCase):
    def invoke(self,query_state='valid',bad_metadata=False,wrong_archive=False,missing_runner=False):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);private=root/D.PRIVATE_NAME;private.mkdir()
            bundle=private/'extracted/result.xcresult';bundle.mkdir(parents=True);(bundle/'Info.plist').write_text('synthetic')
            (private/'original.zip').write_bytes(b'synthetic fixed archive')
            report=root/'report';report.mkdir()
            meta=R.validate_metadata(metadata())
            if bad_metadata:meta['sourceRunId']=42396343370
            R.write_json(report/'metadata-validation.json',meta)
            R.write_json(report/'archive-validation.json',dict(archiveValidated=True,archiveSha256=R.ZIP_SHA256,safeExtraction=True))
            seen=[]
            def run(argv,raw_dir,label,seconds,stdout_limit,stderr_limit,environment):
                D.validate_command(argv);seen.append((label,argv,seconds,stdout_limit,stderr_limit))
                raw_dir=Path(raw_dir);raw_dir.mkdir(parents=True,exist_ok=True)
                stdout=b'';stderr=b''
                if label=='xcresult-version':stdout=b'xcresulttool synthetic version\n'
                if label=='xcresult-export-help':stdout=b'--path --output-path\n'
                if label=='xcresult-export':
                    export,_=ArchiveAndQueryControls().fixture(private,OLD.UDID if wrong_archive else None)
                    if missing_runner:(export/'arbitrary-runner-proof-name.txt').unlink()
                if label=='log-help-show':stderr=(ROOT/'tests/fixtures/auth76/log-help-show-macos26.6.1.stderr.txt').read_bytes()
                if label=='log-show':
                    stdout=payload()
                    if query_state=='foreign':stdout=payload([{**event(),'processID':999}])
                    if query_state=='empty':stdout=b'[]'
                paths={'stdout':raw_dir/(label+'.stdout'),'stderr':raw_dir/(label+'.stderr')}
                paths['stdout'].write_bytes(stdout);paths['stderr'].write_bytes(stderr)
                return dict(argv=argv,exitCode=64 if label=='log-help-show' else 0,
                            timedOut=label=='log-show' and query_state=='timeout',
                            outputTruncated=label=='log-show' and query_state=='cap',durationMs=1,
                            timeoutSeconds=seconds,stdoutLimitBytes=stdout_limit,stderrLimitBytes=stderr_limit,
                            rawPaths=paths,rawBytes={'stdout':len(stdout),'stderr':len(stderr)})
            error=None
            with patch.object(R,'validate_archive',return_value={'archiveValidated':True}) as archive_check,patch.object(D.BASE,'run_bounded',side_effect=run):
                try:D.inspect(private,report,{'RUNNER_TEMP':str(root),'DEVELOPER_DIR':'/Applications/Xcode_26.6.app/Contents/Developer'})
                except D.InspectionError as caught:error=caught
            manifest_path=report/'system-log/manifest.json'
            manifest=json.loads(manifest_path.read_text(encoding='utf8')) if manifest_path.exists() else None
            if not bad_metadata:archive_check.assert_called_once_with(private/'original.zip')
            return error,manifest,seen
    def test_entire_read_only_sequence_pins_export_and_keeps_original_failure(self):
        error,manifest,seen=self.invoke()
        self.assertIsNone(error);self.assertEqual(manifest['status'],'AVAILABLE')
        self.assertEqual([row[0] for row in seen],['xcresult-version','xcresult-export-help','xcresult-export','log-help-show','log-show'])
        self.assertEqual(manifest['sourceRunId'],42422409479);self.assertEqual(manifest['sourceJobId'],128553466429)
        self.assertEqual(manifest['exportProvenance']['runnerPid'],35064)
        self.assertEqual(manifest['exportProvenance']['sessionIdentifier'],D.SESSION)
        self.assertEqual(manifest['archive']['files'],1);self.assertEqual(len(manifest['archive']['treeSha256']),64)
        self.assertFalse(manifest['originalTestPassed']);self.assertFalse(manifest['causeDetermined'])
        self.assertFalse(manifest['releaseAcceptance']);self.assertFalse(manifest['readinessAccepted'])
        self.assertEqual(seen[-1][2:],(D.LOG_SECONDS,D.LOG_STDOUT_BYTES,D.STDERR_BYTES))
    def test_failures_remain_distinct_and_manifest_is_always_retained(self):
        for state,expected in [('timeout','INCOMPLETE_TIMEOUT'),('cap','INCOMPLETE_OUTPUT_CAP'),
                               ('foreign','UNAVAILABLE_EVENT_SCOPE_OR_FORMAT'),('empty','EMPTY')]:
            with self.subTest(state=state):
                error,manifest,seen=self.invoke(state)
                self.assertIsNotNone(error);self.assertEqual(manifest['status'],expected)
                self.assertEqual(manifest['sourceArtifactId'],13594830607);self.assertIn('failureReason',manifest)
                self.assertFalse(manifest['productCauseProven'])
    def test_foreign_source_metadata_stops_before_any_reader_command(self):
        error,manifest,seen=self.invoke(bad_metadata=True)
        self.assertIsNotNone(error);self.assertEqual(seen,[]);self.assertIsNone(manifest)
    def test_wrong_archive_or_missing_runner_never_queries_a_fallback(self):
        for options in [dict(wrong_archive=True),dict(missing_runner=True)]:
            with self.subTest(options=options):
                error,manifest,seen=self.invoke(**options)
                self.assertIsNotNone(error);self.assertEqual(manifest['status'],'UNAVAILABLE')
                self.assertNotIn('log-show',[row[0] for row in seen]);self.assertIsNone(manifest['exportProvenance'])


if __name__=='__main__':unittest.main(verbosity=2)
