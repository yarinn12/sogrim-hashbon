import test from 'node:test';
import assert from 'node:assert/strict';
import {localQaNavigationReady} from '../e2e/helpers/localQaNavigationReady.mjs';

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function pageModel({holdNavigationSignal=false,holdUi=false,navigationError,uiError}={}) {
  const navigation=deferred(),ui=deferred(),calls=[];if(!holdNavigationSignal)navigation.resolve();if(!holdUi)ui.resolve();
  return {navigation,ui,calls,async openHome(_page,options){calls.push(options);if(navigationError)throw navigationError;},page:{
    async goto(){if(navigationError)throw navigationError;await navigation.promise;},
    locator(){return {async waitFor(){if(uiError)throw uiError;await ui.promise;}};}
  }};
}
test('local navigation reaches required UI without awaiting a stalled navigation API signal',async()=>{
  const h=pageModel({holdNavigationSignal:true});let ready=false;const result=localQaNavigationReady(h.page,'/?scenario=ready','.required',{openHome:h.openHome}).then(()=>{ready=true;});
  try{await tick();assert.equal(ready,true);assert.deepEqual(h.calls,[{path:'/?scenario=ready',readyTimeoutMs:8000}]);}
  finally{h.navigation.resolve();await result;}
});
test('DOM readiness cannot bypass a required destination that is still absent',async()=>{
  const h=pageModel({holdUi:true});let ready=false;const result=localQaNavigationReady(h.page,'/','.required',{openHome:h.openHome}).then(()=>{ready=true;});
  await tick();assert.equal(ready,false);h.ui.resolve();await result;assert.equal(ready,true);
});
test('local navigation preserves a failed document or module navigation',async()=>{
  const error=new Error('synthetic required navigation failure');const h=pageModel({navigationError:error});
  await assert.rejects(localQaNavigationReady(h.page,'/','.required',{openHome:h.openHome}),e=>e===error);
});
test('local navigation preserves a failed destination readiness check',async()=>{
  const error=new Error('synthetic destination missing');const h=pageModel({uiError:error});
  await assert.rejects(localQaNavigationReady(h.page,'/','.required',{openHome:h.openHome}),e=>e===error);
});
