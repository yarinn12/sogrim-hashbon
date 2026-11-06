import test from 'node:test';
import assert from 'node:assert/strict';
import {join,resolve} from 'node:path';
import {childEnvironment,emulatorEnvironment} from '../scripts/qa/android-host-profile/profile-contract.mjs';

const options={sdk:resolve('/sdk'),home:resolve('/private/home'),avdHome:resolve('/private/avds'),temp:resolve('/private/temp')};
const base=childEnvironment(options),pid=4321;
const sdkEnvironment={...base,LC_ALL:'C',ANDROID_EMULATOR_WRAPPER_PID:String(pid),MESA_RGB_VISUAL:'TrueColor 24',ANDROID_EMULATOR_LAUNCHER_DIR:join(options.sdk,'emulator')};

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
