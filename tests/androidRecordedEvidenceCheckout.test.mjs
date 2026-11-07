import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join,dirname,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';

const root=new URL('../',import.meta.url);
const records=[
  ['tests/fixtures/android-native-qa496-esrch-frame128.json',43797,'b57b38badd8f6c0023c6d1fcc6815d55ccea00a5bde21994ace8221542453b6c'],
  ['scripts/qa/android-host-profile/reference-sdk-binaries.json',null,'babf74a9a7bd31fddf603126cb54250d14df5f9cb114fab38738852f7182a61a'],
  ['scripts/qa/android-swangle-compatibility/reference-sdk-binaries.json',null,'babf74a9a7bd31fddf603126cb54250d14df5f9cb114fab38738852f7182a61a']
];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

// Exercise Git's real Windows-style checkout conversion, even on Linux/macOS.
// Hashes remain the original recorded bytes; no newline normalization in readers.
for(const [path,size,expected] of records)test('autocrlf checkout preserves exact recorded evidence: '+path,t=>{
  const source=readFileSync(new URL(path,root));
  assert.equal(sha(source),expected);if(size!==null)assert.equal(source.length,size);
  const dir=mkdtempSync(join(tmpdir(),'recorded-evidence-checkout-'));
  t.after(()=>{assert.equal(dirname(resolve(dir)),resolve(tmpdir()));rmSync(dir,{recursive:true,force:true});});
  const repo=join(dir,'repo'),checkout=join(dir,'checkout');mkdirSync(repo);mkdirSync(checkout);
  const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('GIT_'))delete env[key];
  env.GIT_CONFIG_NOSYSTEM='1';env.GIT_CONFIG_GLOBAL=join(dir,'empty-global-config');env.GIT_ATTR_NOSYSTEM='1';
  writeFileSync(env.GIT_CONFIG_GLOBAL,'');
  const git=args=>{const r=spawnSync('git',args,{cwd:repo,env,encoding:'utf8'});assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr);return r.stdout;};
  git(['init','--quiet','--template=']);
  writeFileSync(join(repo,'.gitattributes'),readFileSync(new URL('.gitattributes',root)));
  mkdirSync(dirname(join(repo,path)),{recursive:true});writeFileSync(join(repo,path),source);
  git(['-c','core.autocrlf=false','add','--','.gitattributes',path]);
  git(['-c','core.autocrlf=true','checkout-index','--all','--force','--prefix='+checkout.split(sep).join('/')+'/']);
  const actual=readFileSync(join(checkout,path));
  assert.equal(actual.length,source.length,'Git checkout changed the recorded byte count');
  assert.equal(sha(actual),expected,'Git checkout changed the original recorded SHA256');
  assert.deepEqual(actual,source);
});
