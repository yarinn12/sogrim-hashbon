import hashlib,importlib.util,json,os,pathlib,plistlib,re,subprocess,sys,tarfile,tempfile,zipfile
from intake_bindings import (require,require_bindings,json_read,validate_origin,validate_first_creation,
    exact_fields,integer,digest,CI_PATHS,SIGNING_REF,VERSION,BUILD)
FILES={'SogrimHashbon.ipa','release-manifest.json','artifact-verification.json','source-ci-only.json','source-before-build.json','source-after-export.json','web-assets.json','Package.resolved'}

def validate_members(members):
    require(len(members)==8 and {m.name for m in members}==FILES,'Unexpected release archive entries')
    require(all(m.isfile() and not m.issym() and not m.islnk() for m in members),'Non-regular release archive entry')
    require(all(0<=m.size<=536870912 for m in members),'Oversized archive member')

def unpack(archive,destination):
    destination.mkdir(parents=True,exist_ok=True)
    with tarfile.open(archive,'r:') as tar:
        members=tar.getmembers();validate_members(members)
        for m in members:require(not (destination/m.name).exists(),'Refuse to replace an existing release evidence file')
        for m in members:
            with (destination/m.name).open('xb') as out:
                with tar.extractfile(m) as data:out.write(data.read())

def ci_identity(rows,pins):
    require(isinstance(rows,list) and len(rows)==4,'Four original CI receipts required')
    expected={value:CI_PATHS[key] for key,value in pins['application']['ciRuns'].items()}
    result=[]
    for row in rows:
        require(row.get('id') in expected,'Unbound source CI receipt')
        exact_fields(row,{'path':expected[row['id']],'source':pins['application']['sourceSha'],'attempt':1,'conclusion':'success'},'Source CI receipt differs')
        jobs=row.get('jobs');require(isinstance(jobs,list) and len(jobs)>0,'Source CI jobs missing')
        require(all(integer(j.get('id')) for j in jobs) and len({j['id'] for j in jobs})==len(jobs),'Source CI job identity invalid')
        for job in jobs:
            exact_fields(job,{'source':pins['application']['sourceSha'],'conclusion':'success'},'Source CI job differs')
            require(isinstance(job.get('name'),str) and job['name'],'Source CI job name missing')
        result.append({key:row[key] for key in ['id','path','source','attempt','conclusion']}|
            {'jobs':sorted(jobs,key=lambda job:job['id'])})
    require(len({r['id'] for r in rows})==4,'Duplicate source CI receipt')
    return sorted(result,key=lambda row:row['id'])

