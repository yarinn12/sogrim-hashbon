import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as identity from '../src/domain/participantIdentity.mjs';
import {mergeSharedStates} from '../src/domain/sharedStateMerge.mjs';
import {buildSharedEventState, saveSharedEventState, mergeSharedEventIntoState} from '../src/data/sharedEventStore.mjs';

const source=readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8');
const handler=source.slice(source.indexOf('async function saveParticipantAlias('),source.indexOf('\nfunction requestExpenseDeletion('));
const members=['account-alias-a','account-alias-b'], eventId='alias-event';
const credentials={id:'alias-shared-space',key:'synthetic_alias_shared_key_1234567890'};
let sequence=0;
function harness() {
  const at='2026-09-01T00:00:00.000Z';
  const initial={currentParticipantId:members[0],groups:[],participants:members.map(id=>({id,kind:'user',displayName:id})),events:[{
    id:eventId,name:'Alias fixture',participantIds:members,adminIds:members,createdByParticipantId:members[0],
    createdAt:at,settingsUpdatedAt:at,participantAliases:{[members[0]]:'Old A',[members[1]]:'Old B'},
    sharedSpaceId:credentials.id,sharedSpaceKey:credentials.key,notes:[],expenses:[],transfers:[]}]};
  let canonical=buildSharedEventState(initial,eventId),version=at, collide=false;
  const writes=[],receipts=[];
  const save=async(state,actor)=>saveSharedEventState({storage:{mode:'supabase',url:`https://alias-${sequence}.invalid`,table:'app_snapshots',anonKey:'synthetic',
    account:{userId:actor.slice(8),accessToken:'synthetic'}}},state,eventId,async(url,options={})=>{
    if(url.includes('/rpc/update_shared_event_snapshot')) {
      const body=JSON.parse(options.body);writes.push(structuredClone(body));
      if(collide){collide=false;version=new Date(Date.parse(version)+1).toISOString();return Response.json({status:'conflict'});}
      assert.equal(body.p_expected_updated_at,version);
      canonical=structuredClone(body.p_state);version=new Date(Date.parse(version)+1).toISOString();
      const receipt={status:'updated',updatedAt:version};receipts.push(receipt);return Response.json(receipt);
    }
    return Response.json([{state:canonical,updated_at:version}]);
  });
  sequence++;
  const clients=members.map(actor=>{
    class Input {constructor(){this.value='';}}
    const input=new Input();
    const ctx=vm.createContext({...identity,HTMLInputElement:Input,state:{...structuredClone(initial),currentParticipantId:actor},notice:'',
      getEvent:id=>ctx.state.events.find(e=>e.id===id),canCurrentParticipantManage:()=>true,
      app:{querySelector:selector=>selector.includes('participant-alias')?input:null},render(){},reactivateDialogAfterRender(){},
      persistState:async()=>{ctx.state=await save(ctx.state,actor);return{ok:true};}});
    vm.runInContext(handler,ctx);
    return{ctx,input,async alias(id,value){input.value=value;await ctx.saveParticipantAlias(eventId,id);},
      async save(){ctx.state=await save(ctx.state,actor);return ctx.state;},refresh(){ctx.state=mergeSharedEventIntoState(ctx.state,canonical,credentials);}};
  });
  return{clients,writes,receipts,get canonical(){return canonical;},conflict(){collide=true;}};
}

for(const clear of [false,true])test(`a ${clear?'cleared':'renamed'} participant alias survives a stale peer note and CAS retry`,async()=>{
  const h=harness(),[a,b]=h.clients;
  const value=clear?'':'Current alias';
  await a.alias(members[1],value);
  b.ctx.state.events[0].notes.push({id:'peer-note',title:'Peer note',body:'Keep this too',createdAt:'2026-09-02T00:00:00.000Z',updatedAt:'2026-09-02T00:00:00.000Z',
    createdByParticipantId:members[1],updatedByParticipantId:members[1]});
  h.conflict();await b.save();
  for(const state of [h.canonical,b.ctx.state]) {
    assert.equal(state.events[0].participantAliases[members[1]],value,'a stale participant snapshot must not undo a saved alias');
    assert.ok(state.events[0].notes.some(note=>note.id==='peer-note'));
  }
  a.refresh();b.refresh();
  assert.equal(a.ctx.state.events[0].participantAliases[members[1]],value);
  assert.equal(h.receipts.length,2);
  for(const write of h.writes.slice(1))assert.equal(write.p_state.events[0].participantAliases[members[1]],value);
});

