"""Synthetic Native503 original evidence controls; no Native execution."""
from contextlib import contextmanager
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('native503_home',ROOT/'scripts/qa/native-auth-session/inspect-native503-home-log.py')
D = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(D)
R = D.ORIGINAL
AUTH = D.load('unchanged_auth79_control','inspect-auth79-ax-services.py')
ARCHIVE = '/private/native503/diagnostics-export/X/simctl_diagnostics/'+D.UDID+'/system.logarchive'
SYNTHETIC_PIDS = dict(SpringBoard=90001,backboardd=90002,testmanagerd=90003,runningboardd=90004)


def metadata():
    repo=dict(id=R.REPO_ID,full_name=R.REPO,fork=False)
    run=dict(id=R.RUN_ID,repository=copy.deepcopy(repo),head_repository=copy.deepcopy(repo),head_sha=R.SOURCE_SHA,
             head_branch=R.SOURCE_BRANCH,path=R.SOURCE_WORKFLOW,event='pull_request',run_attempt=1,status='completed',conclusion='failure')
    job=dict(id=R.JOB_ID,run_id=R.RUN_ID,run_attempt=1,head_sha=R.SOURCE_SHA,head_branch=R.SOURCE_BRANCH,
             name=R.JOB_NAME,status='completed',conclusion='failure')
    artifact=dict(id=R.ARTIFACT_ID,name=R.ARTIFACT_NAME,size_in_bytes=R.ZIP_BYTES,expired=False,digest='sha256:'+R.ZIP_SHA256,
                  workflow_run=dict(id=R.RUN_ID,repository_id=R.REPO_ID,head_repository_id=R.REPO_ID,head_branch=R.SOURCE_BRANCH,head_sha=R.SOURCE_SHA))
    jobs=[copy.deepcopy(job)]+[dict(id=70000+i,name='synthetic unrelated QA job') for i in range(67)]
    return dict(repo=repo,run=run,job=job,attempt_jobs=dict(total_count=68,jobs=jobs),artifact=artifact,
                run_artifacts=dict(total_count=1,artifacts=[copy.deepcopy(artifact)]))


def event(name='App',**changes):
    item=dict(timestamp='2026-11-07 23:11:07.123456+0000',processImagePath='/synthetic/'+name,
              processID=D.TARGETS.get(name,SYNTHETIC_PIDS.get(name,99999)),eventMessage='synthetic service evidence')
    item.update(changes)
    return item


def events():
    return [event(name) for name in (*D.TARGETS,*D.SERVICES)]


def payload(items=None,footer=False,archive=ARCHIVE):
    raw=json.dumps(events() if items is None else items).encode()
    return raw+(('==========\n'+str(archive)+'\n==========\n').encode() if footer else b'')


def fixture(root,udid=None):
    export=Path(root)/'diagnostics-export'
    archive=export/'X/simctl_diagnostics'/(udid or D.UDID)/'system.logarchive'
    archive.mkdir(parents=True);(archive/'synthetic.bin').write_bytes(b'synthetic archive, not real diagnostics')
    proof='\n'.join(['Xcode version: 26.6 (17F113)','Beginning test session ParityProbeUITests-'+D.SESSION,
                     D.UDID,'ParityProbeUITests-Runner[9565:35125]','(pid = 10072)',
                     'Pressing Home button','Timed out: native background']).encode()
    (export/'synthetic-original-session.log').write_bytes(proof)
    return export,archive,proof


@contextmanager
def synthetic_proof_binding(raw):
    # Fixtures cannot claim to be the 5.4 MB immutable real Runner log.
    with patch.object(D,'RUNNER_LOG_BYTES',len(raw)),patch.object(D,'RUNNER_LOG_SHA256',hashlib.sha256(raw).hexdigest()):
        yield


