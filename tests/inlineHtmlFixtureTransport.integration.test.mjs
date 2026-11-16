import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {request as playwrightRequest} from '@playwright/test';
import {readLocalQaHtmlFresh} from '../e2e/helpers/readLocalQaHtmlFresh.mjs';

const cases=[['preflight','ios-qa-journey-preflight.spec.mjs','homeOrigin','/?review=1'],['signed-in reload','iphone-google-session.spec.mjs','pwa_release=403','/?pwa_release=403'],['video failure','startup-splash.spec.mjs','new URL("/"','/']];
const video='src="./assets/sogrim-heshbon-loading-loop-v2.mp4"';
const html='<!doctype html><html><head><title>מקור הדמה</title></head><body><video '+video+'></video><main>original content</main></body></html>';

function actualCallback(file,marker,baseURL){
  const source=readFileSync(new URL('../e2e/'+file,import.meta.url),'utf8');
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),matches=[];
  function visit(node){
    if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name?.text==='route'&&node.arguments.length>=2&&node.arguments[0].getText(ast).includes(marker))matches.push(node.arguments[1]);
    ts.forEachChild(node,visit);
  }visit(ast);assert.equal(matches.length,1,'select exactly the original root-document route');
  const scope={URL,readLocalQaHtmlFresh,baseURL,documentResponses:0,documentVideoBlocked:false,blockedVideoSource:'data:video/mp4;base64,AA==',testInfo:{project:{use:{baseURL}}}};
  return{callback:runInNewContext('('+matches[0].getText(ast)+')',scope),scope};
}

async function fixture(t,{rejectReuse=false,status=200}={}){
  const uses=new WeakMap(),calls=[];const server=createServer((req,res)=>{
    const use=(uses.get(req.socket)||0)+1;uses.set(req.socket,use);calls.push({method:req.method,path:req.url,use});
    if(rejectReuse&&use>1){req.socket.destroy();return;}
    if(req.url==='/prime'){res.end('warm');return;}
    res.writeHead(status,{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'self'",'referrer-policy':'no-referrer','content-length':Buffer.byteLength(html)});res.end(html);
  });server.keepAliveTimeout=30000;await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const baseURL='http://127.0.0.1:'+server.address().port,client=await playwrightRequest.newContext({baseURL});
  t.after(async()=>{await client.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  return{baseURL,client,calls};
}

for(const[name,file,marker,path]of cases){
  test(name+' actual document route uses a fresh socket and preserves its original HTML mutation',async t=>{
    const f=await fixture(t,{rejectReuse:true});await f.client.get('/prime');const{callback,scope}=actualCallback(file,marker,f.baseURL),url=f.baseURL+path,received=[];
    const route={request:()=>({url:()=>url}),fetch:()=>f.client.get(url),fulfill:async value=>{received.push(value);}};
    await callback(route);if(name==='signed-in reload')await callback(route);
    for(const response of received){assert.equal(response.status,200);assert.equal(response.response,undefined);assert.equal(response.headers['content-security-policy'],"default-src 'self'");assert.equal(response.headers['referrer-policy'],'no-referrer');assert.equal(response.headers['content-length'],undefined);}
    const body=Buffer.isBuffer(received.at(-1).body)?received.at(-1).body.toString('utf8'):received.at(-1).body;
    const expected=name==='preflight'?html.replace('</body>','<script defer src="/__qa_held_preflight_defer.js"></script></body>'):name==='signed-in reload'?html.replace('</body>','<img src="/__qa_held_signed_in_image__" alt=""></body>'):html.replace(video,'src="data:video/mp4;base64,AA=="');
    assert.equal(body,expected);if(name==='signed-in reload')assert.equal(scope.documentResponses,2);if(name==='video failure')assert.equal(scope.documentVideoBlocked,true);
    assert.equal(f.calls.length,name==='signed-in reload'?3:2);assert.ok(f.calls.every(c=>c.use===1));assert.ok(f.calls.slice(1).every(c=>c.path===path&&c.method==='GET'));
  });
  test(name+' actual document route stops on HTTP503 before fulfilling HTML',async t=>{
    const f=await fixture(t,{status:503});const{callback}=actualCallback(file,marker,f.baseURL);let fulfilled=false;const url=f.baseURL+path;
    await assert.rejects(callback({request:()=>({url:()=>url}),fetch:()=>f.client.get(url),fulfill:async()=>{fulfilled=true;}}),/HTTP 503/);assert.equal(fulfilled,false);assert.equal(f.calls.length,1);
  });
}