test('two administrators changing different aliases retain both changes in the final payload',async()=>{
  const h=harness(),[a,b]=h.clients;
  await a.alias(members[0],'Current A');await b.alias(members[1],'Current B');
  assert.deepEqual(h.canonical.events[0].participantAliases,{[members[0]]:'Current A',[members[1]]:'Current B'});
  assert.equal(h.receipts.length,2);
  a.refresh();b.refresh();
  assert.deepEqual(a.ctx.state.events[0].participantAliases,b.ctx.state.events[0].participantAliases);
});

test('a stale administrator alias edit cannot revert unrelated event settings',async()=>{
  const h=harness(),[a,b]=h.clients;
  a.ctx.state.events[0].name='New event title';
  a.ctx.state.events[0].settingsUpdatedAt='2026-09-02T00:00:00.000Z';
  a.ctx.state.events[0].settingsFieldUpdatedAt={name:'2026-09-02T00:00:00.000Z'};
  await a.save();await b.alias(members[1],'Current B');
  assert.equal(h.canonical.events[0].name,'New event title');
  assert.equal(h.canonical.events[0].participantAliases[members[1]],'Current B');
  assert.equal(h.receipts.length,2);
});

test('alias versions advance within the same millisecond and keep complete participant identifiers',()=>{
  const id='p'.repeat(128), at='2026-09-01T00:00:00.000Z';
  const event={participantAliases:{other:'Keep'},participantAliasUpdatedAtByParticipant:{[id]:at}};
  const first=identity.participantAliasUpdate(event,id,' First ',at);
  const second=identity.participantAliasUpdate(first,id,'',at);
  assert.equal(first.participantAliases[id],'First');
  assert.equal(second.participantAliases[id],'');
  assert.equal(second.participantAliases.other,'Keep');
  assert.equal(Date.parse(second.participantAliasUpdatedAtByParticipant[id]),Date.parse(at)+2);
});

test('equal alias versions converge in either merge order, including a retained clear clock',()=>{
  const h=harness(), left=structuredClone(h.canonical),right=structuredClone(left);
  const at='2026-09-02T00:00:00.000Z',id=members[1];
  for(const state of [left,right])state.events[0].participantAliasUpdatedAtByParticipant={[id]:at};
  left.events[0].participantAliases[id]='Changed nickname';
  delete right.events[0].participantAliases[id];
  for(const [a,b] of [[left,right],[right,left]]) {
    assert.equal(mergeSharedStates(a,b).events[0].participantAliases[id],'');
  }
});

test('an unsuccessful alias save restores its previous clock without undoing a concurrent different alias',async()=>{
  const h=harness(),[a]=h.clients,event=a.ctx.state.events[0],at='2026-09-01T00:00:00.000Z';
  event.participantAliasUpdatedAtByParticipant={[members[0]]:at};
  a.ctx.persistState=async()=>{
    Object.assign(event,identity.participantAliasUpdate(event,members[1],'Concurrent B'));
    return{ok:false};
  };
  await a.alias(members[0],'Rejected A');
  assert.equal(event.participantAliases[members[0]],'Old A');
  assert.equal(event.participantAliasUpdatedAtByParticipant[members[0]],at);
  assert.equal(event.participantAliases[members[1]],'Concurrent B');
  assert.ok(event.participantAliasUpdatedAtByParticipant[members[1]]);
  assert.equal(h.writes.length,0);
});

test('an older failed alias receipt cannot roll back a newer value of the same participant',async()=>{
  const h=harness(),[a]=h.clients,event=a.ctx.state.events[0];
  let finish;
  a.ctx.persistState=()=>new Promise(resolve=>{finish=resolve;});
  const pending=a.alias(members[0],'Older attempt');
  Object.assign(event,identity.participantAliasUpdate(event,members[0],'Newer value'));
  const savedClock=event.participantAliasUpdatedAtByParticipant[members[0]];
  finish({ok:false});await pending;
  assert.equal(event.participantAliases[members[0]],'Newer value');
  assert.equal(event.participantAliasUpdatedAtByParticipant[members[0]],savedClock);
});
