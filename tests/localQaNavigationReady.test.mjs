import test from 'node:test';
import assert from 'node:assert/strict';
import {localQaNavigationReady} from '../e2e/helpers/localQaNavigationReady.mjs';

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function pageModel({holdImage=false,holdUi=false,navigationError,uiError}={}) {
  const image=deferred(),ui=deferred();if(!holdImage)image.resolve();if(!holdUi)ui.resolve();
  return {image,ui,page:{
    async goto(_url,options){if(navigationError)throw navigationError;if(options?.waitUntil!=='domcontentloaded')await image.promise;},
    locator(){return {async waitFor(){if(uiError)throw uiError;await ui.promise;}};}
  }};
}
test('local navigation finishes on required UI while an optional image still holds window load',async()=>{
  const h=pageModel({holdImage:true});let ready=false;const result=localQaNavigationReady(h.page).then(()=>{ready=true;});
  try{await tick();assert.equal(ready,true);}finally{h.image.resolve();await result;}
});
test('DOM readiness cannot bypass a required destination that is still absent',async()=>{
  const h=pageModel({holdUi:true});let ready=false;const result=localQaNavigationReady(h.page).then(()=>{ready=true;});
  await tick();assert.equal(ready,false);h.ui.resolve();await result;assert.equal(ready,true);
});
test('local navigation preserves a failed document or module navigation',async()=>{
  const error=new Error('synthetic required navigation failure');const h=pageModel({navigationError:error});
  await assert.rejects(localQaNavigationReady(h.page),e=>e===error);
});
test('local navigation preserves a failed destination readiness check',async()=>{
  const error=new Error('synthetic destination missing');const h=pageModel({uiError:error});
  await assert.rejects(localQaNavigationReady(h.page),e=>e===error);
});
