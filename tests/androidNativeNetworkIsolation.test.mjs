import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const {hasNoDefaultNetwork,waitForNetworkIsolation,isolateOwnedEmulator,networkObservation}=await import(process.env.ANDROID_QA_NETWORK_TEST_MODULE||'../scripts/qa/android-native-isolated/network-isolation.mjs');
const ok=stdout=>({ok:true,stdout,stderr:'',exitCode:0});
const active='Active default network: 100\nmDefaultNetwork=100';
const none='Active default network: none\nmDefaultNetwork=null';

test('actual CI teardown timing waits for OS readback after three single disable commands',async()=>{
  let clock=0,reads=0;const commands=[];
  const result=await isolateOwnedEmulator({expectedName:'sogrim_ci_1_1',observe:args=>{
    commands.push(args.join(' '));
    if(args[0]==='emu')return ok('sogrim_ci_1_1\nOK');
    if(args.includes('dumpsys')){reads++;return ok(clock<900?active:none);}
    if(args.includes('get'))return ok('1');
    return ok('');
  },isLauncherAlive:()=>true,now:()=>clock,delay:async ms=>{clock+=ms;},timeoutMs:3000});
  assert.equal(result.isolated,true);assert.equal(result.connectivity,none);assert.equal(clock,1000);assert.equal(reads,3);
  for(const command of ['shell cmd connectivity airplane-mode enable','shell svc wifi disable','shell svc data disable'])assert.equal(commands.filter(value=>value===command).length,1);
});

test('a persistent or unknown default network fails at the bounded deadline',async()=>{
  for(const dump of [active,'missing connectivity header']){
    let clock=0;
    await assert.rejects(waitForNetworkIsolation({readConnectivity:()=>ok(dump),readAirplaneMode:()=>ok('1'),isLauncherAlive:()=>true,now:()=>clock,delay:async ms=>{clock+=ms;},timeoutMs:1000}),/within 1000ms/);
    assert.equal(clock,1000);
  }
});

test('only the current exact no-network state passes, never historical or contradictory text',()=>{
  assert.equal(hasNoDefaultNetwork(none),true);
  assert.equal(hasNoDefaultNetwork('Active default network: none'),true);
  for(const dump of [active,'history: Active default network: none\n'+active,'mDefaultNetwork=null',none+'\nActive default network: 100','Active default network: none\nmDefaultNetwork=100','Active default network: none-extra'])assert.equal(hasNoDefaultNetwork(dump),false);
});

test('foreign AVD and failed disable command stop before further network actions or polling',async()=>{
  const foreign=[];
  await assert.rejects(isolateOwnedEmulator({expectedName:'sogrim_ci_1_1',observe:args=>{foreign.push(args);return ok('another_avd\nOK');},isLauncherAlive:()=>true}),/foreign/);assert.equal(foreign.length,1);
  const failed=[];
  await assert.rejects(isolateOwnedEmulator({expectedName:'sogrim_ci_1_1',observe:args=>{failed.push(args);return args[0]==='emu'?ok('sogrim_ci_1_1\nOK'):{ok:false,stdout:'',stderr:'device offline',exitCode:1};},isLauncherAlive:()=>true}),/without retry/);assert.equal(failed.length,2);
});

test('offline readback may recover, but airplane disabled and exited launcher fail closed',async()=>{
  let clock=0,reads=0;
  const base={readConnectivity:()=>++reads===1?{ok:false,stdout:'',stderr:'device offline',exitCode:1}:ok(none),readAirplaneMode:()=>ok('1'),isLauncherAlive:()=>true,now:()=>clock,delay:async ms=>{clock+=ms;},timeoutMs:1000};
  assert.equal((await waitForNetworkIsolation(base)).isolated,true);assert.equal(clock,500);
  clock=0;await assert.rejects(waitForNetworkIsolation({...base,readConnectivity:()=>ok(none),readAirplaneMode:()=>ok('0')}),/within 1000ms/);
  await assert.rejects(waitForNetworkIsolation({...base,readConnectivity:()=>ok(active),isLauncherAlive:()=>false}),/launcher exited/);
});

test('a hung SDK read is killed at its own process boundary and workflow uses the actual readback gate',()=>{
  const child=(_path,_args,options)=>spawnSync(process.execPath,['-e','setTimeout(()=>{},10000)'],options);
  assert.throws(()=>networkObservation('unused','emulator-5582',['shell','dumpsys','connectivity'],child,50),/Bounded network ADB observation failed/);
  const workflow=readFileSync(new URL('../.github/workflows/android-native-parity-qa.yml',import.meta.url),'utf8');
  assert.match(workflow,/ANDROID_QA_EMULATOR_PID=.*node scripts\/qa\/android-native-isolated\/network-isolation\.mjs/);
  assert.doesNotMatch(workflow,/grep -Eq 'Active default network: none\|mDefaultNetwork=null'/);
});
