import test from 'node:test';
import assert from 'node:assert/strict';
import {join,resolve,dirname} from 'node:path';
import {childEnvironment,profilerEnvironment,requireCleanEnvironment,emulatorEnvironment} from '../scripts/qa/android-host-profile/profile-contract.mjs';

const options={sdk:resolve('/sdk'),home:resolve('/private/home'),avdHome:resolve('/private/avds'),temp:resolve('/private/temp')};
const base=childEnvironment(options),pid=4321;
const sdkEnvironment={...base,LC_ALL:'C',ANDROID_EMULATOR_WRAPPER_PID:String(pid),MESA_RGB_VISUAL:'TrueColor 24',ANDROID_EMULATOR_LAUNCHER_DIR:join(options.sdk,'emulator')};

test('SDK runtime directory is explicitly constructed inside the owned root before the launcher can default it',()=>{
  const runtime=join(dirname(options.home),'runtime');
  // The original run rejected this key before workload execution. Official
  // emu-main-dev launcher source only supplies /tmp when this key is absent;
  // retain a private fixed directory instead of accepting that global default.
  const actual={...sdkEnvironment,XDG_RUNTIME_DIR:runtime,ANDROID_EMULATOR_DISCOVERY_DIR:runtime};
  assert.deepEqual(emulatorEnvironment(actual,base,options.sdk,{pid,realpath:path=>path}),actual);
  assert.equal(base.XDG_RUNTIME_DIR,runtime);
  assert.equal(base.ANDROID_EMULATOR_DISCOVERY_DIR,runtime);
  assert.equal(profilerEnvironment({...options,XDG_RUNTIME_DIR:'/foreign'}).XDG_RUNTIME_DIR,runtime);
});

test('runtime directory cannot be redirected to global, foreign or secret-valued paths',()=>{
  const expected=profilerEnvironment(options);
  for(const key of ['XDG_RUNTIME_DIR','ANDROID_EMULATOR_DISCOVERY_DIR'])for(const value of ['/tmp','/run/user/1001','/foreign','SYNTHETIC_SECRET']){
    assert.throws(()=>emulatorEnvironment({...sdkEnvironment,[key]:value},base,options.sdk,{pid,realpath:path=>path}),error=>!error.message.includes('SYNTHETIC_SECRET'));
    assert.throws(()=>requireCleanEnvironment({...expected,[key]:value},expected),error=>!error.message.includes('SYNTHETIC_SECRET'));
  }
});

test('source-documented SDK launcher additions are accepted only for the owned PID and fixed operational values',()=>{
  const accepted=emulatorEnvironment(sdkEnvironment,base,options.sdk,{pid,realpath:path=>path});
  assert.deepEqual(accepted,sdkEnvironment);
  assert.equal(base.LC_ALL,'C.UTF-8','The fixture/profiler operational environment stays unchanged');
});

test('SDK additions cannot authorize credentials, a foreign PID or changed values',()=>{
  for(const patch of [{ANDROID_EMULATOR_WRAPPER_PID:'9999'},{MESA_RGB_VISUAL:'different'},{LC_ALL:'SYNTHETIC_SECRET'},{GITHUB_TOKEN:'SYNTHETIC_SECRET'},{LD_PRELOAD:'SYNTHETIC_SECRET'}]){
    assert.throws(()=>emulatorEnvironment({...sdkEnvironment,...patch},base,options.sdk,{pid,realpath:path=>path}),error=>!error.stack.includes('SYNTHETIC_SECRET'));
  }
  assert.throws(()=>emulatorEnvironment(sdkEnvironment,base,options.sdk,{realpath:path=>path}),/owned|PID/);
});
