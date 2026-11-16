import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,existsSync,unlinkSync,rmdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';

const workflow=readFileSync(new URL('../.github/workflows/ios-auth-return-qa.yml',import.meta.url),'utf8').replaceAll('\r\n','\n');
function step(name){
 const lines=workflow.split('\n'),start=lines.indexOf('      - name: '+name);
 assert.ok(start>=0,'missing workflow step');
 let end=lines.findIndex((line,i)=>i>start&&/^      - /.test(line));if(end<0)end=lines.length;
 const run=lines.indexOf('        run: |',start);assert.ok(run>start&&run<end);
 return {header:lines.slice(start,run).join('\n'),script:lines.slice(run+1,end).map(line=>line.slice(10)).join('\n')};
}
const measured=step('Build and run the real system-session redirect with synthetic account data');
const failure=step('Keep simulator launch diagnostics on failure');
const words=line=>(line.match(/"[^"]*"|'[^']*'|[^\s]+/g)||[]).map(x=>/^['"]/.test(x)?x.slice(1,-1):x);
function option(args,key){const at=args.flatMap((x,i)=>x===key?[i]:[]);assert.equal(at.length,1,'exactly one '+key);return args[at[0]+1];}
function requireSameSimulatorSdk(script){
 const commands=script.split('\n').filter(line=>line.startsWith('xcodebuild '));assert.equal(commands.length,2);
 const build=words(commands[0].split(' | tee ')[0]),run=words(commands[1].split(' | tee ')[0]);
 assert.ok(build.includes('build-for-testing'));assert.ok(run.includes('test-without-building'));
 for(const args of [build,run]){
  assert.equal(option(args,'-sdk'),'iphonesimulator');
  for(const [key,value]of Object.entries({'-project':'ios/App/App.xcodeproj','-scheme':'App','-configuration':'Debug','-destination':'platform=iOS Simulator,id=$PROBE_UDID','-derivedDataPath':'build/probe/derived'}))assert.equal(option(args,key),value,key);
  assert.equal(args.filter(x=>x==='CODE_SIGNING_ALLOWED=NO').length,1);
 }
 assert.equal(option(run,'-resultBundlePath'),'build/probe/result.xcresult');
}
const mutateRun=fn=>measured.script.split('\n').map(line=>line.startsWith('xcodebuild ')&&line.includes('test-without-building')?fn(line):line).join('\n');

test('AuthReturn build and test select one explicit simulator SDK and the same original destination',()=>requireSameSimulatorSdk(measured.script));
// These controls detect a configuration difference only. They do not reproduce
// Auth116's historical destination failure or establish its cause.
for(const [label,change]of [
 ['omitted test SDK',line=>line.replace(' -sdk iphonesimulator','')],
 ['device SDK',line=>line.replace('-sdk iphonesimulator','-sdk iphoneos')],
 ['duplicate SDK',line=>line.replace('-sdk iphonesimulator','-sdk iphonesimulator -sdk iphonesimulator')],
 ['another UDID',line=>line.replace('$PROBE_UDID','$OTHER_UDID')],
 ['another scheme',line=>line.replace('-scheme App','-scheme Other')],
 ['another configuration',line=>line.replace('-configuration Debug','-configuration Release')],
 ['another product directory',line=>line.replace('-derivedDataPath build/probe/derived','-derivedDataPath other')]
])test('simulator configuration contract rejects '+label,()=>assert.throws(()=>requireSameSimulatorSdk(mutateRun(change))));

