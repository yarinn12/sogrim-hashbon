"""Synthetic ZIP members only, never an installable APK or real signature."""
from pathlib import Path
import json,hashlib,zipfile,sys
root=Path(sys.argv[1]);control=Path(sys.argv[2]).read_bytes().replace(b'\r\n',b'\n');fault=sys.argv[3]
sha=lambda b:hashlib.sha256(b).hexdigest()
public={'index.html':b'<head><script src="android-native-qa-fixture.js"></script></head>','android-native-qa-fixture.js':b'synthetic fixture'}
public.update({f'fonts/{i}.woff2':b'synthetic font '+str(i).encode()for i in range(13)})
public.update({f'assets/{i}.css':b'synthetic css '+str(i).encode()for i in range(200)})
product={'assets/public/'+n:b for n,b in public.items()}
product.update({'classes.dex':b'synthetic DEX','resources.arsc':b'synthetic resources','AndroidManifest.xml':b'synthetic native manifest','META-INF/CERT.SF':b'synthetic signature A'})
other=dict(product);other['assets/public/index.html']=control;other['META-INF/CERT.SF']=b'synthetic signature B'
for kind,path in [('dex','classes.dex'),('resource','resources.arsc'),('css','assets/public/assets/0.css'),('font','assets/public/fonts/0.woff2'),('index','assets/public/index.html')]:
    if fault==kind:other[path]+=b' changed'
if fault=='extra':other['extra.bin']=b'changed member inventory'
for name,contents in [('A',product),('B',other)]:
    with zipfile.ZipFile(root/(name+'.apk'),'w',compression=zipfile.ZIP_DEFLATED)as z:
        for path,b in contents.items():z.writestr(path,b)
        if fault=='duplicate'and name=='B':z.writestr('classes.dex',b'duplicate synthetic')
audit={'sourceCommit':'c14a7665e8de361d8d33be183e7a88adec3ff7cb','sourceTree':'9bcf8cf40144d12507faa2cfea9ddadee42d819f','ready':True,'nativeDiagnosticAbsent':True,'errors':[],'apkSha256':sha((root/'A.apk').read_bytes()),'assets':[{'path':n,'sha256':sha(b),'length':len(b),'font':n.startswith('fonts/')}for n,b in public.items()]}
fixture={'sourceCommit':audit['sourceCommit'],'sourceTree':audit['sourceTree'],'fixtureIndexSha256':sha(public['index.html']),'privateEnvDisabled':True,'bootstrapIsSynthetic':True,'nativeDiagnosticAbsent':True,'runtimeSourceChanged':False,'productCssChanged':False}
if fault=='old-source':fixture['sourceCommit']='59b599c24341e4659bce62b02c9d78fce3dd050d'
if fault=='bad-audit':audit['apkSha256']='f'*64
(root/'audit.json').write_text(json.dumps(audit),encoding='utf-8');(root/'fixture.json').write_text(json.dumps(fixture),encoding='utf-8')

if fault=='crlf':(root/'control-crlf.html').write_bytes(control.replace(b'\n',b'\r\n'))
