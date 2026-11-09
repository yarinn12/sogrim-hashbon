from unittest.mock import patch
import base64,copy,hashlib,importlib.util,io,json,pathlib,re,sys,tarfile,tempfile,types,unittest,zipfile
sys.dont_write_bytecode=True
def load_guard(name,filename):
    if name in sys.modules:return sys.modules[name]
    spec=importlib.util.spec_from_file_location(name,pathlib.Path(__file__).with_name(filename))
    module=importlib.util.module_from_spec(spec);sys.modules[name]=module;spec.loader.exec_module(module);return module
guard=load_guard('ios_intake_archive_memory','verify-original-archive.py')
encryption=load_guard('ios_intake_envelope_memory','extract-intake-envelope.py')
bindings=load_guard('intake_bindings','intake_bindings.py')
DATA=json.loads((pathlib.Path(__file__).resolve().parents[3]/'tests/fixtures/ios195-envelope-intake.json').read_text(encoding='utf-8'))
assert DATA['scope']=='SYNTHETIC_ONLY_NOT_AN_ARTIFACT_OR_RELEASE'
clone=copy.deepcopy
def bundle():
    pins=clone(DATA['pins']);a,s=pins['application'],pins['signing']
    required=DATA['controlFiles']['scripts/qa/ios-signing/source-ci-required-jobs.mjs']
    names=json.loads(re.search(r'Object.freeze\((\[[\s\S]*?\])\)',required).group(1))
    ci=[]
    for n,(key,path) in enumerate(bindings.CI_PATHS.items()):
        lane=names if n==0 else [['windows-unit'],['linux-font-provenance'],['native']][n-1]
        ci.append({'id':a['ciRuns'][key],'path':path,'source':a['sourceSha'],'attempt':1,'conclusion':'success',
            'jobs':[{'id':720000+n*100+i,'name':name,'source':a['sourceSha'],'conclusion':'success'} for i,name in enumerate(lane)]})
    live={'sourceCommit':a['sourceSha'],'sourceTree':a['sourceTree'],'sourceInputs':{'src/input'+str(i)+'.mjs':'a'*64 for i in range(501)},
        'packageSha256':'b'*64,'packageLockSha256':'c'*64,'ci':ci}
    proof={'sourceCommit':a['sourceSha'],'sourceTree':a['sourceTree'],'version':'4.59','build':'195',
        'ipaSha256':s['ipaSha256'],'sha256':s['ipaSha256'],'signatureVerified':True,'everyWwwAssetMatches':True,
        'everyWwwAssetMatchesCanonicalGitBuild':True,'appleUploadPerformed':False}
    files={'SogrimHashbon.ipa':base64.b64decode(DATA['ipaBase64']),'Package.resolved':b'synthetic package'}
    put=lambda n,d:files.update({n:json.dumps(d).encode()})
    for name in ['artifact-verification.json','release-manifest.json']:put(name,proof)
    for phase in ['ci-only','before-build','after-export']:
        put('source-'+phase+'.json',dict(clone(live),phase=phase,version='4.59',build='195',buildRunId=s['runId'],
            buildRunAttempt='1',workflowCommit=s['toolsSha'],workflowRef=bindings.SIGNING_REF,
            appleUploadPerformed=False,firstCreation=clone(DATA['firstCreation'])))
    put('web-assets.json',{'sourceCommit':a['sourceSha'],'sourceTree':a['sourceTree'],'www':{'index.html':'d'*64},
        'canonicalGit':{'sourceCommit':a['sourceSha'],'sourceTree':a['sourceTree'],'gitInputCount':501,
            'allArchiveBytesMatchGitBlobs':True,'independentCanonicalBuild':True,'www':{'index.html':'d'*64}}})
    return files,clone(DATA['envelope']),clone(DATA['origin']),live,pins
def mutate(files,name,fn):
    value=json.loads(files[name]);fn(value);files[name]=json.dumps(value).encode()
