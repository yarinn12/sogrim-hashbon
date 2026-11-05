import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {
  refreshAccountSession, loadAccountUser, ensureAccountWorkspace, saveAccountSession,
  activateAccountWorkspace, clearAccountWorkspace, clearAccountSession, ACCOUNT_SESSION_STORAGE_KEY
} from '../src/data/accountAuth.mjs';
import {isTransientAccountError} from '../src/domain/accountErrors.mjs';

const source=readFileSync(new URL('../src/publicAccountAuthLayer.mjs',import.meta.url),'utf8');
function body(start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>0&&b>a);return source.slice(a,b);}
const actual=[
 body('async function restoreAccountSession(', 'function clearPreviousAccountAfterSwitch('),
 body('function clearPreviousAccountAfterSwitch(', 'function accountProfileNeedsCompletion('),
 body('async function reconcileResumedAccountSession(', 'function lockForAccountSessionChange('),
 body('function refreshActiveAccountSession(', 'function setAuthBusy('),
 body('function isUnauthorizedAccountError(', 'function rememberAccountReturnUrl('),
 body('function isExpiring(', 'function scheduleAccountSessionRefresh(')
].join('\n');
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const userFor=(id='a',missing=false)=>({
 id:'startup-user-'+id,email:id+'@startup.example.test',
 user_metadata:{full_name:'Startup User '+id,username:'startup_user_'+id,
  ...(missing?{}:{account_space_id:'startup-space-'+id,account_space_key:'abcdefghijklmnopqrstuvwxyz_123456'})}
});
const sessionFor=(id='a',login='old',expired=true,missing=false)=>({
 user:userFor(id,missing),access_token:'startup-'+login+'-access-'+id,
 refresh_token:'startup-'+login+'-refresh-'+id,expires_at:expired?1:Math.floor(Date.now()/1000)+3600
});

