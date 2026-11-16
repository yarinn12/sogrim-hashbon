import test from 'node:test';
import assert from 'node:assert/strict';
import {createPointerRenderRecovery} from '../src/ui/pointerRenderRecovery.mjs';

const down=(extra={})=>({isPrimary:true,isTrusted:true,pointerType:'mouse',button:0,buttons:1,pointerId:3,clientX:50,clientY:70,...extra});
function harness({inside=false,allowed=true}={}){
  const context={},captures=[],releases=[];
  let held=false,permitted=allowed;
  const target={isConnected:true,
    getBoundingClientRect(){return{left:20,top:inside?48:140,right:110,bottom:inside?92:184,width:90,height:44};},
    setPointerCapture(id){captures.push(id);held=true;},
    hasPointerCapture(id){return held&&id===3;},
    releasePointerCapture(id){releases.push(id);held=false;},
    click(){throw Error('Connected button must use the native click, never replay');}};
  const recovery=createPointerRenderRecovery({resolveTarget:()=>null,resolveRenderTarget:scope=>scope===context&&permitted?target:null});
  return{target,context,recovery,captures,releases,revoke(){permitted=false;},loseCapture(){held=false;}};
}

test('a real mouse down assigned before a connected button moved keeps its native release target',()=>{
  const h=harness();h.recovery.start(down(),h.target,h.context);
  assert.deepEqual(h.captures,[3]);
  assert.equal(h.recovery.finish(down({buttons:0})),false);
  assert.equal(h.recovery.consumeCompatibilityClick({detail:1,button:0}),false);
});
for(const [name,fields]of[['inside',{}],['untrusted',{isTrusted:false}],['touch',{pointerType:'touch'}],['pen',{pointerType:'pen'}],['secondary',{isPrimary:false}],['not pressed',{buttons:0}]])
test('ordinary or unsupported input does not acquire exceptional mouse capture: '+name,()=>{
  const h=harness({inside:name==='inside'});h.recovery.start(down(fields),h.target,h.context);
  assert.deepEqual(h.captures,[]);
});
for(const reason of ['movement','release movement','permission changed','pointer cancel','blur','multitouch'])
test('a captured connected press rejects '+reason+' and consumes its pointer click',()=>{
  const h=harness();h.recovery.start(down(),h.target,h.context);assert.deepEqual(h.captures,[3]);
  if(reason==='movement'){h.recovery.move(down({clientX:80}));h.recovery.move(down());}
  if(reason==='permission changed')h.revoke();
  if(reason==='pointer cancel')h.recovery.cancel(down());
  if(reason==='blur')h.recovery.cancel();
  if(reason==='multitouch')h.recovery.start(down({isPrimary:false,pointerId:4}),null,null);
  assert.equal(h.recovery.finish(down(reason==='release movement'?{clientY:100,buttons:0}:{buttons:0})),false);
  assert.equal(h.recovery.consumeCompatibilityClick({detail:1,button:0}),true);
  assert.equal(h.recovery.consumeCompatibilityClick({detail:0,button:0}),false);
});
test('cancelling releases only the owned native capture',()=>{
  const h=harness();h.recovery.start(down(),h.target,h.context);
  h.recovery.cancel(down({pointerId:4}));assert.deepEqual(h.releases,[]);
  h.recovery.cancel(down());assert.deepEqual(h.releases,[3]);
});
test('a new primary press releases the previous exceptional capture',()=>{
  const h=harness();h.recovery.start(down(),h.target,h.context);
  h.recovery.start(down(),null,null);assert.deepEqual(h.releases,[3]);
  assert.equal(h.recovery.consumeCompatibilityClick({detail:1,button:0}),false);
});
test('a changed authorization at down does not acquire native capture',()=>{
  const h=harness({allowed:false});h.recovery.start(down(),h.target,h.context);
  assert.deepEqual(h.captures,[]);
});
test('lost native capture cannot authorize a later pointer click',()=>{
  const h=harness();h.recovery.start(down(),h.target,h.context);h.loseCapture();
  assert.equal(h.recovery.finish(down({buttons:0})),false);
  assert.equal(h.recovery.consumeCompatibilityClick({detail:1,button:0}),true);
});
test('an additional mouse button cancels the previously owned capture',()=>{
  const h=harness();h.recovery.start(down(),h.target,h.context);
  h.recovery.start(down({button:2,buttons:3}),h.target,h.context);
  assert.deepEqual(h.releases,[3]);
  assert.equal(h.recovery.consumeCompatibilityClick({detail:1,button:0}),true);
});
test('missing native capture support preserves ordinary input behavior',()=>{
  const h=harness();delete h.target.setPointerCapture;
  h.recovery.start(down(),h.target,h.context);
  assert.deepEqual(h.captures,[]);
  assert.equal(h.recovery.finish(down({buttons:0})),false);
  assert.equal(h.recovery.consumeCompatibilityClick({detail:1,button:0}),false);
});