class IdentityControls(unittest.TestCase):
    def test_fixed_native_identity_and_original_auth79_are_isolated(self):
        self.assertEqual((R.RUN_ID,R.JOB_ID,R.ARTIFACT_ID,R.ZIP_BYTES),(42422409530,128554012283,13595380002,113053740))
        self.assertEqual(R.SOURCE_WORKFLOW,'.github/workflows/qa.yml')
        self.assertEqual(R.JOB_NAME,'ios-native / native-parity')
        self.assertEqual((AUTH.ORIGINAL.RUN_ID,AUTH.TARGETS['AuthProbeUITests-Runner']),(42422409479,35064))
        self.assertNotEqual(D.UDID,AUTH.UDID)
        self.assertEqual((D.RUNNER_LOG_BYTES,D.MAX_PROOF_FILE,D.MAX_PROOF_BYTES),(5401276,8000000,16000000))
        self.assertEqual(D.RUNNER_LOG_SHA256,'87006017f7fbe4b0e3dedbd3f4bf4e3c305ec0451772573e40ba40aabb137203')
    def test_exact_metadata_requires_failed_native_job_and_default_profile(self):
        result=R.validate_metadata(metadata())
        self.assertTrue(result['metadataValidated']);self.assertFalse(result['releaseAcceptance'])
        self.assertEqual(result['originalResultPrefix'],'default/result.xcresult')
        changes=[('run','id',42422409479),('run','path','.github/workflows/ios-parity-qa.yml'),('run','run_attempt',2),
                 ('run','head_sha','0'*40),('run','event','workflow_dispatch'),('run','conclusion','success'),
                 ('job','name','native'),('job','id',128553466429),('job','conclusion','success'),('job','run_attempt',2),
                 ('artifact','id',13594830607),('artifact','size_in_bytes',R.ZIP_BYTES-1),
                 ('artifact','expired',True),('artifact','digest','sha256:'+'0'*64),('repo','fork',True)]
        for section,key,value in changes:
            with self.subTest(section=section,key=key),self.assertRaises(R.EvidenceError):
                data=metadata();data[section][key]=value;R.validate_metadata(data)
    def test_metadata_membership_and_source_links_stay_required(self):
        for change in [lambda d:d['attempt_jobs']['jobs'].clear(),lambda d:d['attempt_jobs']['jobs'].append(d['job']),
                       lambda d:d['run_artifacts']['artifacts'].clear(),lambda d:d['artifact']['workflow_run'].update(head_sha='0'*40),
                       lambda d:d['attempt_jobs']['jobs'].__setitem__(-1,copy.deepcopy(d['attempt_jobs']['jobs'][-2])),
                       lambda d:d['attempt_jobs']['jobs'].__setitem__(-1,copy.deepcopy(d['job']))]:
            with self.subTest(change=change),self.assertRaises(R.EvidenceError):
                data=metadata();change(data);R.validate_metadata(data)
    def test_qa68_job_inventory_cannot_be_truncated_or_recounted(self):
        for count,length in [(68,1),(1,1),(69,68),(67,67)]:
            with self.subTest(count=count,length=length),self.assertRaises(R.EvidenceError):
                data=metadata();data['attempt_jobs']=dict(total_count=count,jobs=data['attempt_jobs']['jobs'][:length])
                R.validate_metadata(data)
    def test_only_fixed_verification_and_inspection_cli_modes_exist(self):
        for command in ['inspect','run','download','test']:
            with self.subTest(command=command),self.assertRaises(R.EvidenceError):R.main(['tool',command,'x','y'])
        for command in ['run','download','test','stream']:
            with self.subTest(command=command),self.assertRaises(D.InspectionError):D.main(['tool',command,'x','y'])
    def test_all_generic_execution_archive_and_zip_caps_are_unchanged(self):
        for key in ['MAX_ARCHIVE_FILES','MAX_ARCHIVE_BYTES','MAX_ARCHIVE_FILE_BYTES','HELP_BYTES','EXPORT_STDOUT_BYTES',
                    'LOG_STDOUT_BYTES','STDERR_BYTES','HELP_SECONDS','EXPORT_SECONDS','LOG_SECONDS']:
            self.assertEqual(getattr(D,key),getattr(AUTH,key),key)
        for key in ['MAX_MEMBERS','MAX_ENTRY','MAX_UNCOMPRESSED']:
            self.assertEqual(getattr(R,key),getattr(AUTH.ORIGINAL,key),key)
    def test_zip_bytes_and_sha256_are_enforced(self):
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp)/'original.zip';p.write_bytes(b'synthetic')
            with self.assertRaises(R.EvidenceError):R.validate_archive(p)
            with patch.object(R.ORIGINAL,'ZIP_BYTES',9),patch.object(R.ORIGINAL,'ZIP_SHA256',hashlib.sha256(b'synthetic').hexdigest()):
                self.assertTrue(R.validate_archive(p)['archiveValidated'])
                p.write_bytes(b'foreign!!')
                with self.assertRaisesRegex(R.EvidenceError,'sha256'):R.validate_archive(p)


