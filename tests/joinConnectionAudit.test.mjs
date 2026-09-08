import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {resolveEventInviteCredentials} from '../src/data/eventInvites.mjs';
import {mergeSharedEventIntoState} from '../src/data/sharedEventStore.mjs';
import {ensureNamedParticipant} from '../src/domain/userProfile.mjs';
import {isActiveEventParticipant} from '../src/domain/eventMembership.mjs';
import * as pending from '../src/data/pendingInvite.mjs';
import * as joins from '../src/data/pendingEventJoins.mjs';

const owner='00000000-0000-4000-8000-000000000096', participantId=`account-${owner}`;
const eventId='join-connection-audit', token='a'.repeat(64);
const inviteUrl=`https://example.invalid/i/${eventId}/t/${token}`;
const config={storage:{mode:'supabase',account:{userId:owner,accessToken:'synthetic'}}};
const profile={participantId,displayName:'Audit Member',username:'audit_member',authProvider:'google',authSubject:owner};
const initial=()=>({currentParticipantId:participantId,participants:[{id:participantId,displayName:profile.displayName,kind:'user'}],groups:[],events:[]});
const remote=()=>({...initial(),events:[{id:eventId,name:'Invited group',participantIds:[participantId],adminIds:[],expenses:[],transfers:[]}]});
const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};};
const app=readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8');
const auth=readFileSync(new URL('../src/publicAccountAuthLayer.mjs',import.meta.url),'utf8');

function connectionHarness({failure,forceReload=false}={}) {
  const storage=memory(),sessionStorage=memory(),writes=[],effects=[],requests=[];
  pending.rememberPendingInviteUrl(inviteUrl,sessionStorage,storage);
  let current=initial(),failed=Boolean(failure);
  const ctx=vm.createContext({runtimeConfig:config,accountSession:{user:{id:owner}},
    window:{location:{href:'https://example.invalid/',reload:()=>effects.push('reload')}},
    accountWorkspaceFromUser:()=>({id:'audit-workspace'}),activateAccountWorkspace:()=>true,
    loadRuntimeConfig:async()=>config,accountProfileFromUser:()=>profile,loadLocalProfile:()=>profile,
    normalizeProfileName:value=>value,isFullProfileName:()=>true,normalizeUsername:value=>value,
    setFriendUsername:async()=>{},STARTUP_ACCOUNT_REQUEST_TIMEOUT_MS:1000,EMPTY_ACCOUNT_CLOUD_WAIT_MS:0,
    pendingInviteUrl:()=>pending.pendingInviteUrl('https://example.invalid/',sessionStorage,storage),
    parseInviteEventId:value=>String(value).includes(eventId)?eventId:null,
    loadState:()=>structuredClone(current),loadSharedStateForStartup:async()=>({state:structuredClone(current)}),
    resolveEventInviteCredentials:(c,url,_fetch,options)=>resolveEventInviteCredentials(c,url,async(url,init)=>{
      requests.push({url,body:JSON.parse(init.body),headers:init.headers});
      if(failed)return new Response(JSON.stringify(failure.payload),{status:failure.status});
      return new Response(JSON.stringify({eventId,spaceId:'audit-invite-space',spaceKey:'synthetic_invite_space_key_000123456789'}));
    },options),
    readSharedEventState:async()=>remote(),mergeSharedEventIntoState,ensureNamedParticipant,
    normalizeAvatarImage:value=>value||'',normalizeProfileUpdatedAt:value=>value||'',resolveProfileAvatar:()=>({}),
    saveLocalProfile:()=>{},hasSharedStateChanged:(a,b)=>JSON.stringify(a)!==JSON.stringify(b),
    saveSharedState:async state=>{current=structuredClone(state);writes.push(current);return {ok:true,mode:'cloud'};},
    clearPendingInviteUrl:()=>pending.clearPendingInviteUrl(sessionStorage,storage),clearAccountReturnUrl:()=>effects.push('clear-return'),
    publishAccountSessionSync:()=>{},setSessionValue:()=>{},AUTH_CHANGED_MARKER:'changed',SKIP_NEXT_SPLASH_MARKER:'skip',GATE_ID:'gate',
    document:{getElementById:()=>null,querySelector:()=>null,documentElement:{classList:{remove(){}}}},
    markAccountAuthReady:()=>effects.push('ready'),deliverPendingAccountNotice:()=>{}
  });
  vm.runInContext(auth.slice(auth.indexOf('async function connectAccountToApp('),auth.indexOf('function discardFailedInviteContext()')),ctx);
  return {writes,effects,requests,stored:()=>pending.pendingInviteUrl('https://example.invalid/',sessionStorage,storage),
    recover:()=>{failed=false;},run:()=>ctx.connectAccountToApp({user:{id:owner}},{forceReload})};
}

