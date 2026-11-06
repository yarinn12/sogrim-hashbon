import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {generateKeyPairSync,createPublicKey} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {childEnvironment} from '../scripts/qa/android-host-profile/profile-contract.mjs';
import {nativeQaEnvironment} from '../scripts/qa/android-host-profile/native-environment.mjs';
import {prepareOwnedAdbKey} from '../scripts/qa/android-native-isolated/adb-key-preflight.mjs';

test('actual QA command environment satisfies the unchanged original owned ADB key boundary',()=>{
  const root=mkdtempSync(join(tmpdir(),'host-native-env-'));
  try{
    const options={sdk:join(root,'sdk'),home:join(root,'home'),avdHome:join(root,'avds'),temp:join(root,'temp')};
    const context={root,options,childEnv:childEnvironment(options)},env=nativeQaEnvironment(context),calls=[];
    const privateKey=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey;
    const result=prepareOwnedAdbKey({runnerTemp:env.RUNNER_TEMP,userHome:env.ANDROID_USER_HOME,emulatorHome:env.ANDROID_EMULATOR_HOME,vendorKey:env.ADB_VENDOR_KEYS,adbPath:env.ADB_PATH,env,run:(path,args,config)=>{
      calls.push({path,args,env:config.env});
      if(args[0]==='keygen'){
        const jwk=createPublicKey(privateKey).export({format:'jwk'}),publicBytes=Buffer.alloc(524);
        publicBytes.writeUInt32LE(64,0);Buffer.from(jwk.n,'base64url').reverse().copy(publicBytes,8);
        publicBytes.writeUInt32LE(Buffer.from(jwk.e,'base64url').reduce((n,byte)=>n*256+byte,0),520);
        writeFileSync(args[1],privateKey.export({format:'pem',type:'pkcs8'}));
        writeFileSync(args[1]+'.pub',publicBytes.toString('base64')+' synthetic@qa\n');
      }else assert.deepEqual(args,['start-server']);
      return {status:0};
    }});
    assert.equal(result.prepared,true);assert.equal(result.pairMatches,true);assert.equal(calls.length,2);
    assert.equal(result.userHome,join(root,'android-native-home'));
    assert.equal(result.emulatorHome,context.childEnv.ANDROID_EMULATOR_HOME);
    assert.equal(result.vendorKey,context.childEnv.ADB_VENDOR_KEYS);
    assert.equal(env.HOME,join(root,'home'));assert.equal(env.XDG_CONFIG_HOME,join(root,'home/config'));
    for(const call of calls){assert.equal(call.path,join(options.sdk,'platform-tools/adb'));assert.equal(call.env.RUNNER_TEMP,root);}
    assert.doesNotMatch(JSON.stringify(result),/BEGIN (?:RSA )?PRIVATE KEY/);
    const before=readFileSync(result.vendorKey);
    assert.throws(()=>prepareOwnedAdbKey({runnerTemp:env.RUNNER_TEMP,userHome:env.ANDROID_USER_HOME,emulatorHome:env.ANDROID_EMULATOR_HOME,vendorKey:env.ADB_VENDOR_KEYS,adbPath:env.ADB_PATH,env,run:()=>assert.fail('Must not replace an existing key')}),/overwrite an existing ADB key/);
    assert.deepEqual(readFileSync(result.vendorKey),before);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('QA environment rejects inherited credentials and a foreign root before any SDK command',()=>{
  const root=join(tmpdir(),'host-native-environment-guard'),options={sdk:join(root,'sdk'),home:join(root,'home'),avdHome:join(root,'avds'),temp:join(root,'temp')};
  const context={root,options,childEnv:childEnvironment(options)};
  assert.throws(()=>nativeQaEnvironment({...context,childEnv:{...context.childEnv,GITHUB_TOKEN:'SYNTHETIC_SECRET'}}),error=>/environment keys/.test(error.message)&&!error.stack.includes('SYNTHETIC_SECRET'));
  assert.throws(()=>nativeQaEnvironment({...context,root:join(root,'foreign')}),/Private QA home differs/);
  const env=nativeQaEnvironment(context);
  assert.equal(env.RUNNER_TEMP,root);assert.equal(env.NODE_OPTIONS,'');
  assert.equal(Object.hasOwn(context.childEnv,'RUNNER_TEMP'),false,'Only original QA commands receive their explicit temp root');
});