class ZipLayoutControls(unittest.TestCase):
    def write(self,path,names):
        with zipfile.ZipFile(path,'w') as z:
            for name in names:z.writestr(name,b'synthetic')
    def test_only_default_result_is_extracted_to_generic_private_location(self):
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp)/'original.zip';self.write(p,['default/result.xcresult/Info.plist','default/result.xcresult/Data/a','build.log'])
            dest=Path(temp)/'extracted';result=R.safe_extract_result(p,dest)
            self.assertEqual(result['resultMembers'],2)
            self.assertTrue((dest/'result.xcresult/Info.plist').is_file())
            self.assertFalse((dest/'build.log').exists())
            self.assertEqual(result['originalResultPrefix'],'default/result.xcresult')
            with self.assertRaises(R.EvidenceError):R.safe_extract_result(p,dest)
    def test_foreign_missing_and_unsafe_layouts_are_rejected(self):
        for names in [['result.xcresult/Info.plist'],['accessibility-extra-large/result.xcresult/Info.plist'],
                      ['build.log'],['default/result.xcresult'],['default/../result.xcresult/Info.plist'],
                      ['/default/result.xcresult/Info.plist'],['default/result.xcresult/Info.plist','default/result.xcresult/info.plist']]:
            with self.subTest(names=names),tempfile.TemporaryDirectory() as temp:
                p=Path(temp)/'x.zip';self.write(p,names)
                with zipfile.ZipFile(p) as z,self.assertRaises(R.EvidenceError):R.safe_members(z)
    def test_generic_member_caps_and_special_file_rejection_still_apply(self):
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp)/'x.zip';self.write(p,['default/result.xcresult/Info.plist'])
            for name in ['MAX_MEMBERS','MAX_ENTRY','MAX_UNCOMPRESSED']:
                with self.subTest(cap=name),zipfile.ZipFile(p) as z,patch.object(R.ORIGINAL,name,0),self.assertRaises(R.EvidenceError):R.safe_members(z)
            with zipfile.ZipFile(p,'w') as z:
                info=zipfile.ZipInfo('default/result.xcresult/Info.plist');info.external_attr=(0o120777<<16);z.writestr(info,b'foreign link')
            with zipfile.ZipFile(p) as z,self.assertRaises(R.EvidenceError):R.safe_members(z)
    def test_missing_default_info_never_produces_safe_extraction(self):
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp)/'x.zip';self.write(p,['default/result.xcresult/Data/a'])
            with self.assertRaises(R.EvidenceError):R.safe_extract_result(p,Path(temp)/'extracted')


class ProvenanceControls(unittest.TestCase):
    def test_exact_session_archive_and_full_runner_hash_are_required(self):
        with tempfile.TemporaryDirectory() as temp:
            export,archive,raw=fixture(temp)
            with synthetic_proof_binding(raw):
                self.assertEqual(D.select_archive(export),archive)
                self.assertEqual(D.EXPORT_PROOF['runnerPid'],9565)
                self.assertEqual(D.EXPORT_PROOF['appPid'],10072)
            with self.assertRaises(D.InspectionError):D.select_archive(export)
            self.assertIsNone(D.EXPORT_PROOF)
    def test_missing_foreign_or_altered_session_proof_is_not_available(self):
        for token in [D.SESSION,D.UDID,'9565','10072','Timed out: native background','26.6 (17F113)']:
            with self.subTest(token=token),tempfile.TemporaryDirectory() as temp:
                export,_,raw=fixture(temp);bad=raw.replace(token.encode(),b'foreign')
                (export/'synthetic-original-session.log').write_bytes(bad)
                with synthetic_proof_binding(bad),self.assertRaises(D.InspectionError):D.select_archive(export)
        with tempfile.TemporaryDirectory() as temp:
            export,_,raw=fixture(temp);(export/'synthetic-original-session.log').unlink()
            with synthetic_proof_binding(raw),self.assertRaises(D.InspectionError):D.select_archive(export)
    def test_same_size_modified_full_runner_proof_fails_its_hash(self):
        with tempfile.TemporaryDirectory() as temp:
            export,_,raw=fixture(temp);raw+=b'\nunused detail=one'
            (export/'synthetic-original-session.log').write_bytes(raw.replace(b'detail=one',b'detail=two'))
            with synthetic_proof_binding(raw),self.assertRaises(D.InspectionError):D.select_archive(export)
    def test_proof_caps_and_duplicate_matching_proofs_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            export,_,raw=fixture(temp)
            for name in ['MAX_PROOF_FILES','MAX_PROOF_BYTES','MAX_PROOF_FILE']:
                with self.subTest(cap=name),synthetic_proof_binding(raw),patch.object(D,name,0),self.assertRaises(D.InspectionError):D.select_archive(export)
            (export/'duplicate-original-session.log').write_bytes(raw)
            with synthetic_proof_binding(raw),self.assertRaises(D.InspectionError):D.select_archive(export)
    def test_wrong_duplicate_missing_archive_or_symlink_is_rejected(self):
        for mode in ['wrong','duplicate','missing','symlink']:
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as temp:
                export,archive,raw=fixture(temp,AUTH.UDID if mode=='wrong' else None)
                if mode=='duplicate':(export/'Y/simctl_diagnostics'/D.UDID/'system.logarchive').mkdir(parents=True)
                if mode=='missing':(archive/'synthetic.bin').unlink();archive.rmdir()
                with synthetic_proof_binding(raw):
                    if mode=='symlink':
                        with patch.object(Path,'is_symlink',return_value=True),self.assertRaises(D.InspectionError):D.select_archive(export)
                    else:
                        with self.assertRaises(D.InspectionError):D.select_archive(export)
    def test_exact_original_window_and_named_service_query_only(self):
        with tempfile.TemporaryDirectory() as temp:
            _,archive,_=fixture(temp);argv=D.log_show_argv(archive);D.validate_command(argv)
            self.assertEqual(argv[argv.index('--start')+1],'2026-11-07 23:11:05+0000')
            self.assertEqual(argv[argv.index('--end')+1],'2026-11-07 23:11:53+0000')
            for service in D.SERVICES:self.assertIn('process == "'+service+'"',D.PREDICATE)
            for bad in [['/usr/bin/log','stream'],['xcodebuild','test'],argv[:-1]+['/tmp/system.logarchive'],
                        [s.replace('10072','10073') for s in argv],[s.replace('23:11:05','23:11:04') for s in argv]]:
                with self.subTest(argv=bad),self.assertRaises(D.InspectionError):D.validate_command(bad)


