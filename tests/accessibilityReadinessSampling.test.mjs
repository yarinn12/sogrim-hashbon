import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(process.env.ACCESSIBILITY_READINESS_HELPER || 'e2e/helpers/accessibilityPresentation.mjs','utf8');
const start=source.indexOf('async function stable('),end=source.indexOf('async function hit(',start);
assert.ok(start>=0 && end>start);
const body=source.slice(start,end);

function harness({settlesAt=0,lookupDelays=[],present=true,transform='matrix(0.99, 0, 0, 0.99, 0, 12)',animationUntil=0}={}) {
 let now=0,lookups=0,frames=0;
 const element={},document={
  fonts:{ready:Promise.resolve()},
  querySelector:selector=>{assert.equal(selector,'.accessibility-center');return present?element:null;},
  getAnimations:()=>[{effect:{getComputedTiming:()=>({endTime:animationUntil})},playState:now<animationUntil?'running':'finished'}]
 };
 class Matrix {
  constructor(value){const values=value.slice(7,-1).split(',').map(Number);this.a=values[0];this.d=values[3];this.m42=values[5];}
 }
 const context={
  document,DOMMatrixReadOnly:Matrix,
  getComputedStyle:e=>{assert.equal(e,element);return {transform:now>=settlesAt?'none':transform};},
  requestAnimationFrame:fn=>{frames++;queueMicrotask(()=>fn(now));}
 };
 const invoke=(fn,arg)=>runInNewContext('('+fn.toString()+')(__arg)',{...context,__arg:arg});
 const page={
  evaluate:async fn=>{now+=4;return invoke(fn);},
  locator:selector=>{assert.equal(selector,'.accessibility-center');return {
   evaluate:async fn=>{now+=lookupDelays[lookups++]||0;return invoke(fn,element);}
  };}
 };
 const expect={
  poll(fn,{timeout=5000}={}){return {async toBe(wanted){
   const deadline=now+timeout;let polls=0;
   while(true){
    const value=await fn();
    // Playwright's outer polling deadline can expire during selector transport.
    if(now>deadline)throw Error('readiness timeout during sample transport');
    if(Object.is(value,wanted))return;
    const delay=[100,250,500,1000][Math.min(polls++,3)];
    if(now+delay>deadline)throw Error('readiness timeout while transform remains unsettled');
    now+=delay;
   }
  }};}
 };
 const stable=runInNewContext(body+';stable',{expect});
 return {run:()=>stable(page),get now(){return now;},get lookups(){return lookups;},get frames(){return frames;}};
}

test('readiness accepts an already settled dialog after the original two frame gate',async()=>{
 const h=harness();await h.run();assert.equal(h.frames,2);
});
test('readiness waits for actual JavaScript transform settlement',async()=>{
 const h=harness({settlesAt:400});await h.run();assert.ok(h.now>=400 && h.now<=1012);
});
test('readiness observes settlement when a later locator lookup outlasts the original poll budget',async()=>{
 const h=harness({settlesAt:400,lookupDelays:[166,1111]});await h.run();assert.ok(h.now>=400 && h.now<=1012);
});
test('readiness observes settlement when the first locator lookup outlasts the original poll budget',async()=>{
 const h=harness({settlesAt:400,lookupDelays:[1111]});await h.run();assert.ok(h.now>=400 && h.now<=1012);
});
test('readiness still rejects a permanently translated dialog within its original budget',async()=>{
 const h=harness({settlesAt:Infinity});await assert.rejects(h.run(),/readiness timeout/);
});
test('readiness still rejects a permanently scaled dialog within its original budget',async()=>{
 const h=harness({settlesAt:Infinity,transform:'matrix(0.99, 0, 0, 0.99, 0, 0)'});await assert.rejects(h.run(),/readiness timeout/);
});
test('readiness retains the original finite animation gate before transform sampling',async()=>{
 const h=harness({animationUntil:300});await h.run();assert.ok(h.now>=300);assert.equal(h.frames,2);
});
test('readiness keeps the approved subpixel identity tolerance',async()=>{
 const h=harness({settlesAt:Infinity,transform:'matrix(0.9995, 0, 0, 0.9995, 0, 0.05)'});await h.run();
});

