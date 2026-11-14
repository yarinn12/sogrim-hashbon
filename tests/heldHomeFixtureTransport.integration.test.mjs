import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {request as playwrightRequest} from '@playwright/test';
import {holdNonessentialHomeImage} from '../e2e/helpers/heldHomeImage.mjs';
import {holdNonessentialHomeDefer} from '../e2e/helpers/heldHomeDefer.mjs';
import {requireHeldHomeReadiness} from '../e2e/helpers/heldHomeReadinessControl.mjs';

const cases=[
  ['image',async(page,baseURL)=>{const gate=await holdNonessentialHomeImage(page,baseURL);return()=>gate.release();}],
  ['defer',async(page,baseURL)=>{const gate=await holdNonessentialHomeDefer(page,baseURL);return()=>gate.release();}],
  ['readiness-control',async(page,baseURL)=>{
    let before,after;requireHeldHomeReadiness({beforeEach:fn=>{before=fn;},afterEach:fn=>{after=fn;}});
    await before({page,baseURL},{title:'synthetic held resource'});
    return()=>after({page},{status:'passed'});
  }]
];
const html='<!doctype html><html><head><title>מקור הדמה</title></head><body><main>unchanged document</main></body></html>';

async function fixture(t,{rejectReuse=false,status=200}={}) {
  const calls=[],uses=new WeakMap();
  const server=createServer((incoming,response)=>{
    const use=(uses.get(incoming.socket)||0)+1;uses.set(incoming.socket,use);calls.push({method:incoming.method,path:incoming.url,use});
    if(rejectReuse&&use>1){incoming.socket.destroy();return;}
    if(incoming.url==='/prime'){response.end('warm');return;}
    response.writeHead(status,{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'self'",'referrer-policy':'no-referrer','content-length':Buffer.byteLength(html)});response.end(html);
  });
  server.keepAliveTimeout=30_000;await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const baseURL='http://127.0.0.1:'+server.address().port,client=await playwrightRequest.newContext({baseURL});
  t.after(async()=>{await client.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const routes=[],page={route:async(matcher,handler)=>{routes.push({matcher,handler});},addInitScript:async()=>{}};
  const url=baseURL+'/?review=1&requests=accepted&reward=inactive&dynamic-type-preview=32';
  let fulfilled;
  const route={request:()=>({url:()=>url}),fetch:()=>client.get(url),fulfill:async value=>{fulfilled=value;}};
  return{baseURL,client,calls,page,routes,url,route,get fulfilled(){return fulfilled;}};
}

for(const[name,install]of cases){
  test(name+' reads the original HTML on a fresh socket and retains the held-resource gate',async t=>{
    const f=await fixture(t,{rejectReuse:true});assert.equal((await f.client.get('/prime')).status(),200);
    const release=await install(f.page,f.baseURL);
    const root=f.routes.find(r=>typeof r.matcher==='function'&&r.matcher(new URL(f.url)));assert.ok(root);
    // This is the real registered route callback. OLD reaches the primed
    // Playwright connection, which the controlled server deliberately rejects.
    await root.handler(f.route);
    const response=f.fulfilled;assert.equal(response.status,200);assert.equal(response.response,undefined);
    assert.equal(response.headers['content-security-policy'],"default-src 'self'");assert.equal(response.headers['referrer-policy'],'no-referrer');
    assert.equal(response.headers['content-length'],undefined);assert.equal(response.headers.connection,undefined);
    const body=Buffer.isBuffer(response.body)?response.body.toString('utf8'):response.body;
    const injected=name==='image'?'<img src="/__qa_held_nonessential_image" alt="" hidden>':body.match(/<script defer src="[^"]+"><\/script>/)?.[0];assert.ok(injected);
    assert.equal(body,html.replace('</body>',injected+'</body>'));
    const path=name==='image'?'/__qa_held_nonessential_image':injected.match(/src="([^"]+)"/)[1];
    const asset=f.routes.find(r=>typeof r.matcher==='string'&&r.matcher===f.baseURL+path);assert.ok(asset);
    let assetFulfilled=false;const held=asset.handler({fulfill:async()=>{assetFulfilled=true;}});
    await Promise.resolve();assert.equal(assetFulfilled,false,'original nonessential resource remains blocked');
    await release();await held;assert.equal(assetFulfilled,true);
    assert.deepEqual(f.calls,[{method:'GET',path:'/prime',use:1},{method:'GET',path:new URL(f.url).pathname+new URL(f.url).search,use:1}]);
  });
  test(name+' rejects a real HTTP failure before fulfilling a replacement document',async t=>{
    const f=await fixture(t,{status:503});await install(f.page,f.baseURL);
    const root=f.routes.find(r=>typeof r.matcher==='function'&&r.matcher(new URL(f.url)));
    await assert.rejects(root.handler(f.route),/HTTP 503/);assert.equal(f.fulfilled,undefined);assert.equal(f.calls.length,1);
  });
}