class EventControls(unittest.TestCase):
    def status(self,raw,**changes):
        args=dict(exit_code=0,stdout=raw,timed_out=False,truncated=False,expected_archive=ARCHIVE);args.update(changes)
        return D.output_status(**args)
    def test_original_actor_and_service_pairs_are_learned_from_valid_archive_events(self):
        self.assertEqual(self.status(payload(footer=True)),'AVAILABLE')
        self.assertFalse(D.VERIFIED_SCOPE['servicePidsPreassigned'])
        self.assertTrue(D.VERIFIED_SCOPE['completeServiceCoverage'])
        self.assertEqual(D.VERIFIED_SCOPE['identities']['SpringBoard']['processID'],90001)
    def test_quiet_services_are_explicit_and_not_claimed_as_complete_coverage(self):
        self.assertEqual(self.status(payload(events()[:3])),'AVAILABLE')
        self.assertFalse(D.VERIFIED_SCOPE['completeServiceCoverage'])
        self.assertEqual(len(D.VERIFIED_SCOPE['missingServiceActors']),3)
    def test_missing_known_actor_or_all_service_events_rejects_availability(self):
        for items in [events()[1:],events()[:1]+events()[2:],events()[:2]]:
            with self.subTest(items=items):self.assertEqual(self.status(payload(items)),'UNAVAILABLE_EVENT_SCOPE_OR_FORMAT')
    def test_both_directions_of_original_name_pid_binding_are_strict(self):
        for name,pid in [('App',90001),('ParityProbeUITests-Runner',90001),('SpringBoard',10072),('backboardd',9565)]:
            with self.subTest(name=name,pid=pid):
                self.assertEqual(self.status(payload(events()+[event(name,processID=pid)])),'UNAVAILABLE_EVENT_SCOPE_OR_FORMAT')
    def test_foreign_service_conflicting_pid_and_path_are_rejected(self):
        for bad in [event('foreign'),event('SpringBoard',processID=90008),event('SpringBoard',processImagePath='/other/SpringBoard'),
                    event('backboardd',processID=90001)]:
            with self.subTest(bad=bad):self.assertEqual(self.status(payload(events()+[bad])),'UNAVAILABLE_EVENT_SCOPE_OR_FORMAT')
    def test_missing_invalid_event_fields_never_provide_scope(self):
        for key in ['timestamp','processImagePath','processID','eventMessage']:
            item=event('SpringBoard');del item[key]
            with self.subTest(missing=key):self.assertNotEqual(self.status(payload(events()[:2]+[item])),'AVAILABLE')
        for key,value in [('processID',True),('processID',0),('processID',-1),('processID','90001'),
                          ('processImagePath','SpringBoard'),('processImagePath','/'),('eventMessage',' '),('eventMessage',None)]:
            with self.subTest(key=key,value=value):
                self.assertNotEqual(self.status(payload(events()[:2]+[event('SpringBoard',**{key:value})])),'AVAILABLE')
    def test_foreign_dates_timezone_and_window_edges_are_rejected(self):
        for stamp in ['2026-11-06 23:11:07.000000+0000','2026-11-07 23:11:04.999999+0000',
                      '2026-11-07 23:11:53.000000+0000','2026-11-07 23:11:07.000000+0200','bad']:
            with self.subTest(stamp=stamp):
                self.assertNotEqual(self.status(payload(events()[:2]+[event('SpringBoard',timestamp=stamp)])),'AVAILABLE')
    def test_wrong_archive_footer_partial_and_non_event_json_rejected(self):
        good=payload(footer=True)
        for raw in [b'[',b'[null]',b'[{}]',good[:-1],good+b'junk',good.replace(ARCHIVE.encode(),b'/foreign')]:
            with self.subTest(raw=raw):self.assertNotEqual(self.status(raw),'AVAILABLE')
        for archive in [None,'/foreign/system.logarchive',ARCHIVE.replace(D.UDID,AUTH.UDID)]:
            with self.subTest(archive=archive):self.assertEqual(self.status(payload(),expected_archive=archive),'UNAVAILABLE_EVENT_SCOPE_OR_FORMAT')
    def test_failure_timeout_cap_and_empty_preserve_distinct_outcomes(self):
        for changes,expected in [(dict(exit_code=1),'UNAVAILABLE_COMMAND_FAILED'),(dict(timed_out=True),'INCOMPLETE_TIMEOUT'),
                                 (dict(truncated=True),'INCOMPLETE_OUTPUT_CAP')]:
            with self.subTest(changes=changes):
                self.assertEqual(self.status(payload(),**changes),expected);self.assertIsNone(D.VERIFIED_SCOPE)
        for raw in [b'',b'\n',b'[]']:
            with self.subTest(raw=raw):self.assertEqual(self.status(raw),'EMPTY')


