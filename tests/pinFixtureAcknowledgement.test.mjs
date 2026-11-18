import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';

// Run the actual fixture action without importing Playwright's test registry.
const source=readFileSync(new URL('../e2e/pinned-events.spec.mjs',import.meta.url),'utf8');
const definition=name=>{
  const match=source.match(new RegExp('^async function '+name+'\\([^]*?^}', 'm'));
  assert(match,'Missing real fixture function '+name);return match[0];
};
function harness(){
  let release,assertions=0,activated=false;
  const gate=new Promise(resolve=>{release=()=>{activated=true;resolve();};});
  const expect=()=>({async toHaveAttribute(){},async toHaveCount(){
    assertions++;
    if(!activated)await Promise.race([gate,delay(8).then(()=>{throw new Error('UI acknowledgement deadline began while the test still blocked its request');})]);
  }});
  const acknowledge=source.includes('async function assertPinAcknowledged(')?definition('assertPinAcknowledged'):'';
  const pin=Function('menu','expect','pinButton','row',acknowledge+'\nreturn ('+definition('pin')+');')(
    async()=>{},expect,()=>({async click(){}}),()=>({locator(){return {};}}));
  return {pin,gate,release,assertions:()=>assertions,page:{locator(){return {};}}};
}
test('a deliberately held conditional pin write starts UI acknowledgement checks after release',async()=>{
  const h=harness();let failure;
  const action=h.pin(h.page,'event',true,{acknowledgementGate:h.gate}).catch(error=>{failure=error;});
  try{await delay(30);assert.equal(h.assertions(),0,'The held write has not been released');}
  finally{h.release();await action;}
  assert.ifError(failure);assert.equal(h.assertions(),2,'Both original UI conditions remain required');
});
test('ordinary pin actions still verify both original UI acknowledgement conditions',async()=>{
  const h=harness();h.release();await h.pin(h.page,'event',true);assert.equal(h.assertions(),2);
});
test('a failed acknowledgement gate propagates without beginning success assertions',async()=>{
  const h=harness(),error=new Error('synthetic held-request failure');
  const rejected=Promise.reject(error);rejected.catch(()=>{});
  h.release();await assert.rejects(h.pin(h.page,'event',true,{acknowledgementGate:rejected}),e=>e===error);assert.equal(h.assertions(),0);
});
