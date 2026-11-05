import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {INTAKE_BINDINGS,requireBoundEnvironment} from './intake-bindings.mjs';
import {validateOriginReceipt} from './intake-nov5-proof.mjs';
export async function main({env=process.env,fetchImpl=fetch}={}){
 requireBoundEnvironment(env);
 validateOriginReceipt(JSON.parse(readFileSync('build/ios/upload-origin.json','utf8')));
 const s=INTAKE_BINDINGS.signing;
 const response=await fetchImpl('https://api.github.com/repos/yarinn12/sogrim-hashbon/actions/artifacts/'+s.artifactId+'/zip',{
  method:'GET',redirect:'manual',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+env.GH_TOKEN}});
 assert.ok([301,302,303,307,308].includes(response.status),'Cannot obtain original download location');
 const location=new URL(response.headers.get('location'));
 assert.equal(location.protocol,'https:');assert.equal(location.username,'');assert.equal(location.password,'');
 const downloaded=await fetchImpl(location,{method:'GET',redirect:'error',signal:AbortSignal.timeout(120000)});
 assert.equal(downloaded.status,200);assert.ok(Number(downloaded.headers.get('content-length')??0)<=s.artifactSize);
 const bytes=Buffer.from(await downloaded.arrayBuffer());
 assert.equal(bytes.length,s.artifactSize,'Original ZIP size differs');
 assert.equal(createHash('sha256').update(bytes).digest('hex'),s.zipSha256,'Original ZIP digest differs');
 mkdirSync('build/ios/original-encrypted',{recursive:true});
 writeFileSync('build/ios/original-encrypted/original.zip',bytes,{flag:'wx'});
 console.log('Original encrypted ZIP bytes verified; no key or Apple write used.');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))await main();