class FullInspectionControls(unittest.TestCase):
    def invoke(self,state='valid'):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);private=root/D.PRIVATE_NAME;private.mkdir();report=root/'report';report.mkdir()
            bundle=private/'extracted/result.xcresult';bundle.mkdir(parents=True);(bundle/'Info.plist').write_text('synthetic')
            (private/'original.zip').write_bytes(b'synthetic')
            bound=R.validate_metadata(metadata())
            if state=='foreign-metadata':bound['sourceRunId']=42422409479
            R.write_json(report/'metadata-validation.json',bound)
            R.write_json(report/'archive-validation.json',dict(archiveValidated=True,archiveSha256=R.ZIP_SHA256,safeExtraction=True))
            proof=b'';seen=[]
            def run(argv,raw_dir,label,seconds,stdout_limit,stderr_limit,environment):
                nonlocal proof
                D.validate_command(argv);seen.append(label);raw_dir=Path(raw_dir);raw_dir.mkdir(parents=True,exist_ok=True)
                stdout=b'';stderr=b''
                if label=='xcresult-version':stdout=b'synthetic xcresulttool version\n'
                if label=='xcresult-export-help':stdout=b'--path --output-path\n'
                if label=='xcresult-export':
                    _,_,proof=fixture(private)
                    if state=='missing-proof':(private/'diagnostics-export/synthetic-original-session.log').unlink()
                if label=='log-help-show':stderr=(ROOT/'tests/fixtures/auth76/log-help-show-macos26.6.1.stderr.txt').read_bytes()
                if label=='log-show':
                    stdout=payload()
                    if state=='foreign':stdout=payload(events()+[event('foreign')])
                    if state=='empty':stdout=b'[]'
                paths=dict(stdout=raw_dir/(label+'.stdout'),stderr=raw_dir/(label+'.stderr'))
                paths['stdout'].write_bytes(stdout);paths['stderr'].write_bytes(stderr)
                return dict(argv=argv,exitCode=64 if label=='log-help-show' else (1 if state=='failed' and label=='log-show' else 0),
                            timedOut=state=='timeout' and label=='log-show',outputTruncated=state=='cap' and label=='log-show',
                            durationMs=1,timeoutSeconds=seconds,stdoutLimitBytes=stdout_limit,stderrLimitBytes=stderr_limit,
                            rawPaths=paths,rawBytes=dict(stdout=len(stdout),stderr=len(stderr)))
            # Bind synthetic proof through the selector, not by changing production constants on disk.
            original_select=D.select_archive
            def select(export):
                with synthetic_proof_binding(proof):return original_select(export)
            error=None
            with patch.object(R,'validate_archive',return_value=dict(archiveValidated=True)),patch.object(D.BASE,'run_bounded',side_effect=run),patch.object(D.BASE,'select_archive',side_effect=select):
                try:D.inspect(private,report,dict(RUNNER_TEMP=str(root),DEVELOPER_DIR='/Applications/Xcode_26.6.app/Contents/Developer'))
                except D.InspectionError as caught:error=caught
            p=report/'system-log/manifest.json';manifest=json.loads(p.read_text(encoding='utf-8')) if p.exists() else None
            return error,manifest,seen
    def test_same_original_read_sequence_pins_default_provenance_and_has_no_release_credit(self):
        error,m,seen=self.invoke();self.assertIsNone(error)
        self.assertEqual(seen,['xcresult-version','xcresult-export-help','xcresult-export','log-help-show','log-show'])
        self.assertEqual(m['status'],'AVAILABLE');self.assertEqual(m['sourceJobId'],128554012283)
        self.assertEqual(m['exportProvenance']['sessionIdentifier'],D.SESSION)
        self.assertEqual(m['originalFunctionalCasesObserved'],1)
        self.assertTrue(m['knownOriginalFunctionalCaseStarted'])
        self.assertFalse(m['serviceEventScope']['servicePidsPreassigned'])
        for key in ['releaseAcceptance','newAppOrXCTestRun','productCauseProven','causeDetermined','readinessAccepted','originalTestPassed']:
            self.assertFalse(m[key],key)
    def test_failed_partial_empty_or_missing_proof_retains_failed_manifest(self):
        for state,status in [('timeout','INCOMPLETE_TIMEOUT'),('cap','INCOMPLETE_OUTPUT_CAP'),('foreign','UNAVAILABLE_EVENT_SCOPE_OR_FORMAT'),
                             ('empty','EMPTY'),('failed','UNAVAILABLE_COMMAND_FAILED'),('missing-proof','UNAVAILABLE')]:
            with self.subTest(state=state):
                error,m,seen=self.invoke(state);self.assertIsNotNone(error);self.assertEqual(m['status'],status)
                self.assertFalse(m['newAppOrXCTestRun']);self.assertFalse(m['releaseAcceptance'])
                if state=='missing-proof':self.assertNotIn('log-show',seen)
    def test_foreign_source_metadata_stops_before_any_reader_command(self):
        error,m,seen=self.invoke('foreign-metadata')
        self.assertIsNotNone(error);self.assertIsNone(m);self.assertEqual(seen,[])