test('destination queries remain failure-only and cannot warm up or retry the measured journey',()=>{
 assert.match(failure.header,/^        if: failure\(\)$/m);
 assert.match(failure.header,/^        timeout-minutes: 5$/m);
 assert.doesNotMatch(measured.script,/showdestinations|capture_auth_destination_diagnostic|device-inventory\.log|runtime-inventory\.log/);
 assert.doesNotMatch(failure.script,/test-without-building|build-for-testing|simctl (?:boot|erase|delete|create|install|launch)\b/);
 assert.match(workflow,/^    timeout-minutes: 35$/m);
 assert.match(measured.script,/^set -o pipefail$/m);
 assert.match(workflow,/app\/build\/probe\/\*\.log/);
 assert.doesNotMatch(workflow,/continue-on-error:/);
});
const diagnostics=failure.script.split('\n').filter(line=>line.startsWith('capture_auth_destination_diagnostic ')).map(words);
test('failure inventory and both SDK views use only the five explicit query commands',()=>{
 assert.deepEqual(diagnostics.map(x=>x[1]),['build/probe/device-inventory.log','build/probe/runtime-inventory.log','build/probe/device-type-inventory.log','build/probe/destinations-default.log','build/probe/destinations-simulator.log']);
 assert.deepEqual(diagnostics.slice(0,3).map(x=>x.slice(2)),[['xcrun','simctl','list','devices','-j'],['xcrun','simctl','list','runtimes','-j'],['xcrun','simctl','list','devicetypes','-j']]);
 const common=['xcodebuild','-project','ios/App/App.xcodeproj','-scheme','App','-configuration','Debug'];
 assert.deepEqual(diagnostics[3].slice(2),[...common,'-derivedDataPath','build/probe/derived','-showdestinations']);
 assert.deepEqual(diagnostics[4].slice(2),[...common,'-sdk','iphonesimulator','-derivedDataPath','build/probe/derived','-showdestinations']);
});
function captureFunction(){
 const start=failure.script.indexOf('capture_auth_destination_diagnostic() {'),end=failure.script.indexOf('\n}\n',start);
 assert.ok(start>=0&&end>start);return failure.script.slice(start,end+3);
}
function exerciseCapture(invocations){
 const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'/bin/bash';
 const env=Object.fromEntries(['PATH','SystemRoot','WINDIR','COMSPEC'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
 const script='export PATH="/usr/bin:/bin:$PATH"\nexport PROBE_UDID=00000000-0000-4000-8000-000000000001\n'+captureFunction()+'\nxcrun(){ printf "SYNTHETIC_QUERY:%s\\n" "$*"; return 0; }\nxcodebuild(){ printf "SYNTHETIC_QUERY:%s\\n" "$*"; return 7; }\n'+invocations+'\nprintf "CAPTURE_CONTINUED\\n"\n';
 // Git Bash does not expose /dev/stdout consistently under Windows pipes.
 // Exercise the real file-writing boundary in one isolated owned directory.
 const cwd=mkdtempSync(join(tmpdir(),'sogrim-auth-diagnostic-'));
 try {
  const result=spawnSync(bash,['--noprofile','--norc','-e','-o','pipefail','-c',script],{cwd,env,encoding:'utf8',windowsHide:true,timeout:30_000});
  assert.ifError(result.error);assert.equal(result.signal,null);assert.equal(result.status,0,result.stderr);return result.stdout;
 } finally {
  for(const name of ['query.log','failed-query.log','later-query.log']){
   const path=join(cwd,name);if(existsSync(path))unlinkSync(path);
  }
  rmdirSync(cwd);
 }
}
test('the actual capture function records owner, query, UTC times and success without an Apple process',()=>{
 const out=exerciseCapture('capture_auth_destination_diagnostic query.log xcrun simctl list devices -j\ncat query.log');
 assert.match(out,/OwnedSimulator=00000000-0000-4000-8000-000000000001/);
 assert.match(out,/Command: xcrun simctl list devices -j/);assert.match(out,/SYNTHETIC_QUERY:simctl list devices -j/);
 assert.match(out,/StartedUTC=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/);assert.match(out,/FinishedUTC=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/);
 assert.match(out,/ExitStatus=0/);assert.match(out,/CAPTURE_CONTINUED/);
});
test('a failed diagnostic is recorded and later inventory still runs without another test',()=>{
 const out=exerciseCapture('capture_auth_destination_diagnostic failed-query.log xcodebuild -showdestinations\ncat failed-query.log\ncapture_auth_destination_diagnostic later-query.log xcrun simctl list runtimes -j\ncat later-query.log');
 assert.match(out,/ExitStatus=7/);assert.match(out,/ExitStatus=0/);assert.match(out,/SYNTHETIC_QUERY:simctl list runtimes -j/);
 assert.equal((out.match(/SYNTHETIC_QUERY:/g)||[]).length,2);assert.match(out,/CAPTURE_CONTINUED/);
});