class IdentityTests(unittest.TestCase):
    def test_exact_original_identity_and_all_three_first_creation_receipts(self):
        f,e,o,l,p=bundle();self.assertEqual(guard.verify_bundle(f,e,o,l,p),p['signing']['ipaSha256'])
    def test_old_accepts_missing_first_creation_final_rejects(self):
        f,e,o,l,p=bundle()
        for phase in ['ci-only','before-build','after-export']:mutate(f,'source-'+phase+'.json',lambda r:r.pop('firstCreation'))
        source=DATA['oldArchiveVerifier']
        source=re.sub(r"^SOURCE='[^']+'","SOURCE="+repr(p['application']['sourceSha']),source,flags=re.M)
        source=re.sub(r"^TREE='[^']+'","TREE="+repr(p['application']['sourceTree']),source,flags=re.M)
        old=types.ModuleType('old_archive_control');exec(compile(source,'<old-archive>','exec'),old.__dict__)
        virtual=dict(f,**{'live-ci-before-download.json':json.dumps(l).encode()})
        class MemoryPath:
            def __init__(self,name=''):self.name=name
            def __truediv__(self,other):return MemoryPath(self.name+'/'+other)
            def read_bytes(self):return virtual[self.name.rsplit('/',1)[-1]]
            def read_text(self,*args,**kwargs):return self.read_bytes().decode()
        self.assertEqual(old.verify_identity(MemoryPath(),e,o),p['signing']['ipaSha256'])
        self.assertRaises(ValueError,guard.verify_bundle,f,e,o,l,p)
    def test_pending_stops_actual_entrypoints_before_original_reads(self):
        class NoAccess:
            def __truediv__(self,other):raise AssertionError('PATH_ACCESSED')
        pending=clone(DATA['pins']);pending['signing']['runId']='PENDING'
        original_read=pathlib.Path.read_text
        def pending_read(path,*args,**kwargs):
            return json.dumps(pending) if path.name=='intake-bindings.json' else original_read(path,*args,**kwargs)
        with patch.object(pathlib.Path,'read_text',pending_read):
            self.assertRaisesRegex(ValueError,'PENDING',guard.verify_identity,NoAccess(),{}, {})
            self.assertRaisesRegex(ValueError,'PENDING',guard.main)
            self.assertRaisesRegex(ValueError,'PENDING',encryption.main)
            self.assertRaisesRegex(ValueError,'PENDING',encryption.extract_components,b'not-read',NoAccess())
    def test_nonfinite_json_is_rejected(self):
        for value in ['NaN','Infinity','-Infinity']:self.assertRaises(ValueError,bindings.json_read,'{"counter":'+value+'}')
def reject_bundle(label,fn):
    def case(self):
        f,e,o,l,p=bundle();fn(f,e,o,l,p)
        self.assertRaises((ValueError,KeyError,TypeError),guard.verify_bundle,f,e,o,l,p)
    setattr(IdentityTests,'test_reject_'+label,case)
for phase in ['ci-only','before-build','after-export']:
    name='source-'+phase+'.json'
    reject_bundle(phase+'_missing_proof',lambda f,e,o,l,p,n=name:mutate(f,n,lambda r:r.pop('firstCreation')))
    for key,value in [('phase','wrong'),('workflowCommit','e'*40),('workflowRef','old'),('buildRunId','1'),('buildRunAttempt','2'),
        ('sourceCommit','e'*40),('sourceTree','e'*40),('version','4.58'),('build','194'),('appleUploadPerformed',True),
        ('sourceInputs',{}),('packageSha256','f'*64),('packageLockSha256','f'*64),('ci',[])]:
        reject_bundle(phase+'_'+key,lambda f,e,o,l,p,n=name,k=key,v=value:mutate(f,n,lambda r:r.update({k:v})))
    for key,value in [('runNumberCounterOnly',3),('runAttempt',2),('branchCreated',False),('before','e'*40),
        ('forced',True),('deleted',True),('historyReads',1),('historyCounts',[1,2]),('historyPages',[1,1]),
        ('priorRetainedRuns',1),('controlSha','e'*40),('runId',1),('workflowPath','old'),('ready',False),('appleSigningPerformed',True),
        ('appleUploadPerformed',True),('unknown',True)]:
        reject_bundle(phase+'_proof_'+key,lambda f,e,o,l,p,n=name,k=key,v=value:mutate(f,n,lambda r:r['firstCreation'].update({k:v})))
