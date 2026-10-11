import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

const cli=fileURLToPath(new URL('../scripts/qa/android-native-isolated/trace-diagnostics.mjs',import.meta.url));
const source='31b2a849d68a9a98f6aad4b70325f29bff81bc81';
function fixture(t){
  const cwd=mkdtempSync(join(tmpdir(),'native-trace-cli-'));t.after(()=>rmSync(cwd,{recursive:true,force:true}));
  const output=join(cwd,'artifacts/android-native-isolated/trace-diagnostics');mkdirSync(output,{recursive:true});
  const build=join(output,'../apk-build.log'),original='Could not find com.google.errorprone:error_prone_annotations:2.3.1.\nBUILD FAILED in 15s\n';writeFileSync(build,original);
  const calls=join(cwd,'unexpected-operation.log'),guard=join(cwd,'child-guard.mjs');
  writeFileSync(guard,`import cp from 'node:child_process';import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';const reject=name=>(...args)=>{fs.appendFileSync(${JSON.stringify(calls)},name+'\\n');throw new Error('Unexpected subprocess or wait: '+name);};cp.spawnSync=reject('spawnSync');cp.spawn=reject('spawn');syncBuiltinESMExports();globalThis.setTimeout=reject('setTimeout');`);
  // The actual child CLI imports spies before its static bindings, so both
  // subprocess calls and observer waits are detected independently of receipts.
  const env={...process.env,ADB_PATH:process.execPath,ANDROID_QA_DEVICE:'emulator-5582',ANDROID_QA_AVD:'sogrim_ci_38116589323_1',ANDROID_QA_SOURCE:source,ANDROID_QA_JOB_STATUS:'failure',SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD:'1'};
  return {cwd,output,build,original,env,run(mode='finish'){
    const result=spawnSync(process.execPath,['--import',pathToFileURL(guard).href,cli,mode],{cwd,env,encoding:'utf8',timeout:3000,windowsHide:true});
    assert.equal(result.error,undefined,'CLI must not wait for an absent emulator/observer');assert.equal(result.status,1,'Unavailable Native evidence must retain failure');
    assert.equal(readFileSync(build,'utf8'),original,'Original build failure must remain intact');assert.equal(existsSync(calls),false,'No subprocess, guest command or observer wait permitted');return result;
  }};
}
test('actual finish CLI before emulator launch records unavailable capture without guest calls or host wait',t=>{
  const f=fixture(t),result=f.run();const report=JSON.parse(readFileSync(join(f.output,'trace-diagnostics.json'),'utf8'));
  assert.equal(report.source,source);assert.equal(report.noCaptureStarted,true);assert.equal(report.emulatorPidUnavailable,true);
  assert.equal(report.captureComplete,false);assert.equal(report.nativeAcceptance,false);assert.deepEqual(report.commands,[]);
  assert.equal(report.jobStatus,'failure');assert.match(report.traceAnalysisStatus,/capture never started/);
  assert.doesNotMatch(result.stderr,/ENOENT/);assert.equal(existsSync(join(f.output,'host-stop')),false);
});
test('missing PID cannot reinterpret an attempted unacknowledged capture as never started',t=>{
  const f=fixture(t);writeFileSync(join(f.output,'trace-start.json'),JSON.stringify({source,device:f.env.ANDROID_QA_DEVICE,avd:f.env.ANDROID_QA_AVD,emulatorPid:55,captureStarted:false,guestLaunchAttempted:true,commands:[{name:'perfetto-start'}],errors:['Original startup failure: acknowledgement missing']}));
  f.run();const report=JSON.parse(readFileSync(join(f.output,'trace-diagnostics.json'),'utf8'));
  assert.equal(report.noCaptureStarted,false);assert.equal(report.captureComplete,false);assert.equal(report.nativeAcceptance,false);
  assert.deepEqual(report.commands,[]);assert.match(report.errors.join('\n'),/Original startup failure: acknowledgement missing/);
  assert.match(report.traceAnalysisStatus,/unconfirmed/);assert.equal(existsSync(join(f.output,'host-stop')),false);
});
test('missing PID with corrupt, foreign or residual capture evidence stays unconfirmed and does not adopt a receipt PID',t=>{
  for(const kind of ['corrupt','foreign','host','guest']){
    const f=fixture(t);
    if(kind==='corrupt')writeFileSync(join(f.output,'trace-start.json'),'{broken');
    if(kind==='foreign')writeFileSync(join(f.output,'trace-start.json'),JSON.stringify({source:'a'.repeat(40),emulatorPid:process.pid,guestPid:process.pid,captureStarted:true,hostObserver:{pid:process.pid},errors:[]}));
    if(kind==='host')writeFileSync(join(f.output,'host-observer.pid'),String(process.pid));
    if(kind==='guest')writeFileSync(join(f.output,'guest.pftrace'),'partial bytes');
    f.run();const report=JSON.parse(readFileSync(join(f.output,'trace-diagnostics.json'),'utf8'));
    assert.equal(report.noCaptureStarted,false,kind);assert.equal(report.captureComplete,false,kind);assert.equal(report.nativeAcceptance,false,kind);
    assert.deepEqual(report.commands,[],kind);assert.match(report.traceAnalysisStatus,/unconfirmed/,kind);assert.equal(existsSync(join(f.output,'host-stop')),false,kind);
  }
});
test('start CLI still requires an explicit owned emulator PID and fails without one',t=>{
  const f=fixture(t);f.run('start');const report=JSON.parse(readFileSync(join(f.output,'trace-unavailable-start.json'),'utf8'));
  assert.equal(report.captureStarted,false);assert.equal(report.captureComplete,false);assert.equal(report.nativeAcceptance,false);assert.match(report.error,/emulator.pid/);
});
test('invalid PID file is rejected rather than treated as a safe prelaunch absence',t=>{
  const f=fixture(t);writeFileSync(join(f.output,'../emulator.pid'),'0\n');f.run();
  const report=JSON.parse(readFileSync(join(f.output,'trace-unavailable-finish.json'),'utf8'));
  assert.equal(report.captureComplete,false);assert.equal(report.nativeAcceptance,false);assert.match(report.error,/explicit owned CI emulator\/PID/);
});
test('existing emulator PID without a valid trace receipt cannot accept Native or adopt foreign process state',t=>{
  const f=fixture(t);writeFileSync(join(f.output,'../emulator.pid'),String(process.pid));f.run();
  const report=JSON.parse(readFileSync(join(f.output,'trace-diagnostics.json'),'utf8'));
  assert.equal(report.noCaptureStarted,false);assert.equal(report.captureComplete,false);assert.equal(report.nativeAcceptance,false);assert.deepEqual(report.commands,[]);assert.match(report.traceAnalysisStatus,/no valid capture receipt/);
});
test('actual workflow cleanup before launch preserves build failure and never invokes the guest timeout path',t=>{
  const f=fixture(t),workflow=readFileSync(new URL('../.github/workflows/android-native-parity-qa.yml',import.meta.url),'utf8');
  const start=workflow.indexOf('          mkdir -p artifacts/android-native-isolated',workflow.indexOf('- name: Preserve diagnostics and stop only the owned AVD'));
  const end=workflow.indexOf('      - uses:',start);assert.ok(start>0&&end>start);
  const guard=join(f.cwd,'child-guard.mjs'),calls=join(f.cwd,'unexpected-workflow-operation.log');
  let script=workflow.slice(start,end).split(/\r?\n/).map(line=>line.replace(/^          /,'')).join('\n');
  script=script.replaceAll('${{ job.status }}','failure').replaceAll('node scripts/qa/android-native-isolated/trace-diagnostics.mjs',`"${process.execPath.replaceAll('\\','/')}" "${cli.replaceAll('\\','/')}"`);
  script='timeout(){ echo guest-call >> "'+calls.replaceAll('\\','/')+'"; return 1; }\n'+script;
  const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'/bin/bash';
  const result=spawnSync(bash,['-c',script],{cwd:f.cwd,env:{...f.env,NODE_OPTIONS:'--import='+pathToFileURL(guard).href},encoding:'utf8',timeout:3000,windowsHide:true});
  assert.equal(result.error,undefined);assert.equal(result.status,1,'Original build failure remains failed');assert.equal(existsSync(calls),false,'No guest identity lookup, wait, diagnostic or kill before launch');
  assert.equal(readFileSync(f.build,'utf8'),f.original);assert.equal(existsSync(join(f.cwd,'unexpected-operation.log')),false);
  const report=JSON.parse(readFileSync(join(f.output,'trace-diagnostics.json'),'utf8'));assert.equal(report.noCaptureStarted,true);assert.equal(report.jobStatus,'failure');assert.equal(report.captureComplete,false);assert.equal(report.nativeAcceptance,false);
});
