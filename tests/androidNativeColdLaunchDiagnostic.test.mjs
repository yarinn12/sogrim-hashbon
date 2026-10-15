import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {APP_SOURCE} from '../scripts/qa/android-native-isolated/diagnostic/apk-members.mjs';
import {foreground15sVerdict,hostCapacitySnapshot,requireDiagnosticManifest,requireFrozenEmulatorControls,runFixedTrials,TRIAL_ORDER,webviewProviderIdentity} from '../scripts/qa/android-native-isolated/diagnostic/abba-contract.mjs';
import {requireDiagnosticReceipts} from '../scripts/qa/android-native-isolated/diagnostic/one-shot.mjs';

const sha='a'.repeat(64),toolsSource='b'.repeat(40);
const manifest={schemaVersion:1,appSource:APP_SOURCE,fixtureOnly:true,nativeAcceptance:false,requiredSignerVerification:true,changedMembers:['assets/public/index.html'],variants:{A:{path:'/synthetic/product.apk',apkSha256:sha},B:{path:'/synthetic/control.apk',apkSha256:sha}}};
const receipts={manifest,source:APP_SOURCE,toolsSource,device:'emulator-5582',avd:'sogrim_ci_diagnostic_1',emulatorPid:3499,
  network:{isolated:true,source:APP_SOURCE,device:'emulator-5582',avd:'sogrim_ci_diagnostic_1',pid:3499},
  collector:{captureStarted:true,coverageVersion:5,appSource:APP_SOURCE,toolsSource,owner:{pid:3499,startTicks:'12345'}}};

test('fixed ABBA records every trial even when a product trial fails; no retry or selected winner',async()=>{
  let time=Date.now();const attempted=[],durable=[];
  const result=await runFixedTrials({now:()=>time,append:row=>durable.push(row),runTrial:async({trial,variant,budgetMs})=>{
    attempted.push([trial,variant,budgetMs]);time+=1000;
    if(trial===1){const error=new Error('Synthetic ANR');error.evidence={anr:true};throw error;}
    return{observed:true};
  }});
  assert.deepEqual(TRIAL_ORDER,['A','B','B','A']);assert.deepEqual(attempted.map(row=>row.slice(0,2)),[[1,'A'],[2,'B'],[3,'B'],[4,'A']]);
  assert.equal(durable.length,4);assert.deepEqual(result.rows,durable);assert.equal(result.rows[0].status,'error');assert.deepEqual(result.rows[0].evidence,{anr:true});
  assert.deepEqual(result.rows.slice(1).map(row=>row.status),['recorded','recorded','recorded']);assert.equal(result.nativeAcceptance,false);
});

test('ownership stop keeps explicit unattempted rows and never resumes unsafe work',async()=>{
  const called=[],rows=[];const result=await runFixedTrials({append:row=>rows.push(row),runTrial:async({trial})=>{
    called.push(trial);const error=new Error('Owned emulator changed');error.safetyStop=true;throw error;
  }});
  assert.deepEqual(called,[1]);assert.equal(rows.length,4);assert.deepEqual(result.rows.slice(1).map(row=>[row.attempted,row.status]),[[false,'not-attempted'],[false,'not-attempted'],[false,'not-attempted']]);
});

test('the original foreground 15-second result is never fabricated from an unstarted or short observation',()=>{
  assert.equal(foreground15sVerdict([],null),null);
  assert.equal(foreground15sVerdict([{elapsedSinceForegroundWaitMs:5000,ownedActivityFocus:false}],1),null);
  assert.equal(foreground15sVerdict([{elapsedSinceForegroundWaitMs:100,ownedActivityFocus:true,nativeAndroid:true}],1),true);
  assert.equal(foreground15sVerdict([{elapsedSinceForegroundWaitMs:100,ownedActivityFocus:true,nativeAndroid:false}],1),null);
  assert.equal(foreground15sVerdict([{elapsedSinceForegroundWaitMs:100,ownedActivityFocus:true,nativeAndroid:null}],1,{requireNativeAndroid:false}),true);
  assert.equal(foreground15sVerdict([{elapsedSinceForegroundWaitMs:15001,ownedActivityFocus:false}],1),false);
});

test('one-shot preflight requires the exact app source, isolated AVD and an approved v5 collector',()=>{
  assert.deepEqual(requireDiagnosticReceipts(receipts),receipts.collector.owner);
  for(const invalid of [
    {...receipts,source:'c'.repeat(40)},
    {...receipts,network:{...receipts.network,isolated:false}},
    {...receipts,collector:{...receipts.collector,coverageVersion:4}},
    {...receipts,collector:{...receipts.collector,toolsSource:'c'.repeat(40)}},
    {...receipts,manifest:{...manifest,nativeAcceptance:true}},
    {...receipts,manifest:{...manifest,changedMembers:['assets/public/index.html','classes.dex']}},
    {...receipts,manifest:{...manifest,changedMembers:['assets/public/index.html','META-INF/OTHER.SF']}}
  ])assert.throws(()=>requireDiagnosticReceipts(invalid));
  assert.equal(requireDiagnosticManifest(manifest),manifest);
});

test('capacity report preserves unavailable kernel fields instead of inventing CPU measurements',()=>{
  const sample=hostCapacitySnapshot({reader:path=>{if(path==='/proc/loadavg')return '1.0 2.0 3.0 1/2 3';throw Object.assign(new Error('missing'),{code:'ENOENT'});},parallelism:()=>4,hostCpus:()=>Array(8).fill({})});
  assert.equal(sample.allowedCpus,4);assert.equal(sample.logicalHostCpus,8);assert.equal(sample.procLoadavg.value,'1.0 2.0 3.0 1/2 3');assert.equal(sample.cgroupCpuMax.unavailable,'ENOENT');
});

test('WebView identity compares observed package and version rather than a variable dumpsys body',()=>{
  assert.deepEqual(webviewProviderIdentity('Current WebView package (name, version): (com.google.android.webview, 141.0.1)'),{name:'com.google.android.webview',version:'141.0.1'});
  assert.deepEqual(webviewProviderIdentity('Current WebView package is com.google.android.webview (version 141.0.1)'),{name:'com.google.android.webview',version:'141.0.1'});
  assert.throws(()=>webviewProviderIdentity('Current WebView package unavailable'));
});

test('one-shot rejects a changed emulator renderer or resource recipe before the first trial',()=>{
  const command=['emulator','-avd','sogrim_ci_diagnostic_1','-no-window','-no-snapshot','-gpu','swiftshader','-feature','GLDirectMem,HasSharedSlotsHostMemoryAllocator','-memory','4096','-cores','2'];
  assert.equal(requireFrozenEmulatorControls(command),command);
  for(const [flag,replacement] of [['-gpu','host'],['-feature','GLDirectMem'],['-memory','2048'],['-cores','4']]){
    const changed=[...command];changed[changed.indexOf(flag)+1]=replacement;assert.throws(()=>requireFrozenEmulatorControls(changed));
  }
});

test('control is static fixture-only HTML and the exact diagnostic branch disables Vercel deployment',()=>{
  const control=readFileSync(new URL('../scripts/qa/android-native-isolated/diagnostic/control-index.html',import.meta.url),'utf8');
  assert.match(control,/data-diagnostic-control="minimal-webview"/);assert.doesNotMatch(control,/<script\b|<link\b/i);
  const vercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.equal(vercel.git.deploymentEnabled['codex/android-cold-launch-abba-20261015'],false);
});
