import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {calculateSettlement} from '../src/domain/settlement.mjs';

const source=await readFile(process.env.SOGRIM_LAYOUT_FIXTURE_TEST_SOURCE || new URL('../e2e/mobile-layout.spec.mjs',import.meta.url),'utf8');
const title='manual participant editor has one clear explanation and preserves additions with enlarged text';
class FirstActionReached extends Error {}
function harness(manual=true){
 const registered=new Map(),hooks={},prepared=[],scripts=[],navigations=[],listeners=new Map();
 const browserTest=(name,...args)=>registered.set(name,{details:args.length>1?args[0]:{},run:args.at(-1)});
 browserTest.beforeEach=fn=>{hooks.beforeEach=fn;};browserTest.afterEach=fn=>{hooks.afterEach=fn;};
 const locator={first(){return this;}};
 const page={on(type,fn){listeners.set(type,fn);},
  async addInitScript(_fn,arg){scripts.push(structuredClone(arg));},
  async goto(url){navigations.push(url);if(navigations.length>1)throw new Error('premature navigation while the initial service worker is still starting');},
  async evaluate(){},locator(){return locator;},
  getByRole(){return{async click(){throw new FirstActionReached('first root16 UI action');}};}};
 const context=vm.createContext({test:browserTest,calculateSettlement,structuredClone,
  process:{env:{}},prepareMobileLayoutFixture:async data=>prepared.push(structuredClone(data.state)),
  writeLocalQaStateFresh:async()=>{},resetLocalQaStateFresh:async()=>{},
  expect:actual=>({toBeVisible:async()=>{},toEqual:expected=>assert.deepEqual(
   JSON.parse(JSON.stringify(actual)),JSON.parse(JSON.stringify(expected)))}),
  setTimeout,clearTimeout,console});
 const body=source.replace(/^import [^\r\n]+;\r?\n/gmu,'');
 assert(!/^import\s/mu.test(body),'fixture harness expects the original single-line imports');
 vm.runInContext(body,context,{filename:'mobile-layout-fixture-under-test.mjs'});
 const scenario=registered.get(title);assert.equal(typeof scenario?.run,'function');
 const info={title,annotations:manual?(scenario.details.annotation?[scenario.details.annotation]:[]):[],
  project:{use:{baseURL:'http://fixture.example.test'},metadata:{}}};
 return {page,prepared,scripts,navigations,scenario,hooks,listeners,
  ready:()=>hooks.beforeEach({page},info),run:()=>scenario.run({page,request:{},baseURL:'http://fixture.example.test'})};
}

test('manual participant contacts are prepared before the first application document',async()=>{
 const h=harness();await h.ready();const state=h.prepared[0];
 assert.equal(state.friendContacts.length,state.participants.length-1);
 assert.deepEqual(state.friendContacts.map(c=>[c.participantId,c.active,c.source]),
  state.participants.slice(1).map(p=>[p.id,true,p.kind==='user'?'account':'offline']));
 assert.deepEqual(h.scripts[0].state,state);
});
test('root16 starts its real UI action without a second navigation during worker startup',async()=>{
 const h=harness();await h.ready();
 await assert.rejects(h.run(),error=>error instanceof FirstActionReached);
 assert.deepEqual(h.navigations,['/']);assert.equal(h.scripts.length,1,'one authoritative initial-state script');
});
test('unrelated mobile cases retain their original empty-contact fixture',async()=>{
 const h=harness(false);await h.ready();assert.deepEqual(h.prepared[0].friendContacts,[]);
 assert.deepEqual(h.scripts[0].state.friendContacts,[]);assert.deepEqual(h.navigations,['/']);
});
test('the runtime guard still rejects the original service-worker page error',async()=>{
 const h=harness();await h.ready();h.hooks.afterEach();
 h.listeners.get('pageerror')({message:'/127.0.0.1/sw.js?pwa_release=532 due to access control checks.'});
 assert.throws(()=>h.hooks.afterEach(),assert.AssertionError);
});