function harness(options={}){
 const initial=sessionFor('a','old',options.expired!==false,options.missingWorkspace);
 const values=new Map(),writes=[],rotations=[],requests=[],pending=[];
 const gates=Object.fromEntries(['user','workspace','update','token','secondToken'].map(k=>[k,deferred()]));
 const seen=Object.fromEntries(Object.keys(gates).map(k=>[k,deferred()]));
 const storage={getItem:k=>values.get(k)??null,setItem(k,v){values.set(k,String(v));writes.push([k,String(v)]);},
  removeItem(k){values.delete(k);writes.push([k,null]);}};
 const config={storage:{mode:'supabase',url:'https://startup-auth.example.test',anonKey:'synthetic-public-key',table:'app_snapshots'}};
 const users=new Map([[initial.access_token,initial.user]]),used=new Set();
 const bearer=options=>Object.entries(options.headers??{}).find(([k])=>k.toLowerCase()==='authorization')?.[1]?.replace(/^Bearer /,'');
 const transport=async(url,request={} )=>{
  const parsed=new URL(url);
  assert.equal(parsed.origin,config.storage.url,'synthetic transport must never reach a foreign service');
  requests.push({path:parsed.pathname,method:request.method,token:bearer(request),body:request.body?JSON.parse(request.body):null});
  if(parsed.pathname==='/auth/v1/token'){
   const token=JSON.parse(request.body).refresh_token;rotations.push(token);seen.token.resolve();
   if(rotations.length===2){seen.secondToken.resolve();if(options.holdSecondToken)await gates.secondToken.promise;}
   if(options.holdToken&&rotations.length===1)await gates.token.promise;
   if(used.has(token))return Response.json({code:'refresh_token_already_used',msg:'Synthetic old token was already rotated'},{status:400});
   used.add(token);
   const id=token.endsWith('-b')?'b':'a',user=userFor(id,options.missingWorkspace&&id==='a');
   const suffix=token.includes('login2')?'login2':id;
   const access='startup-new-access-'+suffix;users.set(access,user);
   return Response.json({access_token:access,refresh_token:'startup-new-refresh-'+suffix,expires_in:3600,user});
  }
  if(parsed.pathname==='/auth/v1/user'){
   const user=options.mismatchedUser?userFor('b'):(users.get(bearer(request))??initial.user);
   if(request.method==='PUT'){
    seen.update.resolve();if(options.holdUpdate)await gates.update.promise;
    return Response.json({...user,user_metadata:{...user.user_metadata,...JSON.parse(request.body).data}});
   }
   seen.user.resolve();if(options.holdUser!==false)await gates.user.promise;
   return options.userStatus?Response.json({message:'Synthetic user response'},{status:options.userStatus}):Response.json(user);
  }
  if(parsed.pathname==='/rest/v1/rpc/ensure_account_workspace'){
   seen.workspace.resolve();if(options.holdWorkspace)await gates.workspace.promise;
   return options.workspaceStatus?Response.json({message:'Synthetic workspace response'},{status:options.workspaceStatus}):Response.json({status:'existing'});
  }
  throw new Error('Unexpected synthetic auth request '+parsed.pathname);
 };
 saveAccountSession(initial,storage);
 if(!options.missingWorkspace)activateAccountWorkspace({id:'startup-space-a',key:'abcdefghijklmnopqrstuvwxyz_123456'},{storage});
 storage.setItem('synthetic-outbox-a','pending-a-revision-1');
 storage.setItem('synthetic-outbox-b','pending-b-revision-2');
 writes.length=0;
 const effects={schedules:0,clears:0,publications:0,events:0,locks:0,localClears:0,workspaceClears:0,reentrant:[]};
 const context=vm.createContext({accountSession:initial,accountRefreshGeneration:0,accountRefreshPromise:null,accountRefreshOwner:null,runtimeConfig:config,
  STARTUP_ACCOUNT_REQUEST_TIMEOUT_MS:2500,ACCOUNT_REFRESH_RETRY_MS:60000,
  fetch:transport,refreshAccountSession:(cfg,session,fetchImpl,requestOptions)=>refreshAccountSession(cfg,session,fetchImpl??transport,requestOptions),
  loadAccountUser,ensureAccountWorkspace:(cfg,session,requestOptions)=>ensureAccountWorkspace(cfg,session,{...requestOptions,fetchImpl:transport,storage}),
  saveAccountSession:session=>saveAccountSession(session,storage),
  clearAccountSession:()=>{effects.clears++;clearAccountSession(storage);},
  clearAccountWorkspace:user=>{effects.workspaceClears++;clearAccountWorkspace(user,storage);},
  clearLocalAccountData:()=>{effects.localClears++;},getActiveCloudSpaceId:()=> 'startup-space-a',
  clearAccountRecoverySession:()=>{},lockForAccountSessionChange:()=>{effects.locks++;context.accountSession=null;context.accountRefreshGeneration++;},
  scheduleAccountSessionRefresh:()=>effects.schedules++,publishAccountSessionSync:()=>effects.publications++,
  document:{dispatchEvent:()=>{
   effects.events++;
   if(options.reentrantRefresh)effects.reentrant.push(context.refreshActiveAccountSession());
  }},Event:class{},isTransientAccountError});
 vm.runInContext(actual,context);
 const track=p=>{pending.push(p);return p;};
 const replace=(replacement)=>{
  context.accountRefreshGeneration++;
  context.accountSession=replacement;
  if(replacement){
   saveAccountSession(replacement,storage);users.set(replacement.access_token,replacement.user);
   const m=replacement.user.user_metadata;activateAccountWorkspace({id:m.account_space_id,key:m.account_space_key},{storage});
  }else{clearAccountSession(storage);clearAccountWorkspace(initial.user,storage);}
  writes.length=0;
 };
 return {context,initial,rotations,requests,seen,gates,values,writes,effects,storage,config,replace,track,
  restore:()=>track(context.reconcileResumedAccountSession(context.accountSession)),
  active:()=>track(context.refreshActiveAccountSession()),
  snapshot:()=>JSON.stringify([...values].sort(([a],[b])=>a.localeCompare(b))),
  release:()=>Object.values(gates).forEach(g=>g.resolve()),
  async close(){this.release();await Promise.allSettled(pending);}
 };
}

