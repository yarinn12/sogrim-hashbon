import assert from 'node:assert/strict';
import {isAbsolute,join,resolve} from 'node:path';
import {SOURCE} from './contract.mjs';
import {childEnvironment,requireCleanEnvironment} from './profile-contract.mjs';

// Original QA tools need an explicit temp root and their owned Android home.
// Build those values from our private context, never from the runner environment.
// Emulator/profiler children keep their separate operational-only allowlist.
export function nativeQaEnvironment(context){
  assert.ok(typeof context.root==='string'&&isAbsolute(context.root),'Require an explicit private QA root');
  const root=resolve(context.root);
  assert.ok(resolve(context.options.home)===join(root,'home'),'Private QA home differs from the owned root');
  requireCleanEnvironment(context.childEnv,childEnvironment(context.options));
  return {...context.childEnv,RUNNER_TEMP:root,ANDROID_QA_SOURCE:SOURCE,ANDROID_QA_DEVICE:'emulator-5582',ADB_PATH:join(context.options.sdk,'platform-tools/adb'),SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD:'1',NODE_OPTIONS:''};
}
