import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {realpathSync,lstatSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {dirname,basename,join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';

// Controller C configuration: bind ONLY after toolkit T is final/read back.
// This file never contains its own C SHA, policy hash, private key or future audit run/job IDs.
export const CONTROLLER_PUBLIC_ANCHORS=Object.freeze({
  repository:'yarinn12/sogrim-hashbon',tag:'PENDING',publicSpkiBase64:'PENDING',
  controllerBranch:'PENDING',workflowPath:'PENDING',jobKey:'PENDING',jobName:'PENDING'
});
export const INITIAL_TOOLKIT=Object.freeze({sha:'PENDING',tree:'PENDING',fileSha256:Object.freeze({
  'scripts/qa/ios-signing/owner-audit-launcher.mjs':'PENDING',
  'scripts/qa/ios-signing/audit-prekey-bootstrap.mjs':'PENDING',
  'scripts/qa/ios-signing/signed-audit-policy.mjs':'PENDING',
  'scripts/qa/ios-signing/audit-execution-context.mjs':'PENDING'
})});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function requireControllerConfiguration() {
  const visit=x=>{if(x&&typeof x==='object')Object.values(x).forEach(visit);
    else assert.ok(typeof x==='string'&&x&&x!=='PENDING','Controller configuration remains PENDING');};
  visit(CONTROLLER_PUBLIC_ANCHORS);visit(INITIAL_TOOLKIT);
  assert.match(INITIAL_TOOLKIT.sha,/^[a-f0-9]{40}$/);assert.match(INITIAL_TOOLKIT.tree,/^[a-f0-9]{40}$/);
  Object.values(INITIAL_TOOLKIT.fileSha256).forEach(x=>assert.match(x,/^[a-f0-9]{64}$/));
}
export async function main() {
  requireControllerConfiguration(); // Before environment, credentials, filesystem or imports.
  const controllerRoot=realpathSync(fileURLToPath(new URL('../../../',import.meta.url)));
  assert.equal(basename(controllerRoot),'audit-controller');
  const workspace=realpathSync(dirname(controllerRoot));
  assert.equal(realpathSync(process.env.GITHUB_WORKSPACE),workspace);
  const toolkitRoot=join(workspace,'audit-tools');assert.equal(realpathSync(toolkitRoot),toolkitRoot);
  const git=args=>execFileSync('git',args,{cwd:toolkitRoot,encoding:'utf8',windowsHide:true}).trim();
  assert.equal(resolve(git(['rev-parse','--show-toplevel'])),resolve(toolkitRoot));
  assert.equal(git(['rev-parse','HEAD']),INITIAL_TOOLKIT.sha);
  assert.equal(git(['rev-parse','HEAD^{tree}']),INITIAL_TOOLKIT.tree);
  assert.equal(git(['status','--porcelain','--untracked-files=all']),'');
  for(const [path,digest] of Object.entries(INITIAL_TOOLKIT.fileSha256)) {
    const full=join(toolkitRoot,path),before=lstatSync(full);
    assert.ok(before.isFile()&&!before.isSymbolicLink());assert.equal(realpathSync(full),full);
    assert.equal(hash(readFileSync(full)),digest);
    const after=lstatSync(full);
    for(const k of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(before[k],after[k]);
  }
  const {runOwnerAuditLauncher}=await import(pathToFileURL(join(toolkitRoot,'scripts/qa/ios-signing/owner-audit-launcher.mjs')).href);
  const result=await runOwnerAuditLauncher(CONTROLLER_PUBLIC_ANCHORS,{githubToken:process.env.GH_TOKEN});
  const output=join(workspace,'audit-output');
  mkdirSync(output,{recursive:false,mode:0o700});assert.equal(realpathSync(output),output);
  for(const [name,bytes] of Object.entries(result.files)) {
    assert.match(name,/^[a-z0-9][a-z0-9.-]*\.json$/);
    assert.ok(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=16*1024*1024);
    writeFileSync(join(output,name),bytes,{flag:'wx',mode:0o600});
  }
  const p=JSON.parse(result.provenance);
  writeFileSync(join(output,'receipt.json'),Buffer.from(JSON.stringify({
    scope:p.scope,sourceSha:p.sourceSha,sourceTree:p.sourceTree,version:p.version,build:p.build,buildId:p.buildId,
    ipaSha256:p.ipaSha256,auditRun:p.runtime.auditRun,auditJob:p.runtime.auditJob,
    policySha256:p.signatureProof.policySha256,outputSha256:p.outputSha256,
    evidenceMemberSha256:Object.fromEntries(Object.entries(result.files).map(([name,bytes])=>[name,hash(bytes)])),
    provenanceSha256:hash(result.provenance),ownerAvailabilityAccepted:false,databaseAccepted:false,
    publicReleaseAccepted:false,distributionAllowed:false
  },null,2)+'\n'),{flag:'wx',mode:0o600});
  console.log('Independent owner audit evidence saved; no distribution performed.');
}
if(import.meta.url.startsWith('file:')&&process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
  try {await main();}
  catch {console.error('Independent owner audit failed; inspect the reviewed gate stage. No release action was performed.');process.exitCode=1;}
}
