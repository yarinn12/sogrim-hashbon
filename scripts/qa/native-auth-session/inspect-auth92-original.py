"""Read immutable, synthetic Auth92 evidence; never launch or rebuild an app."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess

REPO = 'yarinn12/sogrim-hashbon'
SOURCE = 'dc137971e3e47769cfda7e2af7ed4293fb3d7962'
RUN = 43234290463
JOB = 131237413492
ARTIFACT = 13952327426
DIGEST = '9d7e7b4516450d19499532004edafc07ecd4812b4def4fa7cb9d08bd67b14140'
SIZE = 77196223
ROOT = Path(__file__).resolve().parents[3]


def api(path):
    return json.loads(subprocess.check_output(['gh', 'api', 'repos/' + REPO + '/' + path], timeout=60))


def main():
    output = ROOT / 'original-inspection'
    assert not output.exists()
    run = api('actions/runs/' + str(RUN))
    job = api('actions/jobs/' + str(JOB))
    artifact = api('actions/artifacts/' + str(ARTIFACT))
    assert run['repository']['full_name'] == run['head_repository']['full_name'] == REPO
    assert not run['repository']['fork'] and not run['head_repository']['fork']
    assert run['id'] == RUN and run['head_sha'] == SOURCE and run['run_attempt'] == 1
    assert run['head_branch'] == 'codex/test-release-459-20261104' and run['event'] == 'pull_request'
    assert run['path'] == '.github/workflows/ios-auth-return-qa.yml'
    assert run['status'] == 'completed' and run['conclusion'] == 'failure'
    assert job['id'] == JOB and job['run_id'] == RUN and job['head_sha'] == SOURCE
    assert job['name'] == 'native' and job['status'] == 'completed' and job['conclusion'] == 'failure'
    assert artifact['id'] == ARTIFACT and artifact['name'] == 'native-auth-session-custom'
    assert artifact['size_in_bytes'] == SIZE and artifact['digest'] == 'sha256:' + DIGEST and not artifact['expired']
    assert artifact['workflow_run']['id'] == RUN and artifact['workflow_run']['head_sha'] == SOURCE
    archive = ROOT / 'auth92-original.zip'
    assert not archive.exists()
    with archive.open('xb') as stream:
        subprocess.run(['gh', 'api', 'repos/' + REPO + '/actions/artifacts/' + str(ARTIFACT) + '/zip'],
                       stdout=stream, check=True, timeout=120)
    assert archive.stat().st_size == SIZE and hashlib.sha256(archive.read_bytes()).hexdigest() == DIGEST
    path = Path(__file__).with_name('inspect-original-xcresult.py')
    spec = importlib.util.spec_from_file_location('original_xcresult_reader', path)
    reader = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(reader)
    extracted = ROOT / 'auth92-original-extracted'
    extraction = reader.safe_extract_result(archive, extracted)
    manifest = reader.inspect_result(extracted / 'result.xcresult', output)
    receipt = {'source': SOURCE, 'originalRun': RUN, 'originalJob': JOB, 'artifact': ARTIFACT,
               'archiveSha256': DIGEST, 'archiveBytes': SIZE, 'extraction': extraction,
               'originalEvidenceOnly': True, 'newAppRun': False, 'ciRerun': False,
               'applicationChanged': False, 'sourceAccepted': False, 'newCost': False,
               'unavailableCommands': manifest['unavailableOrFailed']}
    reader.write_json(output / 'auth92-original-receipt.json', receipt)
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