for name in ['artifact-verification.json','release-manifest.json']:
    for key,value in [('signatureVerified',False),('everyWwwAssetMatches',False),('everyWwwAssetMatchesCanonicalGitBuild',False),
        ('appleUploadPerformed',True),('sourceCommit','e'*40),('sourceTree','e'*40),('ipaSha256','f'*64)]:
        reject_bundle(name+'_'+key,lambda f,e,o,l,p,n=name,k=key,v=value:mutate(f,n,lambda r:r.update({k:v})))
for key,value in [('independentCanonicalBuild',False),('allArchiveBytesMatchGitBlobs',False),('gitInputCount',500),
    ('sourceTree','e'*40),('www',{'index.html':'f'*64})]:
    reject_bundle('canonical_'+key,lambda f,e,o,l,p,k=key,v=value:mutate(f,'web-assets.json',lambda r:r['canonicalGit'].update({k:v})))
for key,value in [('sourceCommit','e'*40),('sourceTree','e'*40),('sourceInputs',{}),('packageLockSha256','f'*64),('ci',[])]:
    reject_bundle('live_'+key,lambda f,e,o,l,p,k=key,v=value:l.update({k:v}))
for key,value in [('signingRunNumber',3),('firstCreationStepPassed',False),('signingTools','e'*40),
    ('signingRunAttempt','2'),('artifactId','1'),('artifactSize',1),('artifactDigest','sha256:'+'f'*64),
    ('ipaSize',1),('signingControlHashes',{}),('signingSteps',[]),('databaseAccepted',True),('distributionAllowed',True)]:
    reject_bundle('origin_'+key,lambda f,e,o,l,p,k=key,v=value:o.update({k:v}))
reject_bundle('changed_ipa',lambda f,e,o,l,p:f.update({'SogrimHashbon.ipa':b'changed'}))
reject_bundle('missing_member',lambda f,e,o,l,p:f.pop('Package.resolved'))
reject_bundle('aad_run',lambda f,e,o,l,p:e.update({'aad':json.dumps(dict(json.loads(e['aad']),buildRunId='1'))}))
for key,value in [('id','1'),('attempt',2),('conclusion','failure'),('path','old'),('jobs',[])]:
    reject_bundle('live_ci_'+key,lambda f,e,o,l,p,k=key,v=value:l['ci'][0].update({k:v}))
reject_bundle('live_ci_job',lambda f,e,o,l,p:l['ci'][0]['jobs'][0].update({'conclusion':'skipped'}))
reject_bundle('live_ci_duplicate',lambda f,e,o,l,p:l['ci'].append(l['ci'][0]))
class EnvelopeTests(unittest.TestCase):
    def test_exact_ciphertext_identity_without_key_or_decryption(self):
        p=clone(DATA['pins']);result=encryption.verify_envelope(base64.b64decode(DATA['ciphertextBase64']),DATA['envelope'],p)
        self.assertEqual(result['sourceCommit'],p['application']['sourceSha'])
    def test_ciphertext_and_all_authenticated_identity_fields(self):
        p=clone(DATA['pins']);cipher=base64.b64decode(DATA['ciphertextBase64'])
        self.assertRaises(ValueError,encryption.verify_envelope,cipher+b'x',DATA['envelope'],p)
        for key in ['context','sourceCommit','sourceTree','version','build','buildRunId','buildRunAttempt','ipaSha256']:
            with self.subTest(key=key):
                e=clone(DATA['envelope']);a=json.loads(e['aad']);a[key]='wrong';e['aad']=json.dumps(a)
                self.assertRaises(ValueError,encryption.verify_envelope,cipher,e,p)
        for key in ['format','algorithm','kdf','ciphertextSha256','salt','iv','tag','plaintextSha256']:
            with self.subTest(key=key):
                e=clone(DATA['envelope']);e[key]='wrong'
                self.assertRaises((ValueError,TypeError),encryption.verify_envelope,cipher,e,p)
