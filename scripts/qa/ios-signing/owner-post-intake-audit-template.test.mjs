import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {collectOwnerSnapshot} from './collect-owner-snapshot.mjs';
import * as productionModule from './owner-post-intake-audit-template.mjs';
const {AUDIT_PINS: productionPins, runOwnerReadOnlyAudit: productionRun} = productionModule;

// Expose private helpers only in an isolated source copy, never through production exports.
// No credential factory, JWT, real client import, fetch or Apple request occurs in these tests.
const source = await readFile(new URL('./owner-post-intake-audit-template.mjs', import.meta.url), 'utf8');
const testExports = '\nexport {scopedCollectorClient, auditOutputBytes, collectAuditTemplate};\n';
const importCopy = text => import('data:text/javascript;base64,' + Buffer.from(text).toString('base64'));
const blocked = await importCopy(source + testExports);
const readySource = source.replace(/: 'PENDING'/g, ": 'BOUND'")
  .replace("buildId: 'BOUND'", "buildId: '19400000-0000-4000-8000-000000000001'");
const ready = await importCopy(readySource + testExports);
const A = '6809952514', B = 'com.sogrimhashbon.app';
const T = ready.AUDIT_PINS.buildId, G = '4646e3de-7401-4e70-ac32-9a00072e1376';
const OLD = '11111111-1111-4111-8111-111111111111', S = '22222222-2222-4222-8222-222222222222';
const F = 'name,isInternalGroup,hasAccessToAllBuilds,publicLinkEnabled';
const opts = {method: 'GET', redirect: 'error'};
const q = (path, params) => path + '?' + new URLSearchParams(params);
const groupsPath = q('/v1/apps/' + A + '/betaGroups', {'fields[betaGroups]': F, limit:'200'});
const filtered = q('/v1/betaGroups', {'filter[app]':A,'filter[builds]':T,'fields[betaGroups]':F,limit:'200'});
const appPath = q('/v1/apps/' + A, {'fields[apps]':'bundleId'});
let checks = 0;
async function check(name, callback) {
  await test(name, callback); checks++;
}
function mockScope(module = ready, responses = new Map(), fetchOverride = null) {
  const calls = [], creds = Object.freeze({synthetic: true});
  let capturedFetch;
  const factory = (credentials, {fetchImpl}) => {
    assert.equal(credentials, creds); capturedFetch = fetchImpl;
    return async (path, options) => {
      assert.deepEqual(options, opts);
      return fetchImpl(new URL(path,'https://api.appstoreconnect.apple.com'), {method:'GET',redirect:'error'});
    };
  };
  const fetchMock = fetchOverride || (async (url, options) => {
    calls.push({url:url.href, options});
    return responses.get(url.pathname + url.search) || {data:[]};
  });
  const api = module.scopedCollectorClient(factory, creds, fetchMock, T);
  return {api,calls,rawFetch: (...args) => capturedFetch(...args)};
}
await check('Production default is PENDING and cannot touch caller dependencies', async () => {
  let touched = 0;
  const poison = new Proxy({}, {get(){touched++; throw Error('credential/dependency accessed');}});
  assert.equal(productionPins.buildId,'PENDING');
  await assert.rejects(productionRun(poison), /Unbound audit pin/);
  assert.equal(touched,0);
  await assert.rejects(blocked.collectAuditTemplate({
    get createAppStoreClient(){touched++; throw Error('dependency accessed');}
  }), /Unbound audit pin/);
  assert.equal(touched,0);
});
await check('Filled synthetic pins still cannot bypass absent pre-key integration', async () => {
  await assert.rejects(ready.runOwnerReadOnlyAudit(), /successful-intake\/evidence-artifact verifier/);
});
await check('Only intended public preparation exports exist', () => {
  assert.deepEqual(Object.keys(productionModule).sort(),['AUDIT_PINS','requireAuditBindings','runOwnerReadOnlyAudit']);
});
await check('Fixed App GET reaches mock unchanged with redirect:error', async () => {
  const m=mockScope(); await m.api(appPath,opts);
  assert.equal(m.calls.length,1); assert.deepEqual(m.calls[0].options,opts);
});
for (const [name,options] of [
  ['POST',{method:'POST',redirect:'error'}],['body',{...opts,body:{}}],
  ['redirect-follow',{method:'GET',redirect:'follow'}],['missing-explicit-redirect',{method:'GET'}]
]) await check('Reject '+name+' before mock fetch',async()=>{
  const m=mockScope(); await assert.rejects(m.api(appPath,options)); assert.equal(m.calls.length,0);
});
for (const [name,path] of [
  ['foreign-origin','https://example.invalid'+appPath],
  ['other-app',appPath.replace(A,'9999999999')],
  ['global-apps','/v1/apps'],
  ['global-testers','/v1/betaTesters'],
  ['global-builds','/v1/builds?filter[app]='+A],
  ['unfiltered-groups','/v1/betaGroups?limit=200'],
  ['missing-build-filter',q('/v1/betaGroups',{'filter[app]':A,'fields[betaGroups]':F,limit:'200'})],
  ['wrong-build-filter',filtered.replace(T,OLD)],
  ['duplicate-app-filter',filtered+'&filter%5Bapp%5D='+A],
  ['scope-in-include',appPath+'&include=builds'],
  ['credentials','https://u:p@api.appstoreconnect.apple.com'+appPath],
  ['fragment',appPath+'#secret'],
  ['backslash','/v1/apps\\'+A],
  ['dot-traversal','/v1/extra/../apps/'+A],
  ['encoded-segment','/v1/apps%2f'+A],
  ['arbitrary-group','/v1/betaGroups/'+G+'/relationships/app'],
  ['arbitrary-build',q('/v1/builds/'+OLD+'/app',{'fields[apps]':'bundleId'})],
  ['arbitrary-store',q('/v1/appStoreVersions/'+S+'/build',{'fields[builds]':'version'})]
]) await check('Reject '+name+' before fetch',async()=>{
  const m=mockScope(); await assert.rejects(m.api(path,opts)); assert.equal(m.calls.length,0);
});
await check('Filtered fixed App+Build query allowed without granting unrelated groups',async()=>{
  const m=mockScope(ready,new Map([[filtered,{data:[{type:'betaGroups',id:G}]}]]));
  await m.api(filtered,opts);
  await assert.rejects(m.api('/v1/betaGroups/'+G+'/relationships/app',opts),/Unscoped group/);
  assert.equal(m.calls.length,1);
});
await check('App-scoped group grants group reads and then old build identity reads',async()=>{
  const relation=q('/v1/betaGroups/'+G+'/relationships/builds',{limit:'200'});
  const oldApp=q('/v1/builds/'+OLD+'/app',{'fields[apps]':'bundleId'});
  const m=mockScope(ready,new Map([[groupsPath,{data:[{type:'betaGroups',id:G}]}],[relation,{data:[{type:'builds',id:OLD}]}]]));
  await m.api(groupsPath,opts); await m.api('/v1/betaGroups/'+G+'/relationships/app',opts);
  await m.api(relation,opts); await m.api(oldApp,opts);
  await assert.rejects(m.api(q('/v1/builds/'+OLD,{'fields[builds]':'version'}),opts),/Unscoped build/);
  assert.equal(m.calls.length,4);
});
await check('Wrong resource type cannot grant dynamic scope',async()=>{
  const m=mockScope(ready,new Map([[groupsPath,{data:[{type:'betaTesters',id:G}]}]]));
  await assert.rejects(m.api(groupsPath,opts),/resource type/);
  await assert.rejects(m.api('/v1/betaGroups/'+G+'/relationships/app',opts),/Unscoped group/);
});
await check('iOS App Store list grants only its own store-build reads',async()=>{
  const list=q('/v1/apps/'+A+'/appStoreVersions',{'filter[platform]':'IOS','fields[appStoreVersions]':'platform,versionString,appStoreState,releaseType',limit:'200'});
  const link=q('/v1/appStoreVersions/'+S+'/build',{'fields[builds]':'version'});
  const m=mockScope(ready,new Map([[list,{data:[{type:'appStoreVersions',id:S}]}],[link,{data:{type:'builds',id:OLD}}]]));
  await m.api(list,opts); await m.api(link,opts);
  await m.api(q('/v1/builds/'+OLD+'/app',{'fields[apps]':'bundleId'}),opts);
  assert.equal(m.calls.length,3);
});
await check('Pagination keeps exact scope and may add cursor only',async()=>{
  const m=mockScope(); await m.api(groupsPath+'&cursor=synthetic-token',opts);
  await assert.rejects(m.api(groupsPath.replace('limit=200','limit=50')+'&cursor=synthetic',opts));
  await assert.rejects(m.api(groupsPath+'&cursor=',opts)); assert.equal(m.calls.length,1);
});
await check('Underlying client cannot fetch unsolicited URL',async()=>{
  const m=mockScope();
  await assert.rejects(m.rawFetch(new URL('https://api.appstoreconnect.apple.com'+appPath),opts),/outside approved/);
  assert.equal(m.calls.length,0);
});
await check('Underlying client POST/redirect/body rejected by fetch boundary',async()=>{
  for (const bad of [{method:'POST',redirect:'error'},{method:'GET',redirect:'follow'},{...opts,body:'x'}]) {
    let fetched=0;
    const api=ready.scopedCollectorClient((_c,{fetchImpl})=>async path=>fetchImpl(new URL(path,'https://api.appstoreconnect.apple.com'),bad),{},async()=>{fetched++;},T);
    await assert.rejects(api(appPath,opts)); assert.equal(fetched,0);
  }
});
await check('Underlying client cannot switch destination or approved path',async()=>{
  for (const url of ['https://example.invalid'+appPath,'https://api.appstoreconnect.apple.com/v1/betaTesters']) {
    let fetched=0;
    const api=ready.scopedCollectorClient((_c,{fetchImpl})=>async()=>fetchImpl(new URL(url),opts),{},async()=>{fetched++;},T);
    await assert.rejects(api(appPath,opts)); assert.equal(fetched,0);
  }
});
await check('Failure does not leave approved fetch capability active or retry',async()=>{
  let fetched=0;
  const m=mockScope(ready,new Map(),async()=>{fetched++;throw Error('synthetic HTTP failure');});
  await assert.rejects(m.api(appPath,opts),/synthetic/); assert.equal(fetched,1);
  await assert.rejects(m.rawFetch(new URL('https://api.appstoreconnect.apple.com'+appPath),opts),/outside approved/);
  assert.equal(fetched,1);
});
const originalResult = () => ({
 snapshot:{schemaVersion:1,observedAt:'2026-01-01T01:02:03.004Z',coverage:{},app:{id:A,bundleId:B},
  build:{id:T,appId:A,version:'4.58',build:'194',platform:'IOS'},
  groups:[{hasAccessToAllBuilds:null}],notes:[{whatsNew:' original \n'}]},
 evidence:{schemaVersion:1,mode:'INJECTED_API_GET_ONLY',appId:A,buildId:T,complete:true,
  transportAttestation:'NOT_PROVIDED_BY_THIS_COLLECTOR',requests:[{method:'GET',completed:true,path:appPath}]}
});
const provenance = () => ({auditMode:'INDEPENDENT_POST_INTAKE_GET_ONLY',bindings:ready.AUDIT_PINS});
await check('Outputs preserve original snapshot/evidence fields, nulls and observation timestamp',()=>{
 const r=originalResult(),before=JSON.stringify(r),bytes=ready.auditOutputBytes(r,provenance());
 assert.equal(bytes.snapshot.toString(),JSON.stringify(r.snapshot,null,2)+'\n');
 assert.equal(bytes.evidence.toString(),JSON.stringify(r.evidence,null,2)+'\n');
 assert.equal(JSON.stringify(r),before);
 const p=JSON.parse(bytes.provenance); assert.deepEqual(p.bindings,ready.AUDIT_PINS);
 assert.equal(p.outputSha256.snapshot,createHash('sha256').update(bytes.snapshot).digest('hex'));
 assert.equal(p.outputSha256.evidence,createHash('sha256').update(bytes.evidence).digest('hex'));
 assert.equal(JSON.parse(bytes.evidence).transportAttestation,'NOT_PROVIDED_BY_THIS_COLLECTOR');
});
for (const [name,mutate] of [
 ['foreign app',r=>{r.snapshot.app.id='999';}],['foreign bundle',r=>{r.snapshot.app.bundleId='other';}],
 ['foreign target',r=>{r.snapshot.build.id=OLD;}],['wrong version',r=>{r.snapshot.build.version='4.57';}],
 ['wrong build',r=>{r.snapshot.build.build='193';}],['non-iOS',r=>{r.snapshot.build.platform='MAC_OS';}],
 ['incomplete evidence',r=>{r.evidence.complete=false;}],['wrong evidence app',r=>{r.evidence.appId='999';}],
 ['wrong evidence build',r=>{r.evidence.buildId=OLD;}],['mutation evidence',r=>{r.evidence.requests[0].method='POST';}]
]) await check('Reject output '+name,()=>{
 const r=originalResult();mutate(r);assert.throws(()=>ready.auditOutputBytes(r,provenance()));
});
await check('Private wiring passes only fixed App/Build to injected collector',async()=>{
 let saw=0;
 const bytes=await ready.collectAuditTemplate({
  createAppStoreClient:(_c,{fetchImpl})=>async path=>fetchImpl(new URL(path,'https://api.appstoreconnect.apple.com'),opts),
  credentials:{synthetic:true},fetchImpl:async()=>({data:{type:'apps',id:A,attributes:{bundleId:B}}}),
  collectOwnerSnapshot:async(api,ids)=>{assert.deepEqual(ids,{appId:A,buildId:T});await api(appPath,opts);saw++;return originalResult();},
  provenance:provenance()
 });
 assert.equal(saw,1);assert.equal(JSON.parse(bytes.snapshot).build.id,T);
});