test('startup restoration and an active refresh share one rotation until the real user/workspace writes finish',async()=>{
 const h=harness();let active;
 try{
  const restoration=h.restore();await h.seen.user.promise;
  assert.deepEqual(h.rotations,['startup-old-refresh-a']);
  active=h.active();await tick();
  assert.equal(h.rotations.length,1,'a completed token POST must remain owned while /user and workspace are pending');
  h.gates.user.resolve();const [restored,refreshed]=await Promise.all([restoration,active]);
  assert.equal(restored.access_token,'startup-new-access-a');
  assert.equal(refreshed.access_token,'startup-new-access-a','the concurrent caller must await the adopted session');
  const saved=JSON.parse(h.values.get(ACCOUNT_SESSION_STORAGE_KEY));
  assert.equal(saved.refresh_token,'startup-new-refresh-a');assert.equal(saved.user.id,h.initial.user.id);
  assert.equal(h.effects.clears,0);assert.equal(h.effects.publications,1);assert.equal(h.effects.events,1);
  const rpc=h.requests.find(r=>r.path.endsWith('ensure_account_workspace'));
  assert.equal(rpc.token,saved.access_token);assert.equal(rpc.body.p_space_id,'startup-space-a');
 }finally{await h.close();}
});

test('workspace ACK remains part of the shared startup work',async()=>{
 const h=harness({holdUser:false,holdWorkspace:true});
 try{
  const restoration=h.restore();await h.seen.workspace.promise;
  const active=h.active();await tick();
  assert.equal(h.rotations.length,1);assert.equal(h.effects.publications,0);
  h.gates.workspace.resolve();const results=await Promise.all([restoration,active]);
  assert.ok(results.every(s=>s.refresh_token==='startup-new-refresh-a'));
  assert.equal(h.effects.publications,1);
 }finally{await h.close();}
});

for(const phase of ['user','workspace','update'])for(const boundary of ['logout','account switch','same-user new login']){
 test('late '+phase+' success after '+boundary+' cannot save, activate, publish or alter either outbox',async()=>{
  const h=harness({holdUser:phase==='user',holdWorkspace:phase==='workspace',holdUpdate:phase==='update',missingWorkspace:phase==='update'});
  try{
   const pending=h.restore();await h.seen[phase].promise;
   h.replace(boundary==='logout'?null:sessionFor(boundary==='account switch'?'b':'a','login2',false));
   const snapshot=h.snapshot();h.release();
   assert.equal(await pending,null);
   assert.equal(h.snapshot(),snapshot,'actual storage effects must remain owned');
   assert.deepEqual(h.writes,[]);assert.equal(h.effects.publications,0);assert.equal(h.effects.events,0);
   assert.equal(h.effects.localClears,0);assert.equal(h.effects.workspaceClears,0);
  }finally{await h.close();}
 });
}

test('stale restoration is rejected before clearing the previous account',async()=>{
 const h=harness({expired:false});
 try{
  const pending=h.track(h.context.restoreAccountSession(h.initial,{previousSession:sessionFor('b'),isCurrent:()=>h.context.accountSession===h.initial}));
  await h.seen.user.promise;h.replace(sessionFor('b','login2',false));const snapshot=h.snapshot();h.release();
  await assert.rejects(pending,{code:'STALE_ACCOUNT'});
  assert.equal(h.effects.localClears,0);assert.equal(h.effects.workspaceClears,0);assert.equal(h.snapshot(),snapshot);
 }finally{await h.close();}
});

test('an obsolete finally cannot clear a new generation refresh promise',async()=>{
 const h=harness({holdSecondToken:true});
 try{
  const old=h.restore();await h.seen.user.promise;
  h.replace(sessionFor('b','login2',true));const current=h.active();
  await h.seen.secondToken.promise;
  const owned=h.context.accountRefreshPromise;
  h.gates.user.resolve();assert.equal(await old,null);
  assert.strictEqual(h.context.accountRefreshPromise,owned);
  assert.strictEqual(h.context.refreshActiveAccountSession(),owned);
  assert.equal(h.rotations.length,2);
  h.gates.secondToken.resolve();assert.equal((await current).user.id,'startup-user-b');
  assert.equal(h.context.accountRefreshPromise,null);assert.equal(h.context.accountRefreshOwner,null);
 }finally{await h.close();}
});

test('a stale invocation cannot replace an active current-owner promise',async()=>{
 const h=harness({holdToken:true});
 try{
  const current=h.active();await h.seen.token.promise;const owned=h.context.accountRefreshPromise;
  assert.equal(await h.track(h.context.reconcileResumedAccountSession(sessionFor('b'))),null);
  assert.strictEqual(h.context.accountRefreshPromise,owned);
  h.gates.token.resolve();await current;assert.equal(h.rotations.length,1);
 }finally{await h.close();}
});

