import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
import {mergeSharedEventIntoState} from "../src/data/sharedEventStore.mjs";
import {ensureNamedParticipant} from "../src/domain/userProfile.mjs";
import {isActiveEventParticipant} from "../src/domain/eventMembership.mjs";
import {rememberPendingEventJoin,forgetPendingEventJoin,loadPendingEventJoins} from "../src/data/pendingEventJoins.mjs";

const source=readFileSync(new URL('../src/publicInviteSnapshotLayer.mjs',import.meta.url),'utf8');
const clickFlow=source.slice(source.indexOf('async function handleInviteSnapshotJoinClick(event)'),source.indexOf('function openVerifiedCachedEvent(eventId)'));
const importFlow=source.slice(source.indexOf('function inviteImportOwnerIsActive(config)'),source.indexOf('function notifyJoinedEvent('));
const owner='00000000-0000-4000-8000-000000000073',participantId=`account-${owner}`,eventId='invite-entry-session';

function harness(mode,{restartAt,readFails=false}={}) {
  let generation=0;
  const values=new Map(),writes=[],cloudWrites=[],notices=[],clears=[],navigations=[];
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const initial={currentParticipantId:participantId,groups:[],participants:[{id:participantId,displayName:'Member',kind:'user'}],events:[]};
  const remote={...initial,events:[{id:eventId,name:'Invited group',participantIds:[participantId],adminIds:[participantId],expenses:[],transfers:[]}]};
  const config={storage:{mode:'supabase',account:{userId:owner}}};
  const restart=phase=>{if(restartAt===phase)generation++;};
  const button={disabled:false,isConnected:true};
  const ctx=vm.createContext({runtimeConfig:config,inviteJoinBusy:false,URL,
    window:{localStorage:storage,location:{href:'https://example.invalid/',origin:'https://example.invalid',replace:url=>navigations.push(url)}},
    document:{dispatchEvent:event=>{if(event.type!=='settle-friends:pending-join')notices.push(event.detail);}},Event,
    CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},
    versionedReadCacheSessionGeneration:()=>generation,loadStoredAccountSession:()=>({user:{id:owner}}),
    rememberPendingEventJoin:entry=>rememberPendingEventJoin(entry,storage),forgetPendingEventJoin:entry=>forgetPendingEventJoin(entry,storage),
    pendingInviteUrl:()=>`https://example.invalid/i/${eventId}`,findJoinLink:()=>`https://example.invalid/i/${eventId}`,
    parseInviteSnapshot:()=>({event:{id:eventId}}),parseInviteEventId:()=>eventId,
    loadRuntimeConfig:async()=>{restart('config');return config;},
    resolveEventInviteCredentials:async()=>{restart('redeem');return {id:'entry-session-space',key:'entry_session_synthetic_key_0001'};},
    readSharedEventState:async()=>{restart('read');if(readFails)throw Error('offline');return structuredClone(remote);},
    loadState:()=>structuredClone(initial),mergeSharedEventIntoState,ensureNamedParticipant,isActiveEventParticipant,
    loadLocalProfile:()=>({participantId,displayName:'Member'}),saveState:state=>writes.push(structuredClone(state)),
    saveSharedState:async state=>{cloudWrites.push(structuredClone(state));restart('save');return {ok:true};},
    clearPendingInviteUrl:()=>clears.push(true),openVerifiedCachedEvent:()=>false,notifyJoinedEvent:()=>notices.push('joined'),
    buildEventInviteUrl:()=>`https://example.invalid/i/${eventId}`
  });
  vm.runInContext(clickFlow+importFlow,ctx);
  return {writes,cloudWrites,notices,clears,navigations,pending:()=>loadPendingEventJoins(storage,owner),
    run:()=>mode==='click'?ctx.handleInviteSnapshotJoinClick({target:{closest:()=>button},preventDefault(){},stopImmediatePropagation(){}}):ctx.importIncomingSharedEvent(config)};
}

for(const mode of ['click','import']) {
  test(`${mode} invite entry writes the verified event in the original session`,async()=>{
    const h=harness(mode);await h.run();assert.equal(h.cloudWrites.length,1);
    assert.equal(h.cloudWrites[0].events[0].id,eventId);assert.equal(h.pending().length,0);
  });
  for(const restartAt of ['redeem','read']) {
    test(`${mode} invite entry ignores a late ${restartAt} after same-account reauthentication`,async()=>{
      const h=harness(mode,{restartAt});await h.run();assert.equal(h.writes.length,0);assert.equal(h.cloudWrites.length,0);
      assert.deepEqual(h.clears,[]);assert.deepEqual(h.navigations,[]);assert.deepEqual(h.notices,[]);
    });
  }
  test(`${mode} invite entry retains a redeemed receipt when the event read is offline`,async()=>{
    const h=harness(mode,{readFails:true});await h.run();assert.equal(h.writes.length,0);
    assert.equal(h.pending()[0]?.eventId,eventId);
  });
  test(`${mode} invite entry cannot clear recovery or navigate after a late save in another session`,async()=>{
    const h=harness(mode,{restartAt:'save'});await h.run();assert.equal(h.cloudWrites.length,1);
    assert.deepEqual(h.clears,[]);assert.deepEqual(h.navigations,[]);assert.deepEqual(h.notices,[]);
  });
}

for(const mode of ['startup','reconnect']) {
  for(const restartAt of ['config','import']) {
    test(`${mode} invite orchestration cannot apply a response from the previous session during ${restartAt}`,async()=>{
      const wrapper=mode==='startup'
        ?source.slice(source.indexOf('async function initializeInviteImport()'),source.indexOf('function scheduleInviteSnapshotEnhancement()'))
        :source.slice(source.indexOf('function recoverPendingInviteAfterReconnect('),source.indexOf('function resetPendingInviteRetry()'));
      let generation=0;const effects=[];const config={storage:{account:{userId:owner}}};
      const ctx=vm.createContext({runtimeConfig:{current:true},pendingInviteReconnectRequest:null,
        versionedReadCacheSessionGeneration:()=>generation,inviteImportOwnerIsActive:()=>true,
        document:{documentElement:{classList:{contains:()=>false}}},window:{location:{href:'https://example.invalid/'}},
        pendingInviteUrl:()=>`https://example.invalid/i/${eventId}`,parseInviteEventId:()=>eventId,
        loadRuntimeConfig:async()=>{if(restartAt==='config')generation++;return config;},
        importIncomingSharedEvent:async()=>{if(restartAt==='import')generation++;effects.push('import');return true;},
        resetPendingInviteRetry:()=>effects.push('reset'),cleanInviteAddress:()=>effects.push('clean'),
        schedulePendingInviteRetry:()=>effects.push('retry'),scheduleInviteSnapshotEnhancement:()=>effects.push('enhance')});
      vm.runInContext(wrapper,ctx);
      await (mode==='startup'?ctx.initializeInviteImport():ctx.recoverPendingInviteAfterReconnect());
      if(restartAt==='config'){assert.equal(ctx.runtimeConfig.current,true);assert.deepEqual(effects,[]);}
      else assert.deepEqual(effects,['import']);
    });
  }
}
