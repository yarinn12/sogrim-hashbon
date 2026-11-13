import assert from 'node:assert/strict';
import {constants,createCipheriv,createDecipheriv,createHash,createPrivateKey,createPublicKey,privateDecrypt,publicEncrypt,randomBytes} from 'node:crypto';
import {readFileSync,statSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const CONTEXT=Object.freeze({purpose:'QA522_ORIGINAL_NATIVE_RESULT_ONLY',originalRun:43312636743,originalJob:131513559031,originalArtifact:13987898538,originalZipSha256:'41511f37d07b3d823d803f2fb952dc4c6fb26c18247f327d452a5bc0db6f2736'});
export const MAX_BYTES=128*1024*1024;
const FORMAT='RSA-OAEP-SHA256+A256GCM',sha=raw=>createHash('sha256').update(raw).digest('hex');
const canonical=value=>JSON.stringify(Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])));
function contextBytes(context){assert.equal(canonical(context),canonical(CONTEXT),'Original evidence scope changed');return Buffer.from(canonical(context));}
function publicRsa(pem){
 assert.equal(typeof pem,'string');assert.ok(pem.startsWith('-----BEGIN PUBLIC KEY-----'),'Only a public key may leave the local machine');
 const key=createPublicKey(pem);assert.equal(key.asymmetricKeyType,'rsa');assert.ok(key.asymmetricKeyDetails.modulusLength>=3072&&key.asymmetricKeyDetails.modulusLength<=8192);return key;
}
function b64(value,length){assert.equal(typeof value,'string');const raw=Buffer.from(value,'base64');assert.equal(raw.toString('base64'),value,'Noncanonical encoding');if(length!==undefined)assert.equal(raw.length,length);return raw;}
function limit(raw,maximum){assert.ok(Number.isSafeInteger(maximum)&&maximum>0&&maximum<=MAX_BYTES);assert.ok(Buffer.isBuffer(raw)&&raw.length>0&&raw.length<=maximum,'Inspection size rejected');}
export function encryptInspection(raw,publicPem,context=CONTEXT,{maximumBytes=MAX_BYTES}={}){
 limit(raw,maximumBytes);const aad=contextBytes(context),publicKey=publicRsa(publicPem),key=randomBytes(32),iv=randomBytes(12);
 try{
  const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad);const ciphertext=Buffer.concat([cipher.update(raw),cipher.final()]);
  const wrappedKey=publicEncrypt({key:publicKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},key);
  return{schemaVersion:1,format:FORMAT,context:{...context},publicKeySha256:sha(publicKey.export({type:'spki',format:'der'})),wrappedKey:wrappedKey.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};
 }finally{key.fill(0);}
}
export function decryptInspection(envelope,privatePem,context=CONTEXT){
 assert.deepEqual(Object.keys(envelope).sort(),['schemaVersion','format','context','publicKeySha256','wrappedKey','iv','tag','ciphertext'].sort());assert.equal(envelope.schemaVersion,1);assert.equal(envelope.format,FORMAT);
 const aad=contextBytes(envelope.context);assert.equal(canonical(envelope.context),contextBytes(context).toString());
 const privateKey=createPrivateKey(privatePem);assert.equal(privateKey.asymmetricKeyType,'rsa');assert.ok(privateKey.asymmetricKeyDetails.modulusLength>=3072&&privateKey.asymmetricKeyDetails.modulusLength<=8192);
 assert.equal(sha(createPublicKey(privateKey).export({type:'spki',format:'der'})),envelope.publicKeySha256,'Wrong local recipient');
 const wrapped=b64(envelope.wrappedKey,privateKey.asymmetricKeyDetails.modulusLength/8),iv=b64(envelope.iv,12),tag=b64(envelope.tag,16),ciphertext=b64(envelope.ciphertext);limit(ciphertext,MAX_BYTES);
 const key=privateDecrypt({key:privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},wrapped);
 try{assert.equal(key.length,32);const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAAD(aad);decipher.setAuthTag(tag);return Buffer.concat([decipher.update(ciphertext),decipher.final()]);}finally{key.fill(0);}
}
export function runCli(argv){
 assert.equal(argv.length,4);const[mode,input,keyFile,output]=argv;assert.ok(mode==='encrypt'||mode==='decrypt');assert.ok(statSync(input).size<=(mode==='encrypt'?MAX_BYTES:MAX_BYTES*2));
 assert.ok(keyFile!=='-'||mode==='decrypt','The remote encryptor must use only the pinned public key');
 const raw=readFileSync(input),key=readFileSync(keyFile==='-'?0:keyFile,'utf8');assert.ok(key.length<16384);let result;
 if(mode==='encrypt')result=Buffer.from(JSON.stringify(encryptInspection(raw,key))+'\n');else result=decryptInspection(JSON.parse(raw),key);
 writeFileSync(output,result,{flag:'wx',mode:0o600});return{operation:mode,bytes:result.length,outputSha256:sha(result)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{process.stdout.write('PRIVATE_INSPECTION_OK '+JSON.stringify(runCli(process.argv.slice(2)))+'\n');}
 catch{process.stderr.write('PRIVATE_INSPECTION_REJECTED\n');process.exitCode=1;}
}