class WorkflowControls(unittest.TestCase):
    def test_single_first_push_workflow_has_two_read_only_jobs_and_no_dispatch(self):
        s=(ROOT/'.github/workflows/ios-original-two-failures-20261108.yml').read_text(encoding='utf-8')
        self.assertIn('branches: [codex/ios-original-two-failures-20261108]',s)
        for label in ['read-original-auth79:','read-original-native503:']:self.assertIn(label,s)
        for value in ['github.event.created == true','github.event.deleted == false','github.event.forced == false',
                      'github.run_attempt == 1','github.run_number == 1','persist-credentials: false']:
            self.assertEqual(s.count(value),2,value)
        for value in ['contents: read','actions: read','runs-on: macos-26-intel','runs-on: macos-26',
                      'inspect-auth79-ax-services.py','inspect-native503-home-log.py',str(R.RUN_ID),str(R.JOB_ID),str(R.ARTIFACT_ID)]:self.assertIn(value,s)
        for value in ['workflow_dispatch:','pull_request:','continue-on-error','npm ','xcodebuild ','simctl ','sudo ',
                      '--method POST','--method PATCH','--method PUT','--method DELETE']:self.assertNotIn(value,s)
        self.assertEqual(s.count('gh api --method GET'),4)
        c=json.loads((ROOT/'vercel.json').read_text(encoding='utf-8'))
        self.assertFalse(c['git']['deploymentEnabled']['codex/ios-original-two-failures-20261108'])


if __name__=='__main__':unittest.main(verbosity=2)
