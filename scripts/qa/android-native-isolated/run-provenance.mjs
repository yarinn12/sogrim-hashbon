import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {cleanSourceProvenance} from './provenance.mjs';

export function acceptanceRunProvenance(){
  const root=process.cwd(),source=cleanSourceProvenance(root,process.env.ANDROID_QA_SOURCE);
  const fixture=JSON.parse(readFileSync(join(root,'artifacts/android-native-isolated/fixture-provenance.json'),'utf8'));
  const audit=JSON.parse(readFileSync(join(root,'artifacts/android-native-isolated/apk-assets.json'),'utf8'));
  const apkSha256=createHash('sha256').update(readFileSync(join(root,'android/app/build/outputs/apk/debug/app-debug.apk'))).digest('hex');
  if(fixture.sourceCommit!==source.sourceCommit||audit.sourceCommit!==source.sourceCommit||!audit.ready||!fixture.nativeDiagnosticAbsent||!audit.nativeDiagnosticAbsent||audit.apkSha256.toLowerCase()!==apkSha256)throw new Error('Prepared WWW/APK provenance is missing, stale, diagnostic or mismatched');
  return {...source,apkSha256,fixture,assetAudit:{ready:audit.ready,wwwManifestSha256:audit.wwwManifestSha256,assetCount:audit.assets.length,fontCount:audit.assets.filter(row=>row.font).length}};
}
