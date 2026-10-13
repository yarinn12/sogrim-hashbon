import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {ARTIFACT_ID,ZIP_SHA} from './intake-origin-guard.mjs';
const MAX=536870912;
const response=await fetch('https://api.github.com/repos/yarinn12/sogrim-hashbon/actions/artifacts/'+ARTIFACT_ID+'/zip',{
 method:'GET',redirect:'manual',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+process.env.GH_TOKEN}});
assert.ok([301,302,303,307,308].includes(response.status),'Cannot obtain original download location');
const location=new URL(response.headers.get('location'));
assert.equal(location.protocol,'https:');assert.equal(location.username,'');assert.equal(location.password,'');
const downloaded=await fetch(location,{method:'GET',redirect:'error',signal:AbortSignal.timeout(120000)});
assert.ok(downloaded.ok);assert.ok(Number(downloaded.headers.get('content-length')??0)<=MAX);
const bytes=Buffer.from(await downloaded.arrayBuffer());
assert.ok(bytes.length>0&&bytes.length<=MAX);
assert.equal(createHash('sha256').update(bytes).digest('hex'),ZIP_SHA,'Original ZIP bytes differ from verified GitHub digest');
mkdirSync('build/ios/original-encrypted',{recursive:true});
writeFileSync('build/ios/original-encrypted/original.zip',bytes,{flag:'wx'});
console.log('Original encrypted ZIP digest verified; no key or Apple write used.');