class MemberTests(unittest.TestCase):
    def members(self):return [tarfile.TarInfo(n) for n in sorted(guard.FILES)]
    def test_exact_eight_regular_members(self):guard.validate_members(self.members())
    def test_escape_duplicate_symlink_hardlink_and_size(self):
        for kind in ['escape','duplicate','symlink','hardlink','size','missing']:
            with self.subTest(kind=kind):
                m=self.members()
                if kind=='escape':m[0].name='../escape'
                if kind=='duplicate':m[0].name=m[1].name
                if kind=='symlink':m[0].type=tarfile.SYMTYPE
                if kind=='hardlink':m[0].type=tarfile.LNKTYPE
                if kind=='size':m[0].size=536870913
                if kind=='missing':m.pop()
                self.assertRaises(ValueError,guard.validate_members,m)

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

class MemoryFolder:
    def __init__(self,files=None):self.files={} if files is None else files
    def __truediv__(self,name):
        files=self.files
        class Entry:
            def exists(self):return name in files
            def open(self,mode):
                assert mode=='xb' and name not in files
                class Output(io.BytesIO):
                    def __exit__(self,*args):files[name]=self.getvalue();self.close()
                return Output()
        return Entry()
class ZipEnvelopeTests(unittest.TestCase):
    def archive(self,change=None):
        out=io.BytesIO();envelope=clone(DATA['envelope'])
        names=[('release.tar.enc',base64.b64decode(DATA['ciphertextBase64'])),('envelope.json',json.dumps(envelope).encode())]
        if change:change(names,envelope)
        with zipfile.ZipFile(out,'w') as archive:
            for name,data in names:archive.writestr(name,data)
        raw=out.getvalue();pins=clone(DATA['pins']);pins['signing'].update(artifactSize=len(raw),zipSha256=hashlib.sha256(raw).hexdigest())
        return raw,pins
    def test_exact_original_zip_extracts_only_two_components_in_memory(self):
        raw,pins=self.archive();folder=MemoryFolder()
        encryption.extract_components(raw,folder,pins)
        self.assertEqual(set(folder.files),{'release.tar.enc','envelope.json'})
        self.assertEqual(folder.files['release.tar.enc'],base64.b64decode(DATA['ciphertextBase64']))
    def test_zip_digest_and_size_reject_before_any_write(self):
        raw,pins=self.archive()
        for key,value in [('artifactSize',len(raw)+1),('zipSha256','f'*64)]:
            bad=clone(pins);bad['signing'][key]=value;folder=MemoryFolder()
            self.assertRaises(ValueError,encryption.extract_components,raw,folder,bad);self.assertEqual(folder.files,{})
    def test_bad_components_and_existing_files_reject_before_any_write(self):
        def extra(names,envelope):names.append(('extra',b'not allowed'))
        def escape(names,envelope):names[0]=('../release.tar.enc',names[0][1])
        def cipher(names,envelope):names[0]=(names[0][0],b'changed')
        def aad(names,envelope):
            identity=json.loads(envelope['aad']);identity['buildRunId']='1';envelope['aad']=json.dumps(identity);names[1]=(names[1][0],json.dumps(envelope).encode())
        for change in [extra,escape,cipher,aad]:
            raw,pins=self.archive(change);folder=MemoryFolder()
            self.assertRaises(ValueError,encryption.extract_components,raw,folder,pins);self.assertEqual(folder.files,{})
        raw,pins=self.archive();folder=MemoryFolder({'envelope.json':b'preserve'})
        self.assertRaises(ValueError,encryption.extract_components,raw,folder,pins);self.assertEqual(folder.files,{'envelope.json':b'preserve'})