function collectorTransport(assigned=false, foreignOld=false) {
 const E='33333333-3333-4333-8333-333333333333', O2='44444444-4444-4444-8444-444444444444';
 const V2='55555555-5555-4555-8555-555555555555', V3='66666666-6666-4666-8666-666666666666';
 const one=(type,id,attributes)=>({type,id,...(attributes?{attributes}:{})});
 const groups=[one('betaGroups',G,{name:'Existing owner',isInternalGroup:true,hasAccessToAllBuilds:false,publicLinkEnabled:false}),
  one('betaGroups',E,{name:'Existing external',isInternalGroup:false,hasAccessToAllBuilds:null,publicLinkEnabled:false})];
 const memberships={[G]:[OLD,...(assigned?[T]:[])],[E]:[O2]};
 const versions=[one('appStoreVersions',S,{platform:'IOS',versionString:'4.57',appStoreState:'PENDING_DEVELOPER_RELEASE',releaseType:'MANUAL'}),
  one('appStoreVersions',V2,{platform:'IOS',versionString:'4.55',appStoreState:'READY_FOR_SALE',releaseType:'AFTER_APPROVAL'}),
  one('appStoreVersions',V3,{platform:'IOS',versionString:'4.58',appStoreState:'PREPARE_FOR_SUBMISSION',releaseType:'MANUAL'})];
 const calls=[];
 const fetchImpl=async (u,options)=>{
  assert.deepEqual(options,opts);calls.push(u.href);
  const p=u.pathname,id=p.split('/')[3];
  let data,collection=false;
  if(p==='/v1/apps/'+A || /^\/v1\/builds\/[^/]+\/app$/.test(p))
   data=one('apps',foreignOld&&id===OLD?'999':A,{bundleId:B});
  else if(p==='/v1/builds/'+T) data=one('builds',T,{version:'194',processingState:'VALID',expired:false,usesNonExemptEncryption:false});
  else if(p.endsWith('/preReleaseVersion')) data=one('preReleaseVersions','pre458',{version:'4.58',platform:'IOS'});
  else if(p.endsWith('/buildBetaDetail')) data=one('buildBetaDetails','beta194',{internalBuildState:assigned?'IN_BETA_TESTING':'READY_FOR_BETA_TESTING',externalBuildState:'READY_FOR_BETA_SUBMISSION'});
  else if(p.endsWith('/betaBuildLocalizations')) {collection=true;data=[one('betaBuildLocalizations','note-he',{locale:'he',whatsNew:' Synthetic note \n'})];}
  else if(p==='/v1/apps/'+A+'/betaGroups') {collection=true;data=groups;}
  else if(p==='/v1/betaGroups') {collection=true;data=groups.filter(g=>memberships[g.id].includes(T));}
  else if(/^\/v1\/betaGroups\/[^/]+\/relationships\/app$/.test(p)) data=one('apps',A);
  else if(/^\/v1\/betaGroups\/[^/]+$/.test(p)) data=groups.find(g=>g.id===id);
  else if(p.endsWith('/relationships/builds')) {collection=true;data=memberships[id].map(b=>one('builds',b));}
  else if(p.endsWith('/relationships/betaTesters')) {collection=true;data=[one('betaTesters',id===G?'owner-synthetic':'external-synthetic')];}
  else if(p.endsWith('/relationships/individualTesters')) {collection=true;data=[];}
  else if(p.endsWith('/relationships/appStoreVersion')) data=null;
  else if(p==='/v1/apps/'+A+'/appStoreVersions') {collection=true;data=versions;}
  else if(/^\/v1\/appStoreVersions\/[^/]+\/build$/.test(p)) data=id===V3?null:one('builds',id===S?O2:OLD,{version:id===S?'192':'191'});
  else throw Error('Unplanned synthetic route');
  return {data:structuredClone(data),...(collection?{links:{next:null},meta:{paging:{total:data.length,limit:200}}}:{})};
 };
 const factory=(_credentials,{fetchImpl:checked})=>async path=>checked(new URL(path,'https://api.appstoreconnect.apple.com'),opts);
 return {factory,fetchImpl,calls};
}
for(const assigned of [false,true]) await check('Existing collector79ff completes real contract through wrapper, assigned='+assigned,async()=>{
 const f=collectorTransport(assigned),before=JSON.stringify(ready.AUDIT_PINS);
 const output=await ready.collectAuditTemplate({createAppStoreClient:f.factory,collectOwnerSnapshot,
  credentials:{synthetic:true},fetchImpl:f.fetchImpl,provenance:provenance()});
 const s=JSON.parse(output.snapshot),e=JSON.parse(output.evidence);
 assert.equal(e.complete,true);assert.equal(s.build.id,T);assert.equal(s.groups.length,2);
 assert.equal(s.appStoreVersions.length,3);assert.deepEqual(s.buildGroupIds,assigned?[G]:[]);
 assert.equal(s.groups.find(g=>g.id!==G).hasAccessToAllBuilds,null);
 assert.equal(s.notes[0].whatsNew,' Synthetic note \n');
 assert.ok(e.collections.every(c=>c.complete));assert.ok(f.calls.length>20);
 assert.equal(JSON.stringify(ready.AUDIT_PINS),before);
});
await check('Collector identity failure yields no fabricated successful output',async()=>{
 const f=collectorTransport(false,true);
 await assert.rejects(ready.collectAuditTemplate({createAppStoreClient:f.factory,collectOwnerSnapshot,
  credentials:{synthetic:true},fetchImpl:f.fetchImpl,provenance:provenance()}));
 assert.ok(f.calls.length>0);
});

console.log(JSON.stringify({syntheticControls:checks,liveAppleCalls:0,keysLoaded:0,productionActivated:false}));
