import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,lstatSync,realpathSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {APP_SOURCE} from './apk-members.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function prepareControl({root=process.cwd(),receiptPath=join(root,'artifacts/android-native-isolated/fixture-provenance.json'),
  target=join(root,'android/app/src/main/assets/public/index.html'),fixture=fileURLToPath(new URL('./control-index.html',import.meta.url)),output=join(root,'artifacts/android-native-isolated/control-index-receipt.json')}={}){
  const receipt=JSON.parse(readFileSync(receiptPath,'utf8'));
  if(receipt.sourceCommit!==APP_SOURCE&&receipt.source!==APP_SOURCE)throw new Error('Require exact 59b product fixture provenance');
  const generated=realpathSync(join(root,'android/app/src/main/assets/public'));
  if(resolve(dirname(target))!==generated||lstatSync(target).isSymbolicLink()||!lstatSync(target).isFile())throw new Error('Refuse non-generated or symlinked Android index');
  const before=readFileSync(target),control=readFileSync(fixture);
  if(hash(before)!==receipt.fixtureIndexSha256||!before.toString('utf8').includes('android-native-qa-fixture.js'))throw new Error('Generated product index differs from audited synthetic fixture');
  if(!control.toString('utf8').includes('data-diagnostic-control="minimal-webview"')||/<script\b|<link\b/i.test(control.toString('utf8')))throw new Error('Minimal control must have no product scripts or CSS links');
  writeFileSync(target,control);
  const report={schemaVersion:1,appSource:APP_SOURCE,fixtureOnly:true,nativeAcceptance:false,generatedIndex:resolve(target),productIndexSha256:hash(before),controlIndexSha256:hash(control),changedGeneratedPath:'android/app/src/main/assets/public/index.html',reviewedFixture:resolve(fixture)};
  writeFileSync(output,JSON.stringify(report,null,2)+'\n');return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const report=prepareControl();console.log(JSON.stringify({appSource:report.appSource,fixtureOnly:true,nativeAcceptance:false,productIndexSha256:report.productIndexSha256,controlIndexSha256:report.controlIndexSha256}));
}
