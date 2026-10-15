import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const APP_SOURCE='59b599c24341e4659bce62b02c9d78fce3dd050d';
export const SIGNATURE_MEMBER_ALLOWLIST=Object.freeze(['META-INF/MANIFEST.MF','META-INF/CERT.SF','META-INF/CERT.RSA']);

// Reuse the repository's Python zipfile APK-audit approach. The exact delta
// check is separate from the ordinary acceptance audit and never accepts QA.
export function auditDiagnosticApks({productApk,controlApk,controlIndex,python='python3'}){
  const script=fileURLToPath(new URL('./compare-apks.py',import.meta.url));
  const result=spawnSync(python,[script,productApk,controlApk,controlIndex],{encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:10*1024*1024});
  if(result.error||result.status!==0)throw new Error('Diagnostic APK member audit failed: '+(result.error?.message||result.stderr||result.stdout));
  const report=JSON.parse(result.stdout);
  if(report.appSource!==APP_SOURCE||report.nativeAcceptance!==false||report.fixtureOnly!==true||report.requiredSignerVerification!==true)throw new Error('Diagnostic APK audit contract mismatch');
  return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [productApk,controlApk,controlIndex,output]=process.argv.slice(2);
  if(!productApk||!controlApk||!controlIndex||!output)throw new Error('Usage: node apk-members.mjs PRODUCT.apk CONTROL.apk control-index.html manifest.json');
  const report=auditDiagnosticApks({productApk,controlApk,controlIndex});writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({appSource:report.appSource,nativeAcceptance:false,changedMembers:report.changedMembers,memberCount:report.memberCount}));
}
