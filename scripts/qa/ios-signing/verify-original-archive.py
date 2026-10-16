import hashlib, importlib.util, json, os, pathlib, plistlib, subprocess, sys, tarfile, tempfile, zipfile

SOURCE='2cf78afc23c1d9330834de63ed5f81ba4da5b052'
TREE='52105dddf3b9a8edb61032c6149eac1b392c460a'
FILES={'SogrimHashbon.ipa','release-manifest.json','artifact-verification.json','source-ci-only.json','source-before-build.json','source-after-export.json','web-assets.json','Package.resolved'}

def require(value,message):
    if not value: raise ValueError(message)

def unpack(archive,destination):
    destination.mkdir(parents=True,exist_ok=True)
    with tarfile.open(archive,'r:') as tar:
        members=tar.getmembers()
        require(len(members)==8 and {m.name for m in members}==FILES,'Unexpected release archive entries')
        require(all(m.isfile() and not m.issym() and not m.islnk() for m in members),'Non-regular release archive entry')
        for m in members:
            target=destination/m.name
            require(not target.exists(),'Refuse to replace an existing release evidence file')
        for m in members:
            with (destination/m.name).open('xb') as out:
                with tar.extractfile(m) as data: out.write(data.read())

def verify_identity(root,envelope,origin):
    directory=root/'build/ios'
    identity=json.loads(envelope['aad'])
    require(identity['sourceCommit']==SOURCE and identity['sourceTree']==TREE,'Wrong authenticated source')
    require(identity['version']=='4.58' and identity['build']=='194','Wrong authenticated release')
    require(str(identity['buildRunId'])==origin['signingRunId'] and str(identity['buildRunAttempt'])=='1','Wrong authenticated signing run')
    sha=hashlib.sha256((directory/'SogrimHashbon.ipa').read_bytes()).hexdigest()
    require(sha==identity['ipaSha256']==origin['ipaSha256'],'Original IPA bytes changed')
    proof=json.loads((directory/'artifact-verification.json').read_text())
    manifest=json.loads((directory/'release-manifest.json').read_text())
    for r in (proof,manifest):
        require(r['sourceCommit']==SOURCE and r['sourceTree']==TREE and r['version']=='4.58' and r['build']=='194','Release evidence mismatch')
        require(r['ipaSha256']==sha and r['signatureVerified'] is True and r['everyWwwAssetMatches'] is True,'Original verification missing')
        require(r.get('everyWwwAssetMatchesCanonicalGitBuild') is True,'Original canonical Git verification missing')
        require(r['appleUploadPerformed'] is False,'Artifact was already marked as uploaded')
    require(manifest['sha256'].lower()==sha,'Manifest IPA hash mismatch')
    expected=json.loads((directory/'web-assets.json').read_text())
    canonical=expected.get('canonicalGit',{})
    require(canonical.get('sourceCommit')==SOURCE and canonical.get('sourceTree')==TREE,
            'Canonical asset proof belongs to another source')
    require(canonical.get('independentCanonicalBuild') is True and
            canonical.get('allArchiveBytesMatchGitBlobs') is True and
            canonical.get('gitInputCount',0)>500,'Original canonical Git byte proof missing')
    require(canonical.get('www')==expected.get('www'),'Original WWW map differs from canonical Git build')
    live=json.loads((directory/'live-ci-before-download.json').read_text())
    require(live['sourceCommit']==SOURCE and live['sourceTree']==TREE,'Live source fingerprint belongs to another source')
    for name in ('source-ci-only','source-before-build','source-after-export'):
        receipt=json.loads((directory/(name+'.json')).read_text())
        require(receipt['sourceCommit']==SOURCE and receipt['sourceTree']==TREE,'Source receipt mismatch')
        require(str(receipt['buildRunId'])==origin['signingRunId'] and str(receipt['buildRunAttempt'])=='1','Source receipt signing run mismatch')
        require(receipt['workflowCommit']==origin['signingTools'],'Wrong original signing tools')
        require(receipt['sourceInputs']==live['sourceInputs'],'Original source inputs differ from current pinned Git checkout')
        require(receipt['packageSha256']==live['packageSha256'] and
                receipt['packageLockSha256']==live['packageLockSha256'],'Original package inputs differ from current pinned Git checkout')
    return sha

def main():
    root=pathlib.Path.cwd(); directory=root/'build/ios'
    envelope=json.loads((directory/'original-encrypted/envelope.json').read_text())
    origin=json.loads((directory/'upload-origin.json').read_text())
    unpack(pathlib.Path(os.environ['RUNNER_TEMP'])/'sogrim-original-release.tar',directory)
    sha=verify_identity(root,envelope,origin)
    expected=json.loads((directory/'web-assets.json').read_text())
    require(expected['sourceCommit']==SOURCE and expected['sourceTree']==TREE,'Wrong original asset snapshot')
    spec=importlib.util.spec_from_file_location('original_web_guard',pathlib.Path(os.environ['GITHUB_WORKSPACE'])/'release-tools/scripts/qa/ios-signing/verify-web-assets.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    with zipfile.ZipFile(directory/'SogrimHashbon.ipa') as ipa: app=module.inspect_zip(ipa,expected)
    require(sys.platform=='darwin','Original codesign revalidation requires macOS')
    with tempfile.TemporaryDirectory(prefix='sogrim-original-upload-') as temp:
        subprocess.run(['/usr/bin/ditto','-x','-k',str(directory/'SogrimHashbon.ipa'),temp],check=True,capture_output=True)
        path=pathlib.Path(temp)/app
        subprocess.run(['/usr/bin/codesign','--verify','--deep','--strict',str(path)],check=True,capture_output=True)
        module.verify_signing_certificate(path, temp)
        signed=plistlib.loads(subprocess.run(['/usr/bin/codesign','-d','--entitlements',':-',str(path)],check=True,capture_output=True).stdout)
        profile=plistlib.loads(subprocess.run(['/usr/bin/security','cms','-D','-i',str(path/'embedded.mobileprovision')],check=True,capture_output=True).stdout)
        profile_proof=module.validate_profile(profile,signed)
    receipt={'sourceCommit':SOURCE,'sourceTree':TREE,'ipaSha256':sha,'originalSigningRunId':origin['signingRunId'],'rebuilt':False,'signatureReverified':True,'profile':profile_proof,'everyOriginalWebAssetMatches':True,'everyOriginalWebAssetMatchesCanonicalGitBuild':True,'originalSourceInputsMatchCurrentGit':True,'appleUploadPerformed':False}
    (directory/'original-artifact-before-upload.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print('Authenticated original IPA, complete original asset snapshot, signature and current profile verified; no rebuilding.')

if __name__=='__main__': main()
