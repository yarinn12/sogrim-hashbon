import test from 'node:test';
import assert from 'node:assert/strict';
import {readUnusedBuild} from '../scripts/qa/ios-signing/intake-source-guard.mjs';
import {CONTRACT} from '../scripts/qa/ios-signing/intake-bindings.mjs';

function fixture(pages, {bundle='com.sogrimhashbon.app'}={}) {
  const calls=[];
  return {calls, request: async (path, options) => {
    assert.equal(options.method,'GET'); calls.push(path);
    if(path==='/v1/apps/6809952514')return {data:{id:'6809952514',attributes:{bundleId:bundle}}};
    const url=new URL(path,'https://api.appstoreconnect.apple.com');
    assert.equal(url.pathname,'/v1/builds');
    return structuredClone(pages[Math.min(calls.length-2,pages.length-1)]);
  }};
}
const page=(versions,next=null)=>({data:versions.map(version=>({attributes:{version}})),links:{next}});
for(const versions of [['195'],['194'],[]])test(`intake accepts existing ${versions.join(',')||'empty roster'} for the explicit196 slot`,async()=>{
  assert.equal(CONTRACT.build,'196');
  const p=fixture([page(versions)]), result=await readUnusedBuild(p.request);
  assert.equal(result.candidateBuild,196);
  assert.equal(result.maximumUploadedBuild,versions.length?Number(versions[0]):0);
  assert.equal(result.reserved,false);
});
for(const version of ['196','197'])test(`intake rejects occupied or superseded196 slot when ${version} exists`,async()=>{
  const p=fixture([page([version])]);
  await assert.rejects(()=>readUnusedBuild(p.request),/no longer unused/);
});
test('intake checks the next page before accepting the slot',async()=>{
  const next='https://api.appstoreconnect.apple.com/v1/builds?cursor=second';
  const p=fixture([page(['195'],next),page(['196'])]);
  await assert.rejects(()=>readUnusedBuild(p.request),/no longer unused/);
  assert.equal(p.calls.length,3);
});
test('intake rejects a foreign pagination origin',async()=>{
  const p=fixture([page(['194'],'https://example.test/v1/builds?cursor=second')]);
  await assert.rejects(()=>readUnusedBuild(p.request));assert.equal(p.calls.length,2);
});
test('intake rejects pagination that never completes',async()=>{
  const p=fixture([page(['194'],'/v1/builds?cursor=again')]);
  await assert.rejects(()=>readUnusedBuild(p.request),/pagination incomplete/);
  assert.equal(p.calls.length,21);
});
test('intake rejects an incomplete Apple build collection',async()=>{
  const p=fixture([{data:null,links:{next:null}}]);
  await assert.rejects(()=>readUnusedBuild(p.request),/Incomplete Apple build list/);
});
for(const version of ['invalid','9007199254740992'])test(`intake rejects invalid build number ${version}`,async()=>{
  const p=fixture([page([version])]);await assert.rejects(()=>readUnusedBuild(p.request));
});
test('intake rejects an unrelated app before reading its builds',async()=>{
  const p=fixture([page(['195'])],{bundle:'example.wrong'});
  await assert.rejects(()=>readUnusedBuild(p.request));assert.equal(p.calls.length,1);
});
