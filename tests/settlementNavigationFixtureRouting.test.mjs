import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installFreshLoopbackRoutes} from '../e2e/helpers/installFreshLoopbackRoutes.mjs';

const baseURL='http://127.0.0.1:4252/';
function beforeEach(){
  const text=readFileSync(new URL('../e2e/settlement-confirmation-navigation.spec.mjs',import.meta.url),'utf8');
  const match=text.match(/test\.beforeEach\((async \([^]*?\n\})\);/);assert(match,'The real setup callback is required');
  return Function('INCOMING_CASE','incomingClients','settlementIncomingWorkspace','resetLocalQaStateFresh','writeLocalQaStateFresh','seededState','localQaNavigationReady','installFreshLoopbackRoutes','EVENT','expectProtectedConfirmation','return ('+match[1]+');');
}
test('the real navigation setup reaches fresh server bytes after synthetic state has changed',async()=>{
  let handler,cacheEnabled=true,serverVersion='previous',networkReads=0;
  const cached='previous';
  const page={async route(_pattern,callback){handler=callback;cacheEnabled=false;},async addInitScript(){},locator(){return {first(){return this;},async click(){}};}};
  const navigate=async()=>{
    let body;
    if(cacheEnabled)body=cached;
    else await handler({request:()=>({url:()=>baseURL}),async continue(...args){assert.equal(args.length,0);networkReads++;body=serverVersion;},async abort(){throw new Error('Valid local request was blocked');}});
    assert.equal(body,'current','A state-driven journey must reach the current isolated server response');
  };
  const setup=beforeEach()('incoming',new WeakMap(),async()=>{},async()=>{},async()=>{serverVersion='current';},{events:[]},navigate,installFreshLoopbackRoutes,'fixture-event',async()=>{});
  await setup({page,browser:{},baseURL},{title:'close confirmation navigation to home'});assert.equal(networkReads,1);
});
test('fresh loopback routing forwards the original request without payload or response overrides',async()=>{
  let handler;await installFreshLoopbackRoutes({async route(_pattern,callback){handler=callback;}},baseURL);
  for(const method of ['GET','POST','PATCH']){
    let forwarded=0;
    const value=await handler({request:()=>({url:()=>baseURL+'api/state',method:()=>method}),async continue(...args){assert.equal(args.length,0);forwarded++;return 'actual response';},async abort(){throw new Error('Unexpected abort');}});
    assert.equal(forwarded,1);assert.equal(value,'actual response');
  }
});
test('fresh loopback routing blocks foreign origins, ports and embedded credentials',async()=>{
  let handler;await installFreshLoopbackRoutes({async route(_pattern,callback){handler=callback;}},baseURL);
  for(const url of ['https://example.invalid/','http://127.0.0.1:4253/','https://127.0.0.1:4252/','http://user:password@127.0.0.1:4252/']){
    let aborted=0;await handler({request:()=>({url:()=>url}),async continue(){throw new Error('Foreign request forwarded');},async abort(reason){assert.equal(reason,'blockedbyclient');aborted++;}});assert.equal(aborted,1);
  }
});
test('invalid fixture origins are rejected before installing browser routes',async()=>{
  for(const url of ['https://127.0.0.1:4252/','http://example.invalid/','http://localhost:4252/path','http://localhost:4252/?key=bad','http://localhost:4252/#bad','http://user:password@localhost:4252/']){
    let installed=0;await assert.rejects(installFreshLoopbackRoutes({async route(){installed++;}},url),/local loopback root/);assert.equal(installed,0);
  }
});
test('route installation and actual network failures remain visible',async()=>{
  const failure=new Error('synthetic route failure');await assert.rejects(installFreshLoopbackRoutes({async route(){throw failure;}},baseURL),e=>e===failure);
  let handler;await installFreshLoopbackRoutes({async route(_pattern,callback){handler=callback;}},baseURL);
  await assert.rejects(handler({request:()=>({url:()=>baseURL}),async continue(){throw failure;}}),e=>e===failure);
});
