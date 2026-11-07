import test from 'node:test';
import assert from 'node:assert/strict';
import {alignPaintedTarget,paintedTargetIsReachable} from '../e2e/helpers/paintedTarget.mjs';

// A layout model, not a browser/device claim. Coordinates follow ancestor scroll
// positions; hidden panes and the fixed header/footer intercept real hit regions.
function layout(t,{menu=false,overflow='auto',grow=false,overlay=false,detach=false,glyph=true,fixedControl=false,documentScroll=false}={}) {
  const world={leading:fixedControl?0:500,scrollTop:0,scrollHeight:1800,windowY:documentScroll?500:0,scrollCalls:[],grown:false};
  const height=menu?300:360,width=568,header=menu?0:80,footer=menu?height:170;
  const rect=(x,y,w,h)=>({x,y,left:x,top:y,width:w,height:h,right:x+w,bottom:y+h,toJSON(){return{x,y,left:x,top:y,width:w,height:h,right:x+w,bottom:y+h}}});
  const html={overflow:documentScroll?'visible':'hidden',parentElement:null,clientTop:0,clientHeight:height,getBoundingClientRect:()=>rect(0,0,width,height)};
  const body={...html,parentElement:html};
  const pane={overflow:fixedControl?'visible':overflow,position:fixedControl?'fixed':'static',parentElement:body,clientTop:0,clientHeight:height,
    get scrollHeight(){return world.scrollHeight},get scrollTop(){return world.scrollTop},
    getBoundingClientRect:()=>rect(0,0,width,height),
    scrollBy({top}){
      world.scrollCalls.push(top);world.scrollTop=Math.max(0,Math.min(world.scrollHeight-height,world.scrollTop+top));
      if(grow&&!world.grown){world.grown=true;world.leading+=900;world.scrollHeight+=900;}
    }};
  const button={dataset:glyph?{action:'event-status-select'}:{},isConnected:true,parentElement:pane,
    getBoundingClientRect:()=>rect(fixedControl?width-100:0,world.leading-world.scrollTop,fixedControl?100:width,glyph?600:44),
    closest:selector=>menu&&selector==='.event-status-menu'?pane:null,
    querySelector:()=>arrow,contains:node=>node===button||node===arrow};
  const arrow={getBoundingClientRect:()=>rect(24,button.getBoundingClientRect().y+140,20,20)};
  const cover={};
  const values={innerHeight:height,getComputedStyle:node=>({overflowY:node.overflow||'visible',position:node.position||'static'}),
    window:{scrollBy({top}){if(documentScroll)world.windowY=Math.max(0,world.windowY+top)}},
    requestAnimationFrame:callback=>queueMicrotask(()=>{if(detach)button.isConnected=false;callback(0)}),
    document:{body,documentElement:html,scrollingElement:{scrollHeight:documentScroll?2000:height},
      querySelector:()=>({getBoundingClientRect:()=>rect(0,footer,width,height-footer)}),
      querySelectorAll:()=>menu?[]:[{getBoundingClientRect:()=>rect(0,0,80,header)}],
      elementFromPoint(x,y){
        const r=button.getBoundingClientRect();
        return !overlay&&x>=r.left&&x<=r.right&&y>=r.top&&(x>=80||y>=header)&&y<=Math.min(footer,r.bottom)?button:cover;
      }}};
  const previous=new Map(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const[key,value]of Object.entries(values))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
  t.after(()=>{for(const[key,descriptor]of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]});
  return{world,button};
}

test('a tall row glyph is physically reachable in a nested scroller below fixed controls',async t=>{
  const{world,button}=layout(t);const sample=await alignPaintedTarget(button);
  assert.equal(paintedTargetIsReachable(sample,43.99),true);assert.equal(world.windowY,0);
  assert.ok(world.scrollTop>0);assert.ok(sample.targetTop>=80);assert.ok(sample.targetBottom<=170);
});
test('a fixed menu corrects its own scroll after content grows during the first scroll',async t=>{
  const{world,button}=layout(t,{menu:true,grow:true,glyph:false});const sample=await alignPaintedTarget(button);
  assert.equal(world.grown,true);assert.equal(paintedTargetIsReachable(sample,43.99),true);
  assert.equal(world.windowY,0);assert.ok(world.scrollCalls.length>=2);assert.ok(sample.targetBottom<=300);
});
test('overflow hidden does not become a fake user-scrollable pane',async t=>{
  const{world,button}=layout(t,{menu:true,overflow:'hidden',glyph:false});const sample=await alignPaintedTarget(button);
  assert.equal(paintedTargetIsReachable(sample,43.99),false);assert.deepEqual(world.scrollCalls,[]);assert.equal(world.scrollTop,0);
});
test('a persistent overlay cannot be converted to a reachable target',async t=>{
  const{button}=layout(t,{overlay:true});const sample=await alignPaintedTarget(button);
  assert.equal(sample.hit,false);assert.equal(paintedTargetIsReachable(sample,43.99),false);
});
test('a detached node supplies no stale click coordinates',async t=>{
  const{button}=layout(t,{detach:true});const sample=await alignPaintedTarget(button);
  assert.deepEqual(sample,{attached:false});assert.equal(paintedTargetIsReachable(sample,43.99),false);
});
test('an event action with a missing glyph fails instead of clicking the row midpoint',async t=>{
  const{button}=layout(t);button.querySelector=()=>null;const sample=await alignPaintedTarget(button);
  assert.deepEqual(sample,{attached:true,missingGlyph:true});assert.equal(paintedTargetIsReachable(sample,43.99),false);
});
test('a visible top-right control is not blocked by unrelated controls on the left',async t=>{
  const{button}=layout(t,{fixedControl:true,glyph:false});
  const sample=await alignPaintedTarget(button);
  assert.equal(sample.hit,true);assert.equal(paintedTargetIsReachable(sample,43.99),true);
});
test('reaching a fixed control does not scroll the background document',async t=>{
  const{world,button}=layout(t,{fixedControl:true,glyph:false,documentScroll:true});
  const sample=await alignPaintedTarget(button);
  assert.equal(world.windowY,500);assert.equal(paintedTargetIsReachable(sample,43.99),true);
});
