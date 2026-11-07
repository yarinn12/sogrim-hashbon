"""Verify real built APK/WWW bytes. Standard library; no release credentials."""
import hashlib, json, pathlib, subprocess, sys, zipfile

root=pathlib.Path(sys.argv[1]).resolve()
expected=sys.argv[2]
output=root/'artifacts/android-native-isolated/apk-assets.json'
report={'sourceCommit':expected,'ready':False,'assets':[],'errors':[]}
def sha(data): return hashlib.sha256(data).hexdigest()
try:
    head=subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()
    if head!=expected: raise ValueError('APK audit requires exact application HEAD')
    plugin=(root/'android/app/src/main/java/com/sogrimhashbon/app/SogrimCapabilitiesPlugin.java').read_text()
    if 'getQaWebViewTypography' in plugin: raise ValueError('Diagnostic Native probe is forbidden for acceptance')
    provenance=json.loads((root/'artifacts/android-native-isolated/fixture-provenance.json').read_text())
    if provenance['sourceCommit']!=head or not provenance.get('nativeDiagnosticAbsent'): raise ValueError('Fixture source mismatch or diagnostic build')
    apk=root/'android/app/build/outputs/apk/debug/app-debug.apk'
    report.update(sourceTree=provenance['sourceTree'],fixtureProvenance=provenance,nativeDiagnosticAbsent=True,apkSha256=sha(apk.read_bytes()),signing='Debug local test certificate only')
    www=root/'www'
    www_files={file.relative_to(www).as_posix():file for file in www.rglob('*') if file.is_file()}
    seen=set()
    with zipfile.ZipFile(apk) as archive:
        for entry in archive.infolist():
            if not entry.filename.startswith('assets/public/') or entry.is_dir(): continue
            name=entry.filename[len('assets/public/'):]
            if name in seen: raise ValueError('Duplicate APK asset '+name)
            seen.add(name)
            data=archive.read(entry)
            stub=name in ('cordova.js','cordova_plugins.js') and not data and name not in www_files
            matches=name in www_files and data==www_files[name].read_bytes()
            font=pathlib.PurePosixPath(name).suffix.lower() in ('.woff','.woff2','.ttf','.otf')
            source=root/name
            font_matches=not font or (source.is_file() and data==source.read_bytes())
            report['assets'].append({'path':name,'sha256':sha(data),'length':len(data),'matchesWww':matches,'emptyGeneratedStub':stub,'font':font,'fontMatchesSource':font_matches})
            if not (matches or stub) or not font_matches: report['errors'].append('Asset mismatch '+name)
    for name in www_files.keys()-seen: report['errors'].append('WWW asset missing from APK '+name)
    if not any(row['font'] for row in report['assets']): report['errors'].append('APK has no bundled fonts')
    manifest='\n'.join(f"{row['path']}:{row['sha256']}:{row['length']}" for row in sorted(report['assets'],key=lambda row:row['path']))
    report['wwwManifestSha256']=sha(manifest.encode())
    report['ready']=not report['errors']
except Exception as error:
    report['errors'].append(str(error))
finally:
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({key:report.get(key) for key in ('ready','sourceCommit','apkSha256','wwwManifestSha256','errors')}))
    sys.exit(0 if report['ready'] else 1)
