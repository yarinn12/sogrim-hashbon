"""Read one immutable original result. No app, simulator, store or database commands."""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import zipfile

REPO='yarinn12/sogrim-hashbon'
SOURCE='7fb0cedf21b35eb49c7777e4d5df84441e40b2ec'
TREE='808c86bc9d5e2cce81852457337e8879878836ca'
RUN=43312636743
JOB=131513559031
ARTIFACT=13987898538
DIGEST='41511f37d07b3d823d803f2fb952dc4c6fb26c18247f327d452a5bc0db6f2736'
SIZE=111906730
BRANCH='codex/qa522-native-private-reader-20261113'
ROOT=Path(__file__).resolve().parents[3]

def api(path):
    return json.loads(subprocess.check_output(['gh','api','repos/'+REPO+'/'+path],timeout=60))

def read_original(private):
    assert os.environ.get('GITHUB_REPOSITORY')==REPO
    assert os.environ.get('GITHUB_REF')=='refs/heads/'+BRANCH
    assert os.environ.get('GITHUB_RUN_ATTEMPT')=='1'
    output=private/'export'
    assert not output.exists()
    run=api('actions/runs/'+str(RUN));job=api('actions/jobs/'+str(JOB));artifact=api('actions/artifacts/'+str(ARTIFACT));commit=api('git/commits/'+SOURCE)
    assert run['repository']['full_name']==run['head_repository']['full_name']==REPO
    assert not run['repository']['fork']and not run['head_repository']['fork']
    assert run['id']==RUN and run['head_sha']==SOURCE and run['run_attempt']==1
    assert run['head_branch']=='codex/test-release-459-20261104'and run['event']=='pull_request'
    assert run['path']=='.github/workflows/qa.yml'and run['status']=='completed'and run['conclusion']=='failure'
    assert commit['sha']==SOURCE and commit['tree']['sha']==TREE
    assert job['id']==JOB and job['run_id']==RUN and job['head_sha']==SOURCE
    assert job['name']=='ios-native / native-parity'and job['status']=='completed'and job['conclusion']=='failure'
    attempt=api('actions/runs/'+str(RUN)+'/attempts/1/jobs?per_page=100')
    assert attempt['total_count']==len(attempt['jobs'])==68 and sum(j['id']==JOB for j in attempt['jobs'])==1
    assert artifact['id']==ARTIFACT and artifact['name']=='ios-capacitor-parity-'+SOURCE
    assert artifact['size_in_bytes']==SIZE and artifact['digest']=='sha256:'+DIGEST and not artifact['expired']
    assert artifact['workflow_run']['id']==RUN and artifact['workflow_run']['head_sha']==SOURCE
    archive=private/'original.zip';assert not archive.exists()
    with archive.open('xb')as stream:subprocess.run(['gh','api','repos/'+REPO+'/actions/artifacts/'+str(ARTIFACT)+'/zip'],stdout=stream,check=True,timeout=120)
    assert archive.stat().st_size==SIZE and hashlib.sha256(archive.read_bytes()).hexdigest()==DIGEST
    path=ROOT/'scripts/qa/native-auth-session/inspect-original-xcresult.py';spec=importlib.util.spec_from_file_location('original_reader',path);reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
    extracted=private/'extracted'
    extraction=extract_original_result(archive,extracted,reader)
    manifest=reader.inspect_result(extracted/'result.xcresult',output)
    assert any(row['label']=='summary'and row['exitCode']==0 for row in manifest['commands'])
    reader.write_json(output/'original-receipt.json',dict(source=SOURCE,tree=TREE,originalRun=RUN,originalJob=JOB,artifact=ARTIFACT,archiveSha256=DIGEST,archiveBytes=SIZE,**extraction,originalEvidenceOnly=True,newAppRun=False,ciRerun=False,sourceAccepted=False,newCost=False,unavailableCommands=manifest['unavailableOrFailed']))

def extract_original_result(archive,extracted,reader):
    assert not extracted.exists()
    with zipfile.ZipFile(archive)as z:
        original=z.infolist();mapped=[]
        for item in original:
            alias=copy.copy(item)
            if alias.filename.startswith('default/result.xcresult/'):alias.filename=alias.filename[len('default/'):]
            mapped.append(alias)
        class Inventory:
            def infolist(self):return mapped
        entries,total,result_count=reader.safe_members(Inventory())
        assert len(entries)==len(original)and z.testzip()is None
        extracted.mkdir()
        for item,alias in zip(original,mapped):
            if not alias.filename.startswith('result.xcresult/'):continue
            target=extracted.joinpath(*alias.filename.rstrip('/').split('/'))
            if item.is_dir():target.mkdir(parents=True,exist_ok=True);continue
            target.parent.mkdir(parents=True,exist_ok=True)
            with z.open(item)as source,target.open('xb')as sink:shutil.copyfileobj(source,sink,length=1024*1024)
    assert(extracted/'result.xcresult/Info.plist').is_file()
    return dict(resultMembers=result_count,uncompressedBytes=total,allOriginalCrcsPassed=True)

def pack(private,destination,exit_code):
    assert not destination.exists();files=[p for p in(private/'export').rglob('*')if p.is_file()]if(private/'export').exists()else[]
    if(private/'read.log').is_file():files.append(private/'read.log')
    assert files and len(files)<20000 and sum(p.stat().st_size for p in files)<=256*1024*1024
    status=private/'inspection-status.json';assert not status.exists();status.write_text(json.dumps(dict(readerExit=exit_code,sourceAccepted=False,newAppRun=False)),encoding='utf-8');files.append(status)
    with tarfile.open(destination,'w:gz')as tar:
        for path in sorted(files):
            assert not path.is_symlink()and path.resolve().is_relative_to(private.resolve())
            tar.add(path,arcname=str(path.relative_to(private)),recursive=False)
    assert 0<destination.stat().st_size<=128*1024*1024

if __name__=='__main__':
    assert len(sys.argv)>=3
    mode=sys.argv[1];private=Path(sys.argv[2]).resolve()
    if mode=='read':assert len(sys.argv)==3;read_original(private)
    elif mode=='pack':assert len(sys.argv)==5;pack(private,Path(sys.argv[3]),int(sys.argv[4]))
    else:raise ValueError('Unknown original-evidence operation')
