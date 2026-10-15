import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { refreshPersonalPinsSnapshot } from "../e2e/helpers/personalPinsCloudRefresh.mjs";
const options={origin:"https://personal-pins-qa.supabase.co",space:"personal-pins-cloud-space-owner",updatedAt:"2026-10-15T07:00:00.000Z"};
const url=`${options.origin}/rest/v1/app_snapshots?id=eq.${options.space}`;
function deferred(){let resolve;const promise=new Promise(a=>{resolve=a;});return{promise,resolve};}
function fixture(){
 const accepted=deferred(),body=deferred();let match;
 const rows=[{id:options.space,updated_at:options.updatedAt,state:{events:[]}}];
 const page={waitForResponse(predicate){match=predicate;return accepted.promise;},bringToFront:async()=>{}};
 const response=(href=url,method="GET",payload=rows)=>({url:()=>href,request:()=>({method:()=>method}),ok:()=>true,status:()=>200,json:async()=>payload,finished:()=>body.promise});
 return{page,accepted,body,response,rows,matches:(...args)=>match(response(...args)),matchesResponse:value=>match(value)};
}
test('live refresh awaits the delivered expected snapshot and complete body',async()=>{
 const f=fixture();let done=false;const pending=refreshPersonalPinsSnapshot(f.page,options).then(()=>{done=true;});
 await new Promise(setImmediate);assert.equal(done,false);
 f.accepted.resolve(f.response());await new Promise(setImmediate);assert.equal(done,false);
 f.body.resolve(null);await pending;assert.equal(done,true);
});
test('metadata, old revisions, wrong accounts and writes cannot acknowledge incoming state',async()=>{
 const f=fixture();const pending=refreshPersonalPinsSnapshot(f.page,options);
 assert.equal(await f.matches(),true);
 for(const [href,method,payload] of [[url,'GET',[{id:options.space,updated_at:options.updatedAt}]],
  [url,'GET',[{...f.rows[0],updated_at:'old'}]],[url,'GET',[{...f.rows[0],id:'other'}]],
  [url.replace(options.origin,'https://other.example'),'GET',f.rows],[url,'PATCH',f.rows],
  [url.replace(options.space,'other'),'GET',f.rows]])assert.equal(await f.matches(href,method,payload),false);
 f.accepted.resolve(f.response());f.body.resolve(null);await pending;
});
test('a failed full snapshot response cannot satisfy refresh',async()=>{
 const f=fixture();const pending=refreshPersonalPinsSnapshot(f.page,options);
 await assert.rejects(f.matchesResponse({...f.response(),ok:()=>false,status:()=>503}),/503/);
 f.accepted.resolve(f.response());f.body.resolve(null);await pending;
});
test('body cancellation remains a failure rather than a refresh acknowledgement',async()=>{
 const f=fixture();const pending=refreshPersonalPinsSnapshot(f.page,options);
 f.accepted.resolve(f.response());f.body.resolve(new Error('Load request cancelled'));await assert.rejects(pending,/Load request cancelled/);
});
test('foreground failures prevent a successful refresh receipt',async()=>{
 const f=fixture();f.page.bringToFront=async()=>{throw new Error('foreground failed');};
 await assert.rejects(refreshPersonalPinsSnapshot(f.page,options),/foreground failed/);
});
test('only the incoming-change case uses live refresh and reload persistence stays present',async()=>{
 const fixture=await readFile(new URL('../e2e/helpers/personalPinsCloud.mjs',import.meta.url),'utf8');
 assert.match(fixture,/refresh: \(\) => refreshPersonalPinsSnapshot\(page, \{ origin, space, updatedAt: current\.updated_at \}\)/);
 assert.match(fixture,/reload: \(\) => errorMonitor\.withReload\(\(\) => page\.reload\(\)\)/);
});
