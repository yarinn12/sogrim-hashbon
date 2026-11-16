import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {pathToFileURL} from 'node:url';
const {replaceClosedSummaryScreen}=process.env.CLOSED_SUMMARY_REPLACEMENT_FIXTURE_BASELINE
 ?await import(pathToFileURL(process.env.CLOSED_SUMMARY_REPLACEMENT_FIXTURE_BASELINE).href)
 :await import('../e2e/helpers/replaceClosedSummaryScreen.mjs');

const source=readFileSync(new URL('../e2e/closed-summary-presentation.spec.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const start=source.indexOf('async function geometry(page,root){'),end=source.indexOf('\n}\n',start);
assert.ok(start>=0&&end>start);
const geometrySource=source.slice(start,end+2);
const selector='.settlement-screen[data-event-view="summary"]';

function scene({missing=false,noOp=false}={}){
 const doc={current:null,queries:0,notices:0,dispatchEvent(event){assert.equal(event.type,'settle-friends:notice');this.notices++;return true},documentElement:{scrollWidth:320,clientWidth:320},querySelector(value){assert.equal(value,selector);this.queries++;return this.current},createTreeWalker(){return{nextNode:()=>null}}};
 function node(connected){
  const n={isConnected:connected,innerHTML:'<summary>synthetic share</summary><summary>synthetic preview</summary>',cloneNode(deep){assert.equal(deep,true);return node(false)},replaceWith(next){if(noOp)return;this.isConnected=false;next.isConnected=true;doc.current=next}};
  const targets=[0,1].map(()=>({getBoundingClientRect:()=>({left:0,top:0,right:n.isConnected?100:0,bottom:n.isConnected?44:0,width:n.isConnected?100:0,height:n.isConnected?44:0})}));
  n.querySelectorAll=value=>value.includes('.font-num')?[]:targets;
  return n;
 }
 doc.current=missing?null:node(true);return doc;
}

function loadGeometry(doc,{staleReader=false}={}){
 let code=geometrySource;
 if(staleReader){
  const original=` const g=await page.evaluate(()=>{\n  const e=document.querySelector('${selector}');`;
  assert.ok(code.includes(original));code=code.replace(original," const g=await page.locator('.settlement-screen').evaluate(e=>{");
 }
 const expect=value=>({toBe:expected=>assert.equal(value,expected),toEqual:expected=>assert.deepEqual(structuredClone(value),structuredClone(expected)),toHaveLength:expected=>assert.equal(value.length,expected),toBeGreaterThanOrEqual:expected=>assert.ok(value>=expected)});
 return runInNewContext('('+code+')',{document:doc,expect,NodeFilter:{SHOW_TEXT:4}});
}

function stalePage(doc,previous){
 let locatorCalls=0;
 return{evaluate:fn=>structuredClone(fn()),locator(value){assert.equal(value,'.settlement-screen');locatorCalls++;return{evaluate:fn=>structuredClone(fn(previous))}},get locatorCalls(){return locatorCalls}};
}

test('controlled replacement detaches the original summary and preserves its markup',()=>{
 const doc=scene(),previous=doc.current,result=replaceClosedSummaryScreen(doc);
 assert.deepEqual(result,{replaced:true,previousConnected:false,currentConnected:true,sameMarkup:true});
 assert.notEqual(doc.current,previous);assert.equal(previous.isConnected,false);
 assert.deepEqual([...previous.querySelectorAll('.settlement-debt-share > summary,.settlement-debt-preview > summary')].map(n=>n.getBoundingClientRect().width),[0,0]);
});

test('replacement fixture rejects a missing screen',()=>{
 assert.throws(()=>replaceClosedSummaryScreen(scene({missing:true})),/requires a connected screen/);
});

test('replacement fixture rejects an operation that leaves the original root attached',()=>{
 assert.throws(()=>replaceClosedSummaryScreen(scene({noOp:true})),/did not replace the screen/);
});

test('actual geometry reader selects the current root even when a stale locator is available',async()=>{
 const doc=scene(),previous=doc.current;replaceClosedSummaryScreen(doc);doc.queries=0;
 const page=stalePage(doc,previous);await loadGeometry(doc)(page,20);
 assert.equal(doc.queries,1);assert.equal(page.locatorCalls,0);
});

test('geometry still fails if its reader regresses to the detached summary',async()=>{
 const doc=scene(),previous=doc.current;replaceClosedSummaryScreen(doc);
 const page=stalePage(doc,previous);
 await assert.rejects(()=>loadGeometry(doc,{staleReader:true})(page,20),/Current settlement summary is not connected/);
 assert.equal(page.locatorCalls,1);
});