test('active-first overlap still validates user and workspace without another rotation',async()=>{
 const h=harness({holdToken:true,holdUser:false});
 try{
  const active=h.active();await h.seen.token.promise;const restoration=h.restore();
  h.gates.token.resolve();const results=await Promise.all([active,restoration]);
  assert.ok(results.every(s=>s.access_token==='startup-new-access-a'));assert.equal(h.rotations.length,1);
  assert.equal(h.requests.filter(r=>r.path==='/auth/v1/user').length,1);
  assert.equal(h.requests.filter(r=>r.path.endsWith('ensure_account_workspace')).length,1);
 }finally{await h.close();}
});

test('a synchronous refreshed-session listener joins the adopting owner',async()=>{
 const h=harness({holdUser:false,reentrantRefresh:true});
 try{await h.restore();await Promise.all(h.effects.reentrant);assert.equal(h.rotations.length,1);assert.equal(h.effects.events,1);}
 finally{await h.close();}
});

test('a returned different user cannot activate a workspace or replace the owning account',async()=>{
 const h=harness({holdUser:false,mismatchedUser:true});
 try{
  const snapshot=h.snapshot();assert.equal(await h.restore(),null);assert.equal(h.snapshot(),snapshot);
  assert.equal(h.requests.filter(r=>r.path.endsWith('ensure_account_workspace')).length,0);
  assert.equal(h.effects.clears,0);assert.equal(h.effects.publications,0);
 }finally{await h.close();}
});

test('a late old-account auth rejection cannot clear a new login',async()=>{
 const h=harness({userStatus:401});
 try{
  const pending=h.restore();await h.seen.user.promise;h.replace(sessionFor('b','login2',false));
  const snapshot=h.snapshot();h.release();assert.equal(await pending,null);
  assert.equal(h.snapshot(),snapshot);assert.equal(h.effects.clears,0);assert.equal(h.effects.locks,0);
 }finally{await h.close();}
});

test('legacy restoration without a guard retains its session/workspace side effects',async()=>{
 const h=harness({expired:false,holdUser:false});
 try{
  const result=await h.track(h.context.restoreAccountSession(h.initial));
  assert.equal(result.user.id,h.initial.user.id);assert.equal(JSON.parse(h.values.get(ACCOUNT_SESSION_STORAGE_KEY)).user.id,h.initial.user.id);
  assert.equal(h.rotations.length,0);assert.equal(h.requests.filter(r=>r.path.endsWith('ensure_account_workspace')).length,1);
 }finally{await h.close();}
});

test('legacy workspace repair without a guard still saves metadata and validates the workspace',async()=>{
 const h=harness({expired:false,holdUser:false,missingWorkspace:true});
 try{
  const result=await h.track(ensureAccountWorkspace(h.config,h.initial,{fetchImpl:h.context.fetch,storage:h.storage}));
  assert.ok(result.user.user_metadata.account_space_id);
  assert.equal(JSON.parse(h.values.get(ACCOUNT_SESSION_STORAGE_KEY)).user.user_metadata.account_space_id,result.user.user_metadata.account_space_id);
  assert.equal(h.requests.filter(r=>r.method==='PUT').length,1);
  assert.equal(h.requests.filter(r=>r.path.endsWith('ensure_account_workspace')).length,1);
 }finally{await h.close();}
});

test('workspace entry rejects an expired ownership guard before any request or storage change',async()=>{
 const h=harness({expired:false,holdUser:false,missingWorkspace:true});
 try{
  const snapshot=h.snapshot();
  await assert.rejects(ensureAccountWorkspace(h.config,h.initial,{fetchImpl:h.context.fetch,storage:h.storage,isCurrent:()=>false}),{code:'STALE_ACCOUNT'});
  assert.equal(h.snapshot(),snapshot);assert.equal(h.requests.length,0);
 }finally{await h.close();}
});

test('previous-account clearing independently enforces the optional guard',async()=>{
 const h=harness({expired:false,holdUser:false});
 try{
  const snapshot=h.snapshot();
  assert.throws(()=>h.context.clearPreviousAccountAfterSwitch(h.initial,sessionFor('b'),()=>false),{code:'STALE_ACCOUNT'});
  assert.equal(h.effects.localClears,0);assert.equal(h.effects.workspaceClears,0);assert.equal(h.snapshot(),snapshot);
 }finally{await h.close();}
});
