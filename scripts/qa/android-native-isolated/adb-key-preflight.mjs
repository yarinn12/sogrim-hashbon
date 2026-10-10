import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync,chmodSync,realpathSync} from 'node:fs';
import {createPrivateKey,createPublicKey,createHash} from 'node:crypto';
import {isAbsolute,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:net';

export async function requireUnusedAdbServerPort(port=5037){
  const probe=createServer();
  await new Promise((accept,reject)=>{probe.once('error',reject);probe.listen(port,()=>probe.close(error=>error?reject(error):accept()));});
}

export function verifyAdbKeyPair(keyPath){
  const privateKey=createPrivateKey(readFileSync(keyPath));
  if(privateKey.asymmetricKeyType!=='rsa'||privateKey.asymmetricKeyDetails.modulusLength!==2048)throw new Error('Require an actual 2048-bit RSA ADB test key');
  const encoded=readFileSync(keyPath+'.pub','utf8').trim().split(/\s+/)[0];
  const publicKey=Buffer.from(encoded,'base64');
  if(publicKey.length!==524||publicKey.readUInt32LE(0)!==64)throw new Error('Invalid Android ADB public key format');
  const jwk=createPublicKey(privateKey).export({format:'jwk'});
  const modulus=Buffer.from(publicKey.subarray(8,264)).reverse();
  const exponent=Buffer.from(jwk.e,'base64url').reduce((value,byte)=>value*256+byte,0);
  if(!modulus.equals(Buffer.from(jwk.n,'base64url'))||publicKey.readUInt32LE(520)!==exponent)throw new Error('ADB private/public key pair does not match');
  return {pairMatches:true,publicKeySha256:createHash('sha256').update(publicKey).digest('hex')};
}

export function prepareOwnedAdbKey({runnerTemp,userHome,emulatorHome,vendorKey,adbPath,env=process.env,run=spawnSync,serverPort=5037}){
  if(!runnerTemp||!isAbsolute(runnerTemp)||!adbPath)throw new Error('Require explicit runner temporary directory and ADB path');
  const ownedHome=join(resolve(runnerTemp),'android-native-home'),keyPath=join(ownedHome,'adbkey');
  if(!userHome||!emulatorHome||!vendorKey||resolve(userHome)!==ownedHome||resolve(emulatorHome)!==ownedHome||resolve(vendorKey)!==keyPath)throw new Error('Emulator home and ADB vendor key must share the owned QA directory');
  mkdirSync(ownedHome,{recursive:true,mode:0o700});
  if(realpathSync(ownedHome)!==join(realpathSync(runnerTemp),'android-native-home'))throw new Error('Refuse redirected QA key directory');
  if(existsSync(keyPath)||existsSync(keyPath+'.pub'))throw new Error('Refuse to overwrite an existing ADB key');
  if(!Number.isSafeInteger(serverPort)||serverPort<1024||serverPort>65535)throw new Error('Require a valid local ADB server port');
  const options={encoding:'utf8',timeout:15000,killSignal:'SIGKILL',windowsHide:true,maxBuffer:65536,env:{...env,ANDROID_USER_HOME:ownedHome,ANDROID_EMULATOR_HOME:ownedHome,ADB_VENDOR_KEYS:keyPath,ANDROID_ADB_SERVER_PORT:String(serverPort),ADB_SERVER_SOCKET:`tcp:127.0.0.1:${serverPort}`}};
  const result=run(adbPath,['keygen',keyPath],options);
  if(result.error||result.status!==0)throw new Error(`Isolated ADB key generation failed (${result.error?.code||result.status})`);
  const verification=verifyAdbKeyPair(keyPath);
  chmodSync(keyPath,0o600);
  const server=run(adbPath,['start-server'],options);
  if(server.error||server.status!==0)throw new Error(`Owned ADB server startup failed (${server.error?.code||server.status})`);
  return {prepared:true,serverStartedWithSharedKey:true,serverSocket:options.env.ADB_SERVER_SOCKET,userHome:ownedHome,emulatorHome:ownedHome,vendorKey:keyPath,...verification};
}

async function main(){
  const out=resolve('artifacts/android-native-isolated');mkdirSync(out,{recursive:true});
  const report={source:process.env.ANDROID_QA_SOURCE,prepared:false,startedAtUtc:new Date().toISOString()};
  try{await requireUnusedAdbServerPort();Object.assign(report,prepareOwnedAdbKey({runnerTemp:process.env.RUNNER_TEMP,userHome:process.env.ANDROID_USER_HOME,emulatorHome:process.env.ANDROID_EMULATOR_HOME,vendorKey:process.env.ADB_VENDOR_KEYS,adbPath:process.env.ADB_PATH}));}
  catch(error){report.error=error.message;process.exitCode=1;}
  finally{report.completedAtUtc=new Date().toISOString();writeFileSync(join(out,'adb-key-preflight.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
