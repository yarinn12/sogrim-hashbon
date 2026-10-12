import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const {assertEmulatorHealthy,readOwnedEmulatorLog,healthAdbObservation}=await import(process.env.ANDROID_QA_HEALTH_TEST_MODULE||'../scripts/qa/android-native-isolated/emulator-health.mjs');
// Actual bcf CI logcat: mapper abort preceded font_scale Broken pipe32.
const crash='10-10 19:44:45.021  1610  1661 F mapper.ranchu: Assertion failed: !rcEnc->featureInfo()->hasReadColorBufferDma\n10-10 19:44:45.023  1610  1661 F libc    : Fatal signal 6 (SIGABRT), code -1 (SI_QUEUE) in tid 1661 (RegionSampling), pid 1610 (surfaceflinger)';
const healthy='10-10 19:44:44.759  1689  1831 D ConnectivityService: NetReassign [no changes] [c 0] [a 0] [i 0]';
const successful=stdout=>({status:0,stdout,stderr:''});

test('actual CI mapper abort and surfaceflinger fatal signal make emulator health red before font measurement',()=>{
  assert.throws(()=>assertEmulatorHealthy(crash),error=>{
    assert.equal(error.health.healthy,false);assert.equal(error.health.coreCrashLines.length,2);return /core graphics\/system crash/.test(error.message);
  });
});

test('recovered boot or settings responses never erase an earlier core OS crash',()=>{
  assert.throws(()=>assertEmulatorHealthy(crash+'\n'+healthy+'\n10-10 19:44:49.000  3130  3130 I SettingsProvider: ready'),/core graphics\/system crash/);
  for(const process of ['surfaceflinger','system_server','zygote64'])assert.throws(()=>assertEmulatorHealthy(`10-10 19:44:46.092  3049  3049 F DEBUG   : Cmdline: /system/bin/${process}`),/core graphics\/system crash/);
});

test('both 32-bit and 64-bit zygote crashes fail, with or without the crash dump path prefix',()=>{
  for(const process of ['zygote','zygote64']){
    for(const prefix of ['','/system/bin/'])assert.throws(()=>assertEmulatorHealthy(`10-10 19:44:46.092  3049  3049 F DEBUG   : Cmdline: ${prefix}${process}`),/core graphics\/system crash/);
    assert.throws(()=>assertEmulatorHealthy(`10-10 19:44:45.023  1610  1661 F libc    : Fatal signal 6 (SIGABRT), code -1 (SI_QUEUE) in tid 1661 (main), pid 1610 (${process})`),/core graphics\/system crash/);
  }
  for(const process of ['zygote6','zygote640','zygote-helper'])assert.deepEqual(assertEmulatorHealthy(`10-10 19:44:46.092  3049  3049 F DEBUG   : Cmdline: ${process}`),{healthy:true,coreCrashLines:[]});
});

test('AndroidRuntime Java core crash is rejected without any libc signal and remains red after recovery',()=>{
  for(const severity of ['E','F']){
    const javaCrash=`10-10 19:44:45.023  1689  1689 ${severity} AndroidRuntime: *** FATAL EXCEPTION IN SYSTEM PROCESS: main\n10-10 19:44:45.024  1689  1689 ${severity} AndroidRuntime: java.lang.IllegalStateException: fixture core failure`;
    assert.throws(()=>assertEmulatorHealthy(javaCrash),/core graphics\/system crash/);
    assert.throws(()=>assertEmulatorHealthy(javaCrash+'\n'+healthy),/core graphics\/system crash/);
  }
  const appCrash='10-10 19:44:45.023  2100  2100 E AndroidRuntime: FATAL EXCEPTION: main\n10-10 19:44:45.024  2100  2100 E AndroidRuntime: Process: synthetic.app, PID: 2100';
  const warning='10-10 19:44:45.023  2100  2100 W AndroidRuntime: FATAL EXCEPTION IN SYSTEM PROCESS: mentioned by a warning';
  const appMessage='10-10 19:44:45.023  2100  2100 E App: FATAL EXCEPTION IN SYSTEM PROCESS: copied app diagnostic';
  assert.deepEqual(assertEmulatorHealthy(appCrash+'\n'+warning+'\n'+appMessage),{healthy:true,coreCrashLines:[]});
});

test('ordinary emulator warnings and app-specific fatal text cannot masquerade as a core crash',()=>{
  const warnings=healthy+'\n10-10 19:44:39.687  1689  1689 E SystemServiceRegistry: No service published for: face\n10-10 19:44:44.000  2100  2100 W App: Fatal signal mentioned in a diagnostic\n10-10 19:44:44.000  2100  2100 F DEBUG   : Cmdline: /system/bin/unrelated';
  assert.deepEqual(assertEmulatorHealthy(warnings),{healthy:true,coreCrashLines:[]});
});

test('empty, fabricated or non-logcat observations do not provide a green receipt',()=>{
  for(const log of ['',null,'OS is ready','--------- beginning of main'])assert.throws(()=>assertEmulatorHealthy(log),/actual nonempty Android logcat/);
});

test('SDK observations use the explicit owned serial, reject a foreign AVD and never repeat input',()=>{
  const calls=[];const base={device:'emulator-5582',avd:'sogrim_ci_1_1',adbPath:'actual-sdk',run:(path,args,options)=>{calls.push({path,args,options});return successful(args.includes('name')?'sogrim_ci_1_1\nOK':healthy);}};
  assert.equal(readOwnedEmulatorLog(base),healthy);assert.deepEqual(calls.map(call=>call.args),[['-s','emulator-5582','emu','avd','name'],['-s','emulator-5582','logcat','-d']]);
  assert.ok(calls.every(call=>call.options.timeout>0&&call.options.killSignal==='SIGKILL'));
  let foreignCalls=0;assert.throws(()=>readOwnedEmulatorLog({...base,run:()=>{foreignCalls++;return successful('foreign\nOK');}}),/foreign/);assert.equal(foreignCalls,1);
});

test('broken SDK pipes and a hung process fail instead of being ignored or retried',()=>{
  let calls=0;assert.throws(()=>healthAdbObservation('unused','emulator-5582',['logcat','-d'],()=>{calls++;return {status:1,stdout:healthy,stderr:'Broken pipe (32)'};}),/without retry.*Broken pipe/);assert.equal(calls,1);
  const child=(_path,_args,options)=>spawnSync(process.execPath,['-e','setTimeout(()=>{},10000)'],options);
  assert.throws(()=>healthAdbObservation('unused','emulator-5582',['logcat','-d'],child,50),/SDK command failed/);
});
