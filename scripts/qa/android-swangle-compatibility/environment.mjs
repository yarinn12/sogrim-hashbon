import assert from 'node:assert/strict';
import {mkdirSync,readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {join,resolve} from 'node:path';
import {childEnvironment,parseEnviron,emulatorEnvironment,requireCleanEnvironment} from '../android-host-profile/profile-contract.mjs';
export {nativeQaEnvironment} from '../android-host-profile/native-environment.mjs';
import {readOwner} from './owned.mjs';
export function createExperimentRoot({runnerTemp,runId,sdk}){
  assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');assert.match(String(runId),/^\d+$/);assert.equal(resolve(runnerTemp),'/home/runner/work/_temp');
  const root=join(runnerTemp,'android-swangle-'+runId+'-'+randomBytes(16).toString('hex'));mkdirSync(root,{mode:0o700});for(const name of ['home','home/config','home/cache','runtime','temp','avds'])mkdirSync(join(root,name),{mode:0o700});
  const options={sdk,avdHome:join(root,'avds'),home:join(root,'home'),temp:join(root,'temp')};return {root,options,childEnv:childEnvironment(options)};
}
export function verifyEmulatorEnvironment(owner,context){
  const before=readOwner(owner),actual=parseEnviron(readFileSync('/proc/'+owner.pid+'/environ')),expected=emulatorEnvironment(actual,context.childEnv,owner.sdk,{pid:owner.pid});
  const receipt=requireCleanEnvironment(actual,expected);assert.deepEqual(readOwner(owner),before);return {...receipt,owner:before,noInheritedCredentials:true};
}