def verify_bundle(files,envelope,origin,live,pins=None):
    pins=require_bindings(pins);a,s=pins['application'],pins['signing'];validate_origin(origin,pins)
    require(set(files)==FILES,'Incomplete original archive')
    identity=json_read(envelope['aad'])
    exact_fields(identity,{'sourceCommit':a['sourceSha'],'sourceTree':a['sourceTree'],'version':VERSION,'build':BUILD,
        'buildRunId':s['runId'],'buildRunAttempt':'1','ipaSha256':s['ipaSha256']},'Wrong authenticated identity')
    ipa=files['SogrimHashbon.ipa'];sha=hashlib.sha256(ipa).hexdigest()
    require(len(ipa)==s['ipaSize'] and sha==s['ipaSha256']==origin['ipaSha256'],'Original IPA bytes changed')
    parse=lambda name:json_read(files[name].decode('utf-8'))
    proof,manifest=parse('artifact-verification.json'),parse('release-manifest.json')
    for receipt in (proof,manifest):
        exact_fields(receipt,{'sourceCommit':a['sourceSha'],'sourceTree':a['sourceTree'],'version':VERSION,'build':BUILD,
            'ipaSha256':sha,'signatureVerified':True,'everyWwwAssetMatches':True,
            'everyWwwAssetMatchesCanonicalGitBuild':True,'appleUploadPerformed':False},'Original artifact verification differs')
    require(manifest['sha256'].lower()==sha,'Manifest IPA hash mismatch')
    expected=parse('web-assets.json');canonical=expected.get('canonicalGit',{})
    exact_fields(expected,{'sourceCommit':a['sourceSha'],'sourceTree':a['sourceTree']},'Original asset source differs')
    exact_fields(canonical,{'sourceCommit':a['sourceSha'],'sourceTree':a['sourceTree'],
        'independentCanonicalBuild':True,'allArchiveBytesMatchGitBlobs':True},'Original canonical Git proof differs')
    require(integer(canonical.get('gitInputCount')) and canonical['gitInputCount']>500,'Incomplete canonical Git input proof')
    require(canonical.get('www')==expected.get('www') and isinstance(expected.get('www'),dict) and expected['www'],'Original WWW differs from canonical Git')
    exact_fields(live,{'sourceCommit':a['sourceSha'],'sourceTree':a['sourceTree']},'Live source fingerprint differs')
    require(isinstance(live.get('sourceInputs'),dict) and len(live['sourceInputs'])>500 and
        all(digest(v,64) for v in live['sourceInputs'].values()),'Incomplete live source fingerprint')
    live_ci=ci_identity(live.get('ci'),pins)
    first=None
    for phase in ['ci-only','before-build','after-export']:
        receipt=parse('source-'+phase+'.json')
        exact_fields(receipt,{'sourceCommit':a['sourceSha'],'sourceTree':a['sourceTree'],'phase':phase,
            'version':VERSION,'build':BUILD,'buildRunId':s['runId'],'buildRunAttempt':'1','workflowCommit':s['toolsSha'],
            'workflowRef':SIGNING_REF,'appleUploadPerformed':False},'Original source receipt differs')
        current=validate_first_creation(receipt.get('firstCreation'),origin,pins)
        require(first is None or current==first,'firstCreation differs across original receipts');first=current
        require(receipt.get('sourceInputs')==live['sourceInputs'],'Original source inputs differ from current pinned Git')
        require(receipt.get('packageSha256')==live.get('packageSha256') and
            receipt.get('packageLockSha256')==live.get('packageLockSha256'),'Original package inputs differ from current pinned Git')
        require(digest(receipt.get('packageSha256'),64) and digest(receipt.get('packageLockSha256'),64),'Original package digest missing')
        require(ci_identity(receipt.get('ci'),pins)==live_ci,'Original CI jobs differ from verified live CI')
    return sha

def verify_identity(root,envelope,origin,pins=None):
    pins=require_bindings(pins);directory=root/'build/ios'
    return verify_bundle({name:(directory/name).read_bytes() for name in FILES},envelope,origin,
        json_read((directory/'live-ci-before-download.json').read_text(encoding='utf-8')),pins)

