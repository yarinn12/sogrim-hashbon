import copy, hashlib, importlib.util, io, json, pathlib, tarfile, tempfile, unittest
tempfile.tempdir=str(pathlib.Path(__file__).resolve().parent)
spec=importlib.util.spec_from_file_location('original',pathlib.Path(__file__).with_name('verify-original-archive.py'))
guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)

class ArchiveTests(unittest.TestCase):
    def archive(self,path,names=None,symlink=False):
        with tarfile.open(path,'w') as tar:
            for n in names if names is not None else sorted(guard.FILES):
                entry=tarfile.TarInfo(n);data=b'fixture'
                if symlink and n=='SogrimHashbon.ipa': entry.type=tarfile.SYMTYPE;entry.linkname='/tmp/other'
                else: entry.size=len(data)
                tar.addfile(entry,io.BytesIO(data) if entry.isfile() else None)
    def test_exact_regular_archive(self):
        with tempfile.TemporaryDirectory() as t:
            p=pathlib.Path(t);self.archive(p/'a.tar');guard.unpack(p/'a.tar',p/'out');self.assertEqual({f.name for f in (p/'out').iterdir()},guard.FILES)
    def test_path_escape(self):
        with tempfile.TemporaryDirectory() as t:
            p=pathlib.Path(t);self.archive(p/'a.tar',[*sorted(guard.FILES)[:-1],'../escape']);self.assertRaises(ValueError,guard.unpack,p/'a.tar',p/'out')
    def test_duplicate(self):
        with tempfile.TemporaryDirectory() as t:
            p=pathlib.Path(t);names=sorted(guard.FILES);names[-1]=names[0];self.archive(p/'a.tar',names);self.assertRaises(ValueError,guard.unpack,p/'a.tar',p/'out')
    def test_symlink(self):
        with tempfile.TemporaryDirectory() as t:
            p=pathlib.Path(t);self.archive(p/'a.tar',symlink=True);self.assertRaises(ValueError,guard.unpack,p/'a.tar',p/'out')
    def test_existing_evidence_preserved(self):
        with tempfile.TemporaryDirectory() as t:
            p=pathlib.Path(t);self.archive(p/'a.tar');(p/'out').mkdir();(p/'out/SogrimHashbon.ipa').write_bytes(b'original');self.assertRaises(ValueError,guard.unpack,p/'a.tar',p/'out');self.assertEqual((p/'out/SogrimHashbon.ipa').read_bytes(),b'original')
    def test_wrong_authenticated_source_rejected_before_reading_ipa(self):
        self.assertRaises(ValueError,guard.verify_identity,pathlib.Path('.'),{'aad':json.dumps({'sourceCommit':'0'*40,'sourceTree':guard.TREE})},{})

class IdentityTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=pathlib.Path(self.temp.name)
        self.directory=self.root/'build/ios'
        self.directory.mkdir(parents=True)
        data=b'synthetic IPA bytes for identity-boundary controls'
        (self.directory/'SogrimHashbon.ipa').write_bytes(data)
        sha=hashlib.sha256(data).hexdigest()
        self.origin={'ipaSha256':sha,'signingRunId':'123','signingTools':'e'*40}
        self.envelope={'aad':json.dumps({'sourceCommit':guard.SOURCE,'sourceTree':guard.TREE,
            'version':'4.58','build':'194','buildRunId':'123','buildRunAttempt':'1','ipaSha256':sha})}
        proof={'sourceCommit':guard.SOURCE,'sourceTree':guard.TREE,'version':'4.58','build':'194',
            'ipaSha256':sha,'sha256':sha,'signatureVerified':True,'everyWwwAssetMatches':True,
            'everyWwwAssetMatchesCanonicalGitBuild':True,'appleUploadPerformed':False}
        self.write('artifact-verification.json',proof)
        self.write('release-manifest.json',proof)
        receipt={'sourceCommit':guard.SOURCE,'sourceTree':guard.TREE,'buildRunId':'123',
            'buildRunAttempt':'1','workflowCommit':'e'*40,'sourceInputs':{'src/input.mjs':'a'*64},
            'packageSha256':'b'*64,'packageLockSha256':'c'*64}
        for name in ('source-ci-only','source-before-build','source-after-export','live-ci-before-download'):
            self.write(name+'.json',receipt)
        self.write('web-assets.json',{'www':{'index.html':'d'*64},'canonicalGit':{
            'sourceCommit':guard.SOURCE,'sourceTree':guard.TREE,'gitInputCount':501,
            'allArchiveBytesMatchGitBlobs':True,'independentCanonicalBuild':True,
            'www':{'index.html':'d'*64}}})

    def write(self,name,data):
        (self.directory/name).write_text(json.dumps(data),encoding='utf-8')

    def mutate(self,name,change):
        data=json.loads((self.directory/name).read_text(encoding='utf-8'))
        change(data)
        self.write(name,data)

    def verify(self):
        return guard.verify_identity(self.root,self.envelope,self.origin)

    def test_original_identity_and_canonical_inputs_match(self):
        self.assertEqual(self.verify(),self.origin['ipaSha256'])

    def test_old_only_www_acceptance_cannot_replace_canonical_proof(self):
        self.mutate('artifact-verification.json',lambda data:data.pop('everyWwwAssetMatchesCanonicalGitBuild'))
        with self.assertRaisesRegex(ValueError,'canonical Git verification'):
            self.verify()

    def test_changed_original_input_is_rejected_against_live_git(self):
        self.mutate('source-after-export.json',lambda data:data['sourceInputs'].update({'src/input.mjs':'f'*64}))
        with self.assertRaisesRegex(ValueError,'source inputs differ'):
            self.verify()

    def test_changed_package_lock_is_rejected(self):
        self.mutate('source-before-build.json',lambda data:data.update({'packageLockSha256':'f'*64}))
        with self.assertRaisesRegex(ValueError,'package inputs differ'):
            self.verify()

    def test_wrong_live_source_is_rejected(self):
        self.mutate('live-ci-before-download.json',lambda data:data.update({'sourceCommit':'0'*40}))
        with self.assertRaisesRegex(ValueError,'Live source fingerprint'):
            self.verify()

    def test_missing_or_wrong_canonical_source_is_rejected(self):
        self.mutate('web-assets.json',lambda data:data['canonicalGit'].update({'sourceTree':'0'*40}))
        with self.assertRaisesRegex(ValueError,'another source'):
            self.verify()

    def test_changed_canonical_map_is_rejected(self):
        self.mutate('web-assets.json',lambda data:data['canonicalGit']['www'].update({'index.html':'f'*64}))
        with self.assertRaisesRegex(ValueError,'WWW map differs'):
            self.verify()

if __name__=='__main__':unittest.main()
