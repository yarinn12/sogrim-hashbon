"""Read the one original c14 A APK; no build, installation or network activity."""
from pathlib import Path
import hashlib,json,subprocess,sys,zipfile
SOURCE='c14a7665e8de361d8d33be183e7a88adec3ff7cb';TREE='9bcf8cf40144d12507faa2cfea9ddadee42d819f'
def digest(b):return hashlib.sha256(b).hexdigest()
def verify(root,apk_path,audit_path,fixture_path):
    root=Path(root).resolve();apk_path=Path(apk_path).resolve()
    git=lambda *a:subprocess.check_output(['git','-C',str(root),*a],stderr=subprocess.PIPE)
    if git('rev-parse','HEAD').decode().strip()!=SOURCE or git('rev-parse','HEAD^{tree}').decode().strip()!=TREE:raise ValueError('Actual canonical source HEAD/tree differs from c14')
    audit=json.loads(Path(audit_path).read_text(encoding='utf-8'));fixture=json.loads(Path(fixture_path).read_text(encoding='utf-8'))
    if audit.get('sourceCommit')!=SOURCE or fixture.get('sourceCommit')!=SOURCE or audit.get('sourceTree')!=TREE or fixture.get('sourceTree')!=TREE or not audit.get('ready') or audit.get('errors')!=[]:raise ValueError('Canonical audit/source/fixture mismatch')
    if audit['apkSha256']!=digest(apk_path.read_bytes()):raise ValueError('Actual canonical A APK differs from audit')
    generated={'index.html','android-native-qa-fixture.js','cordova.js','cordova_plugins.js'}|{'assets/native-'+n for n in ['prelude.mjs','auth.mjs','core.mjs','account.mjs','experience.mjs','layers.css','style-loader.mjs']}
    rows=[]
    with zipfile.ZipFile(apk_path)as archive:
        if archive.testzip()is not None:raise ValueError('Actual canonical APK CRC failed')
        names=[i.filename for i in archive.infolist()if not i.is_dir()]
        if len(names)!=len(set(names)):raise ValueError('Duplicate canonical APK member')
        public={n[len('assets/public/'):]:archive.read(n)for n in names if n.startswith('assets/public/')}
        if set(public)!={a['path']for a in audit['assets']}:raise ValueError('Actual canonical asset inventory differs')
        for a in audit['assets']:
            name=a['path'];data=public[name]
            if len(data)!=a['length']or digest(data)!=a['sha256']:raise ValueError('Actual canonical asset bytes differ: '+name)
            canonical=name not in generated
            if canonical and data!=git('show',SOURCE+':'+name):raise ValueError('Packaged bytes differ from actual c14 Git blob: '+name)
            if not canonical and not(a.get('matchesWww')is True or name in ['cordova.js','cordova_plugins.js']and not data and a.get('emptyGeneratedStub')is True):raise ValueError('Generated asset lacks original WWW proof: '+name)
            rows.append({'path':name,'canonical':canonical,'font':bool(a.get('font')),'bytes':len(data),'sha256':digest(data)})
        index=public['index.html'];injected=b'<head>\n<script src="./android-native-qa-fixture.js"></script>'
        if index.count(injected)!=1 or digest(index)!=fixture['fixtureIndexSha256']or digest(index.replace(injected,b'<head>',1))!=fixture['originalBuiltIndexSha256']:raise ValueError('Actual original fixture/index lineage differs')
        if public['android-native-qa-fixture.js']!=git('show',SOURCE+':scripts/qa/android-native-isolated/fixture.js')or digest(public['android-native-qa-fixture.js'])!=fixture['fixtureSha256']:raise ValueError('Actual fixture JS differs from c14')
        manifest='\n'.join(f'{n}:{digest(b)}:{len(b)}'for n,b in sorted(public.items()))
        if digest(manifest.encode())!=audit['wwwManifestSha256']:raise ValueError('Actual WWW manifest differs')
        if len(rows)!=215 or sum(r['canonical']for r in rows)!=204 or sum(r['font']for r in rows)!=13 or {r['path']for r in rows if not r['canonical']}!=generated:raise ValueError('Require 215 actual assets, 204 Git assets and 13 fonts')
    return {'source':SOURCE,'tree':TREE,'actualApkSha256':audit['apkSha256'],'wwwManifestSha256':audit['wwwManifestSha256'],'assets':len(rows),'canonicalGitAssets':sum(r['canonical']for r in rows),'fonts':sum(r['font']for r in rows),'ready':True,'nativeAcceptance':False}
if __name__=='__main__':
    try:
        if len(sys.argv)!=5:raise ValueError('Require actual source root, A APK, original audit and fixture')
        print(json.dumps(verify(*sys.argv[1:]),separators=(',',':')))
    except Exception as error:
        print(str(error),file=sys.stderr);raise SystemExit(1)
