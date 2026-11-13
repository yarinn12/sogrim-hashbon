import assert from 'node:assert/strict';
import {test} from 'node:test';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,basename,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {CONTEXT,encryptInspection,decryptInspection} from '../scripts/qa/ios-parity/private-inspection-envelope.mjs';
const keys=()=>generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}}),owner=keys(),foreign=keys(),raw=Buffer.from('private synthetic diagnostic: stack frame 0x1234');
const fresh=()=>encryptInspection(raw,owner.publicKey),flip=value=>{const b=Buffer.from(value,'base64');b[0]^=1;return b.toString('base64');};
test('only the local recipient can recover the original diagnostic bytes',()=>assert.deepEqual(decryptInspection(fresh(),owner.privateKey),raw));
test('fresh encryption does not reuse a data key or nonce',()=>{const a=fresh(),b=fresh();assert.notEqual(a.iv,b.iv);assert.notEqual(a.wrappedKey,b.wrappedKey);assert.notEqual(a.ciphertext,b.ciphertext);});
test('a different local key cannot open the inspection',()=>assert.throws(()=>decryptInspection(fresh(),foreign.privateKey)));
test('ciphertext corruption releases no unauthenticated plaintext',()=>{const e=fresh();e.ciphertext=flip(e.ciphertext);assert.throws(()=>decryptInspection(e,owner.privateKey));});
test('a corrupt authentication tag is rejected',()=>{const e=fresh();e.tag=flip(e.tag);assert.throws(()=>decryptInspection(e,owner.privateKey));});
test('a corrupt wrapped data key is rejected',()=>{const e=fresh();e.wrappedKey=flip(e.wrappedKey);assert.throws(()=>decryptInspection(e,owner.privateKey));});
test('a different original artifact cannot be substituted',()=>{const e=fresh();e.context.originalArtifact++;assert.throws(()=>decryptInspection(e,owner.privateKey));assert.throws(()=>encryptInspection(raw,owner.publicKey,{...CONTEXT,originalJob:1}));});
test('unreviewed envelope fields and algorithm changes fail closed',()=>{for(const change of [{extra:'data'},{schemaVersion:2},{format:'none'}])assert.throws(()=>decryptInspection({...fresh(),...change},owner.privateKey));});
test('noncanonical base64 is rejected',()=>{const e=fresh();e.iv+='\n';assert.throws(()=>decryptInspection(e,owner.privateKey));});
test('a private key cannot be used as the exported public recipient',()=>assert.throws(()=>encryptInspection(raw,owner.privateKey)));
test('empty or over-limit input is rejected before export',()=>{assert.throws(()=>encryptInspection(Buffer.alloc(0),owner.publicKey));assert.throws(()=>encryptInspection(Buffer.from('12345'),owner.publicKey,CONTEXT,{maximumBytes:4}));assert.deepEqual(decryptInspection(encryptInspection(Buffer.from('1234'),owner.publicKey,CONTEXT,{maximumBytes:4}),owner.privateKey),Buffer.from('1234'));});
test('the CLI emits no private content and creates no file after authentication failure',()=>{
 const base=realpathSync(process.env.TEMP||tmpdir()),dir=mkdtempSync(join(base,'private-inspection-tests-')),cli=resolve('scripts/qa/ios-parity/private-inspection-envelope.mjs');
 try{writeFileSync(join(dir,'private.pem'),foreign.privateKey);writeFileSync(join(dir,'input.json'),JSON.stringify(fresh()));const result=spawnSync(process.execPath,[cli,'decrypt',join(dir,'input.json'),join(dir,'private.pem'),join(dir,'out')],{encoding:'utf8'});assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(result.stderr,'PRIVATE_INSPECTION_REJECTED\n');assert.ok(!existsSync(join(dir,'out')));assert.ok(!result.stderr.includes(raw.toString()));}
 finally{const target=realpathSync(dir);assert.equal(dirname(target),base);assert.ok(basename(target).startsWith('private-inspection-tests-'));rmSync(target,{recursive:true,force:false});}
});
test('the local decryptor accepts its protected recipient key through stdin without writing that key',()=>{
 const base=realpathSync(process.env.TEMP||tmpdir()),dir=mkdtempSync(join(base,'private-inspection-tests-')),cli=resolve('scripts/qa/ios-parity/private-inspection-envelope.mjs');
 try{writeFileSync(join(dir,'input.json'),JSON.stringify(fresh()));const result=spawnSync(process.execPath,[cli,'decrypt',join(dir,'input.json'),'-',join(dir,'out')],{encoding:'utf8',input:owner.privateKey});assert.equal(result.status,0);assert.equal(result.stderr,'');assert.ok(!result.stdout.includes(owner.privateKey));assert.ok(!result.stdout.includes(raw.toString()));assert.deepEqual(readFileSync(join(dir,'out')),raw);assert.ok(!existsSync(join(dir,'private.pem')));}
 finally{const target=realpathSync(dir);assert.equal(dirname(target),base);assert.ok(basename(target).startsWith('private-inspection-tests-'));rmSync(target,{recursive:true,force:false});}
});