def common_www_receipt(expected,verified,pins=None):
    """Export only typed hashes after the original signed IPA was reverified."""
    pins=require_bindings(pins);a,s=pins['application'],pins['signing']
    for record in (expected,verified):
        exact_fields(record,{'sourceCommit':a['sourceSha'],'sourceTree':a['sourceTree']},'Common WWW source mismatch')
    require(verified.get('ipaSha256')==s['ipaSha256'],'Common WWW original IPA mismatch')
    for name in ('signatureReverified','everyOriginalWebAssetMatches','everyOriginalWebAssetMatchesCanonicalGitBuild',
                 'originalSourceInputsMatchCurrentGit','firstCreationVerified'):
        require(verified.get(name) is True,'Original signed WWW proof incomplete')
    require(verified.get('rebuilt') is False and verified.get('appleUploadPerformed') is False,'Original package phase required')
    canonical=expected.get('canonicalGit',{});assets=expected.get('www')
    exact_fields(canonical,{'sourceCommit':a['sourceSha'],'sourceTree':a['sourceTree']},'Common WWW canonical source mismatch')
    require(canonical.get('independentCanonicalBuild') is True and canonical.get('allArchiveBytesMatchGitBlobs') is True
            and integer(canonical.get('gitInputCount')) and canonical['gitInputCount']>500,'Complete canonical WWW proof required')
    require(type(assets) is dict and 0<len(assets)<=10000 and canonical.get('www')==assets,'Exact nonempty canonical WWW map required')
    for path,value in assets.items():
        require(type(path) is str and len(path)<=1024 and re.fullmatch(r'[A-Za-z0-9._/-]+',path)
                and all(part and part not in ('.','..') for part in path.split('/')),'Unsafe public asset path')
        require(digest(value,64),'Asset digest must be a SHA256')
    assets=dict(sorted(assets.items()))
    core={'schemaVersion':1,'sourceCommit':a['sourceSha'],'sourceTree':a['sourceTree'],'ipaSha256':s['ipaSha256'],'www':assets}
    raw=json.dumps(core,sort_keys=True,separators=(',',':')).encode('utf-8')
    return {'commonWwwProofScope':'ORIGINAL_SIGNED_IPA_WWW_ONLY','commonWwwAssetSha256':assets,
            'commonWwwFileCount':len(assets),'commonWwwManifestSha256':hashlib.sha256(raw).hexdigest()}

def main():
    pins=require_bindings();root=pathlib.Path.cwd();directory=root/'build/ios'
    envelope=json_read((directory/'original-encrypted/envelope.json').read_text(encoding='utf-8'))
    origin=json_read((directory/'upload-origin.json').read_text(encoding='utf-8'));validate_origin(origin,pins)
    unpack(pathlib.Path(os.environ['RUNNER_TEMP'])/'sogrim-original-release.tar',directory)
    sha=verify_identity(root,envelope,origin,pins)
    expected=json_read((directory/'web-assets.json').read_text(encoding='utf-8'))
    spec=importlib.util.spec_from_file_location('original_web_guard',pathlib.Path(os.environ['GITHUB_WORKSPACE'])/'release-tools/scripts/qa/ios-signing/verify-web-assets.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    with zipfile.ZipFile(directory/'SogrimHashbon.ipa') as ipa:app=module.inspect_zip(ipa,expected)
    require(sys.platform=='darwin','Original codesign revalidation requires macOS')
    with tempfile.TemporaryDirectory(prefix='sogrim-original-upload-') as temp:
        subprocess.run(['/usr/bin/ditto','-x','-k',str(directory/'SogrimHashbon.ipa'),temp],check=True,capture_output=True)
        path=pathlib.Path(temp)/app
        subprocess.run(['/usr/bin/codesign','--verify','--deep','--strict',str(path)],check=True,capture_output=True)
        module.verify_signing_certificate(path,temp)
        signed=plistlib.loads(subprocess.run(['/usr/bin/codesign','-d','--entitlements',':-',str(path)],check=True,capture_output=True).stdout)
        profile=plistlib.loads(subprocess.run(['/usr/bin/security','cms','-D','-i',str(path/'embedded.mobileprovision')],check=True,capture_output=True).stdout)
        profile_proof=module.validate_profile(profile,signed)
    receipt={'sourceCommit':pins['application']['sourceSha'],'sourceTree':pins['application']['sourceTree'],'ipaSha256':sha,
        'originalSigningRunId':origin['signingRunId'],'signingRunNumber':origin['signingRunNumber'],
        'rebuilt':False,'signatureReverified':True,'profile':profile_proof,'everyOriginalWebAssetMatches':True,
        'everyOriginalWebAssetMatchesCanonicalGitBuild':True,'originalSourceInputsMatchCurrentGit':True,
        'firstCreationVerified':True,'appleUploadPerformed':False}
    receipt.update(common_www_receipt(expected,receipt,pins))
    (directory/'original-artifact-before-upload.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
    print('Original Nov5 firstCreation/source receipts, IPA, assets, signature and profile verified; no rebuilding.')
if __name__=='__main__':main()