class CommonWwwReceiptTests(unittest.TestCase):
    def scenario(self):
        files,envelope,origin,live,pins=bundle()
        sha=guard.verify_bundle(files,envelope,origin,live,pins)
        receipt={'sourceCommit':pins['application']['sourceSha'],'sourceTree':pins['application']['sourceTree'],
            'ipaSha256':sha,'rebuilt':False,'signatureReverified':True,'everyOriginalWebAssetMatches':True,
            'everyOriginalWebAssetMatchesCanonicalGitBuild':True,'originalSourceInputsMatchCurrentGit':True,
            'firstCreationVerified':True,'appleUploadPerformed':False}
        return json.loads(files['web-assets.json']),receipt,pins
    def test_verified_original_package_exports_complete_hashes_with_bound_source_and_ipa(self):
        assets,receipt,pins=self.scenario();out=guard.common_www_receipt(assets,receipt,pins)
        self.assertEqual(out['commonWwwAssetSha256'],assets['www']);self.assertEqual(out['commonWwwFileCount'],1)
        core={'schemaVersion':1,'sourceCommit':receipt['sourceCommit'],'sourceTree':receipt['sourceTree'],
            'ipaSha256':receipt['ipaSha256'],'www':assets['www']}
        self.assertEqual(out['commonWwwManifestSha256'],hashlib.sha256(json.dumps(core,sort_keys=True,separators=(',',':')).encode()).hexdigest())
    def test_original_signed_or_canonical_source_mismatch_is_rejected(self):
        for where,key in [('assets','sourceCommit'),('assets','sourceTree'),('receipt','sourceCommit'),('receipt','sourceTree'),('receipt','ipaSha256')]:
            with self.subTest(where=where,key=key):
                a,r,p=self.scenario();(a if where=='assets'else r)[key]='9'*len((a if where=='assets'else r)[key])
                self.assertRaises(ValueError,guard.common_www_receipt,a,r,p)
    def test_changed_or_empty_common_assets_are_rejected(self):
        for change in [lambda a:a['www'].update({'extra.js':'a'*64}),lambda a:a.update(www={}),lambda a:a['canonicalGit'].update(sourceTree='9'*40)]:
            a,r,p=self.scenario();change(a);self.assertRaises(ValueError,guard.common_www_receipt,a,r,p)
    def test_unsafe_asset_names_cannot_export_unreviewed_data_paths(self):
        for name in ['../secret','/absolute','a//b','a/./b','a/../b','a\\b','https://foreign.invalid/x','owner@example.invalid']:
            with self.subTest(name=name):
                a,r,p=self.scenario();a['www']={name:'a'*64};a['canonicalGit']['www']=dict(a['www']);self.assertRaises(ValueError,guard.common_www_receipt,a,r,p)
    def test_digest_fields_cannot_contain_cleartext_or_noncanonical_values(self):
        for value in ['owner@example.invalid','0'*64,'A'*64,'x'*64,1,None]:
            with self.subTest(value=value):
                a,r,p=self.scenario();a['www']={'index.html':value};a['canonicalGit']['www']=dict(a['www']);self.assertRaises(ValueError,guard.common_www_receipt,a,r,p)
    def test_all_original_signature_and_phase_flags_are_strict_booleans(self):
        for name in ['signatureReverified','everyOriginalWebAssetMatches','everyOriginalWebAssetMatchesCanonicalGitBuild','originalSourceInputsMatchCurrentGit','firstCreationVerified','rebuilt','appleUploadPerformed']:
            for value in [None,1,0,'true']:
                with self.subTest(name=name,value=value):
                    a,r,p=self.scenario();r[name]=value;self.assertRaises(ValueError,guard.common_www_receipt,a,r,p)
    def test_manifest_projection_omits_unrelated_metadata_and_private_fields(self):
        a,r,p=self.scenario();a['email']='never-export@example.invalid';r['snapshot']={'name':'Private tester','email':'never-export@example.invalid'}
        out=guard.common_www_receipt(a,r,p);self.assertEqual(set(out),{'commonWwwProofScope','commonWwwAssetSha256','commonWwwFileCount','commonWwwManifestSha256'})
        self.assertNotIn('@',json.dumps(out));self.assertNotIn('Private tester',json.dumps(out))

if __name__=='__main__':unittest.main()
