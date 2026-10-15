import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const APP_SOURCE='c14a7665e8de361d8d33be183e7a88adec3ff7cb';
export const APP_TREE='9bcf8cf40144d12507faa2cfea9ddadee42d819f';
export const CONTROL_INDEX_SHA256='f7aadce54f96e89e63a7b6ae0ff1168e706aaa17b4f1baf80d4d847b00177552';
export const SIGNATURE_MEMBER_ALLOWLIST=Object.freeze(['META-INF/MANIFEST.MF','META-INF/CERT.SF','META-INF/CERT.RSA']);

// Reuse the repository's Python zipfile APK-audit approach. The exact delta
// check is separate from the ordinary acceptance audit and never accepts QA.
export function auditDiagnosticApks({productApk,controlApk,controlIndex,productAudit,fixtureReceipt,python='python3'}){
  if(!productAudit||!fixtureReceipt)throw new Error('Require original c14 product audit and fixture lineage');
  const script=fileURLToPath(new URL('./compare-apks.py',import.meta.url));
  const result=spawnSync(python,[script,productApk,controlApk,controlIndex,productAudit,fixtureReceipt],{encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:10*1024*1024});
  if(result.error||result.status!==0)throw new Error('Diagnostic APK member audit failed: '+(result.error?.message||result.stderr||result.stdout));
  const report=JSON.parse(result.stdout);
  if(report.appSource!==APP_SOURCE||report.appTree!==APP_TREE||report.reviewedControlIndexSha256!==CONTROL_INDEX_SHA256||report.nativeAcceptance!==false||report.fixtureOnly!==true||report.requiredSignerVerification!==true||report.productLineageVerified!==true)throw new Error('Diagnostic APK audit contract mismatch');
  return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [productApk,controlApk,controlIndex,productAudit,fixtureReceipt,output]=process.argv.slice(2);
  if(!productApk||!controlApk||!controlIndex||!output)throw new Error('Usage: node apk-members.mjs PRODUCT.apk CONTROL.apk control-index.html apk-assets.json fixture-provenance.json manifest.json');
  const report=auditDiagnosticApks({productApk,controlApk,controlIndex,productAudit,fixtureReceipt});writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({appSource:report.appSource,nativeAcceptance:false,changedMembers:report.changedMembers,memberCount:report.memberCount}));
}
