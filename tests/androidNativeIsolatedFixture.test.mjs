import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../scripts/qa/android-native-isolated/fixture.js',import.meta.url),'utf8');
function harness(existingStorage){
  const storage=()=>{const data=new Map();return{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),clear:()=>data.clear()};};
  const localStorage=existingStorage||storage(),sessionStorage=storage();
  const context=vm.createContext({localStorage,sessionStorage,navigator:{onLine:false},URL,Response,Date,fetch:async()=>{throw new Error('Unexpected real fetch');},location:{href:'https://localhost/',origin:'https://localhost'}});
  vm.runInContext(source,context);
  return{context,localStorage,get row(){return JSON.parse(localStorage.getItem('qa-native-server-row'));},fetch:context.fetch};
}
test('isolated Android fixture rejects foreign snapshot identities and stale CAS writes',async()=>{
  const h=harness(),before=h.row;
  let result=await h.fetch('https://android-native-qa.supabase.co/rest/v1/app_snapshots?id=eq.foreign',{method:'PATCH',body:JSON.stringify({id:'foreign',state:before.state})});
  assert.equal(result.status,400);assert.deepEqual(h.row,before);
  result=await h.fetch('https://android-native-qa.supabase.co/rest/v1/app_snapshots?id=eq.android-native-qa-space&updated_at=eq.stale',{method:'PATCH',body:JSON.stringify({id:before.id,state:before.state,updated_at:'new'})});
  assert.deepEqual(await result.json(),[]);assert.deepEqual(h.row,before);assert.equal(h.localStorage.getItem('qa-native-writes'),null);
});
for(const mismatch of ['foreign-filter','foreign-payload'])test(`isolated Android fixture rejects a partially matching snapshot identity: ${mismatch}`,async()=>{
  const h=harness(),before=h.row,state=structuredClone(before.state);state.events[0].expenses[0].name='must not save';
  const filter=mismatch==='foreign-filter'?'foreign':before.id,payloadId=mismatch==='foreign-payload'?'foreign':before.id;
  const result=await h.fetch(`https://android-native-qa.supabase.co/rest/v1/app_snapshots?id=eq.${filter}&updated_at=eq.${before.updated_at}`,{method:'PATCH',body:JSON.stringify({id:payloadId,state,updated_at:'2026-10-10T12:00:00.000Z'})});
  assert.equal(result.status,400);assert.deepEqual(h.row,before);assert.equal(h.localStorage.getItem('qa-native-writes'),null);
});
test('isolated Android fixture stores actual final payload, acknowledges version and retains data at reload',async()=>{
  const h=harness(),row=h.row,state=structuredClone(row.state);state.events[0].expenses[0].name='edited';
  const next='2026-10-10T11:00:00.000Z';
  const result=await h.fetch(`https://android-native-qa.supabase.co/rest/v1/app_snapshots?id=eq.${row.id}&updated_at=eq.${row.updated_at}`,{method:'PATCH',body:JSON.stringify({id:row.id,state,updated_at:next})});
  assert.deepEqual(await result.json(),[{updated_at:next}]);assert.deepEqual(h.row.state,state);
  assert.deepEqual(JSON.parse(h.localStorage.getItem('qa-native-writes'))[0].state,state);
  // A real page reload creates a new JS global but retains localStorage.
  const reloaded=harness(h.localStorage);assert.deepEqual(reloaded.row.state,state,'fixture must not reseed on relaunch');
});
test('isolated Android fixture blocks external fetches and rejects unimplemented mutations',async()=>{
  const h=harness();await assert.rejects(h.fetch('https://example.test/anything'),/blocks external request/);
  const result=await h.fetch('https://android-native-qa.supabase.co/rest/v1/rpc/unsupported',{method:'POST',body:'{}'});
  assert.equal(result.status,501);assert.equal(JSON.parse(h.localStorage.getItem('qa-native-unhandled'))[0].path,'/rest/v1/rpc/unsupported');
});
