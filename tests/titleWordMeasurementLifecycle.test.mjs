import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

// Execute the real browser helper, not a copied measurement implementation.
const source=readFileSync(new URL('../e2e/profile-friends-cards-presentation.spec.mjs',import.meta.url),'utf8');
const start=source.indexOf('async function wholeTitleWords(page){');
const end=source.indexOf('\nfor(const size of',start);
assert(start>=0&&end>start&&source.indexOf('async function wholeTitleWords(page){',start+1)===-1);

function fixture({replaceBetweenCalls=false,broken=false,empty=false}={}){
 let current=[],assertions=0,replacements=0;
 const names=empty?[]:['סוף שבוע','יום הולדת','טיול לים'];
 const render=()=>{current=names.map(text=>{const title={isConnected:true};title.firstChild={textContent:text,title};return title;});};render();
 const replace=()=>{for(const title of current)title.isConnected=false;render();replacements++;};
 const document={
  querySelectorAll(selector){assert.equal(selector,'.event-row-title strong');return current;},
  createRange(){let node;return{setStart(n){node=n;},setEnd(n){assert.equal(n,node);},getClientRects(){return node.title.isConnected?Array.from({length:broken?2:1},()=>({width:12})):[];}};}
 };
 const expect=(value,message)=>({toBe(want){assertions++;assert.equal(value,want,message);},toBeGreaterThan(want){assert(value>want,message);}});
 const context=vm.createContext({document,expect});
 const helper=vm.runInContext(source.slice(start,end)+'\nwholeTitleWords;',context);
 const page={
  locator(selector){assert.equal(selector,'.event-row-title strong');return{async evaluateAll(callback){const captured=current;if(replaceBetweenCalls)replace();return callback(captured);}};},
  async evaluate(callback){if(replaceBetweenCalls)replace();return callback();}
 };
 return{run:()=>helper(page),state:()=>({assertions,replacements,currentTitles:current.length})};
}

test('whole-title measurement reads current nodes after a render between protocol calls',async()=>{
 const f=fixture({replaceBetweenCalls:true});await f.run();
 assert.deepEqual(f.state(),{assertions:6,replacements:1,currentTitles:3});
});
test('current Hebrew word split over two lines remains a failure',async()=>{
 const f=fixture({broken:true});await assert.rejects(f.run(),error=>error.actual===2&&error.expected===1);
});
test('an empty title inventory cannot pass the whole-word geometry check',async()=>{
 const f=fixture({empty:true});await assert.rejects(f.run());
});