for(const forceReload of [false,true]) {
  for(const code of ['EVENT_INVITES_UNAVAILABLE','EVENT_MEMBERSHIP_INDEX_PENDING']) {
    test(`account connection retains a retryable ${code} invitation through ${forceReload?'OAuth reload':'existing login'}`,async()=>{
      const h=connectionHarness({forceReload,failure:{status:503,payload:{code,retryable:true}}});
      await assert.doesNotReject(h.run());
      assert.equal(h.stored(),inviteUrl,'temporary failure must not discard the registration handoff');
      assert.ok(h.effects.includes(forceReload?'reload':'ready'));
      assert.ok(h.writes.every(state=>state.events.length===0),'unverified membership must never be invented');
      h.recover();await h.run();
      assert.equal(h.writes.at(-1).events[0].id,eventId);
      assert.equal(h.stored(),'https://example.invalid/');
      assert.equal(h.requests.length,2);
      assert.deepEqual(h.requests[1].body,{eventId,token});
      assert.equal(h.requests[1].headers.authorization,'Bearer synthetic');
    });
  }
}
for(const code of ['EVENT_INVITE_REVOKED','EVENT_INVITE_EXPIRED','PRIVATE_INVITE_RECIPIENT_MISMATCH','EVENT_INVITES_UNAVAILABLE']) {
  test(`account connection still surfaces terminal ${code}`,async()=>{
    const h=connectionHarness({failure:{status:code.includes('MISMATCH')?403:410,payload:{code,retryable:false}}});
    await assert.rejects(h.run(),{code});assert.equal(h.writes.length,0);
  });
}

function manualHarness({interruptAt,kind='session'}={}) {
  let generation=0,activeOwner=owner;
  const storage=memory(),writes=[],renders=[];
  const interrupt=phase=>{if(interruptAt!==phase)return;
    if(kind==='navigation')ctx.screen={name:'home'};
    else {generation++;if(kind==='account')activeOwner='another-account';}
  };
  const ctx=vm.createContext({joinEventBusy:false,joinEventDraft:{link:inviteUrl,error:''},screen:{name:'join-event'},
    runtimeConfig:config,state:initial(),localProfile:profile,window:{localStorage:storage},
    versionedReadCacheSessionGeneration:()=>generation,pendingEventMembershipOwnerId:()=>owner,
    pendingMutationOwnerIsActive:id=>id===activeOwner,loadStoredAccountSession:()=>({user:{id:activeOwner}}),
    ensureJoinEventDraft:()=>{},parseEventIdFromJoinInput:()=>eventId,
    render:()=>renders.push(ctx.screen.name),loadRuntimeConfig:async()=>{interrupt('config');return config;},
    resolveEventInviteCredentials:async()=>{interrupt('redeem');return {id:'audit-invite-space',key:'synthetic_invite_space_key_0001'};},
    rememberPendingIncomingEventJoin:id=>joins.rememberPendingEventJoin({ownerUserId:owner,eventId:id},storage),
    forgetPendingIncomingEventJoin:id=>joins.forgetPendingEventJoin({ownerUserId:owner,eventId:id},storage),
    readSharedEventState:async()=>{interrupt('read');return remote();},mergeSharedEventIntoState,ensureNamedParticipant,isActiveEventParticipant,
    getEvent:id=>ctx.state.events.find(event=>event.id===id),persistLocalProfile:()=>{},
    saveSharedState:async(state,options)=>{assert.deepEqual(Array.from(options.forceSharedEventIds),[eventId]);writes.push(structuredClone(state));interrupt('save');return {ok:true};},
    emitProductMetric:()=>{},emitOperationFailure:()=>{},inviteJoinErrorMessage:error=>error.message,schedulePendingMutationRecovery:()=>{}
  });
  vm.runInContext(app.slice(app.indexOf('async function joinExistingEventFromDraft()'),app.indexOf('function inviteJoinErrorMessage(')),ctx);
  return {ctx,writes,renders,pending:()=>joins.loadPendingEventJoins(storage,owner),run:()=>ctx.joinExistingEventFromDraft()};
}
test('successful manual join immediately renders the joined group',async()=>{
  const h=manualHarness();await h.run();assert.equal(h.writes.length,1);
  assert.equal(h.renders.at(-1),'event');assert.equal(h.pending().length,0);
});
for(const kind of ['navigation','session','account'])for(const interruptAt of ['config','redeem','read','save']) {
  test(`manual join ignores late ${interruptAt} after ${kind} change`,async()=>{
    const h=manualHarness({kind,interruptAt});await h.run();
    assert.equal(h.writes.length,interruptAt==='save'?1:0);
    assert.notEqual(h.ctx.screen.name,'event');
    assert.equal(h.pending().length,interruptAt==='config'?0:1,'committed redemption stays recoverable under its original owner');
  });
}
