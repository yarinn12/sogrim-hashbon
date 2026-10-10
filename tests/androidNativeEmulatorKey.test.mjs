import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {generateKeyPairSync,createPublicKey,sign,verify} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
const {prepareOwnedAdbKey,verifyAdbKeyPair,requireUnusedAdbServerPort}=await import(process.env.ANDROID_QA_EMULATOR_KEY_TEST_MODULE||'../scripts/qa/android-native-isolated/adb-key-preflight.mjs');

function rsa(){return generateKeyPairSync('rsa',{modulusLength:2048});}
function adbPublic(key){
  const jwk=createPublicKey(key).export({format:'jwk'}),out=Buffer.alloc(524);out.writeUInt32LE(64,0);Buffer.from(jwk.n,'base64url').reverse().copy(out,8);out.writeUInt32LE(Buffer.from(jwk.e,'base64url').reduce((n,byte)=>n*256+byte,0),520);return out.toString('base64')+' synthetic@qa\n';
}
function fixture(){
  const runnerTemp=mkdtempSync(join(tmpdir(),'android-qa-adb-key-')),home=join(runnerTemp,'android-native-home');return {runnerTemp,home,options:{runnerTemp,userHome:home,emulatorHome:home,vendorKey:join(home,'adbkey'),adbPath:'owned-fake-sdk-adb'}};
}
function keygen(privateKey,publicKey=privateKey){return (_path,args,options)=>{assert.equal(options.env.ANDROID_EMULATOR_HOME,options.env.ANDROID_USER_HOME);assert.equal(options.timeout,15000);if(args[0]==='keygen'){assert.equal(options.env.ADB_VENDOR_KEYS,args[1]);writeFileSync(args[1],privateKey.export({format:'pem',type:'pkcs8'}));writeFileSync(args[1]+'.pub',adbPublic(publicKey));}else{assert.deepEqual(args,['start-server']);if(!/^tcp:(?:localhost:)?\d+$/.test(options.env.ADB_SERVER_SOCKET))return {status:255,stderr:'* cannot start server on remote host'};assert.equal(verifyAdbKeyPair(options.env.ADB_VENDOR_KEYS).pairMatches,true);}return {status:0};};}

test('the first emulator launch can use the same pre-created key as the ADB client',()=>{
  const f=fixture();try{
    const key=rsa().privateKey,result=prepareOwnedAdbKey({...f.options,run:keygen(key)});
    assert.equal(result.prepared,true);assert.equal(result.serverStartedWithSharedKey,true);assert.equal(result.pairMatches,true);assert.equal(result.emulatorHome,f.home);assert.equal(result.vendorKey,join(f.home,'adbkey'));
    const seededGuestKey=readFileSync(join(result.emulatorHome,'adbkey.pub'),'utf8');assert.equal(seededGuestKey,readFileSync(result.vendorKey+'.pub','utf8'));
    const bytes=Buffer.from(seededGuestKey.split(/\s/)[0],'base64');const exponent=Buffer.alloc(4);exponent.writeUInt32BE(bytes.readUInt32LE(520));
    const guestPublic=createPublicKey({format:'jwk',key:{kty:'RSA',n:Buffer.from(bytes.subarray(8,264)).reverse().toString('base64url'),e:exponent.subarray(exponent.findIndex(byte=>byte!==0)).toString('base64url')}});
    const token=Buffer.alloc(20,0x37);assert.equal(verify('sha1',token,guestPublic,sign('sha1',token,readFileSync(result.vendorKey))),true);
    assert.doesNotMatch(JSON.stringify(result),/BEGIN PRIVATE KEY|BEGIN RSA PRIVATE KEY/);
  }finally{rmSync(f.runnerTemp,{recursive:true,force:true});}
});
test('SDK startup diagnostics retain the failure reason while redacting private key material',()=>{
  const f=fixture(),key=rsa().privateKey,generate=keygen(key);try{
    const privatePem=key.export({format:'pem',type:'pkcs8'});
    assert.throws(()=>prepareOwnedAdbKey({...f.options,run:(path,args,options)=>args[0]==='start-server'?{status:255,stderr:'* cannot start server on remote host\n'+privatePem,stdout:'startup aborted'}:generate(path,args,options)}),error=>{
      assert.equal(error.diagnostic.exitCode,255);assert.match(error.diagnostic.stderr,/cannot start server on remote host/);assert.equal(error.diagnostic.stdout,'startup aborted');assert.equal(/BEGIN PRIVATE KEY|BEGIN RSA PRIVATE KEY/.test(JSON.stringify(error.diagnostic)),false,'Diagnostic contains private key material');assert.equal(error.diagnostic.stderr.includes(privatePem),false);assert.match(error.diagnostic.stderr,/redacted private key/);return true;
    });
  }finally{rmSync(f.runnerTemp,{recursive:true,force:true});}
});
test('a missing or foreign emulator key path fails before key generation and existing keys are preserved',()=>{
  const f=fixture();let calls=0;try{
    const run=(...args)=>{calls++;return keygen(rsa().privateKey)(...args);};
    assert.throws(()=>prepareOwnedAdbKey({...f.options,emulatorHome:undefined,run}),/share the owned QA directory/);
    assert.throws(()=>prepareOwnedAdbKey({...f.options,vendorKey:join(f.runnerTemp,'foreign-key'),run}),/share the owned QA directory/);
    assert.equal(calls,0);assert.equal(existsSync(f.home),false);
    prepareOwnedAdbKey({...f.options,run});const before=readFileSync(f.options.vendorKey);
    assert.throws(()=>prepareOwnedAdbKey({...f.options,run}),/overwrite/);assert.equal(calls,2);assert.deepEqual(readFileSync(f.options.vendorKey),before);
  }finally{rmSync(f.runnerTemp,{recursive:true,force:true});}
});
test('an existing server is refused without being killed and failed fresh startup fails the preflight',async()=>{
  const occupied=createServer();await new Promise(resolve=>occupied.listen(0,resolve));
  try{await assert.rejects(requireUnusedAdbServerPort(occupied.address().port),error=>error.code==='EADDRINUSE');assert.equal(occupied.listening,true);}finally{await new Promise(resolve=>occupied.close(resolve));}
  const f=fixture();try{const generate=keygen(rsa().privateKey);assert.throws(()=>prepareOwnedAdbKey({...f.options,run:(path,args,options)=>args[0]==='start-server'?{status:1}:generate(path,args,options)}),/server startup failed/);}finally{rmSync(f.runnerTemp,{recursive:true,force:true});}
});
test('a successful SDK exit cannot hide a missing public key or a mismatched signing key',()=>{
  const f=fixture(),other=fixture();try{
    assert.throws(()=>prepareOwnedAdbKey({...f.options,run:(_path,args)=>{writeFileSync(args[1],rsa().privateKey.export({format:'pem',type:'pkcs8'}));return {status:0};}}),/ENOENT/);
    assert.throws(()=>prepareOwnedAdbKey({...other.options,run:keygen(rsa().privateKey,rsa().privateKey)}),/pair does not match/);
    assert.throws(()=>verifyAdbKeyPair(other.options.vendorKey),/pair does not match/);
  }finally{rmSync(f.runnerTemp,{recursive:true,force:true});rmSync(other.runnerTemp,{recursive:true,force:true});}
});
