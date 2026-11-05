import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {requireBoundIntakePins,boundEnvironment} from './intake-bindings.mjs';
import {verifyOrigin} from './intake194-package-origin.mjs';
import {verifySigningControls} from './intake-nov5-proof.mjs';
import {all,requireManualGroups,requireIntakePreflight,collectState,verifyPostflight,verifyReadEndpoints} from './intake-distribution-guard.mjs';
import {verifyDatabaseReceipt} from './upload-origin-guard.mjs';
const sample=JSON.parse(readFileSync(new URL('../../../tests/fixtures/ios195-nov5-intake.json',import.meta.url),'utf8'));
assert.equal(sample.scope,'SYNTHETIC_ONLY_NOT_AN_ARTIFACT_OR_RELEASE');
const groups=[{id:'internal',attributes:{name:'Internal',isInternalGroup:true,hasAccessToAllBuilds:false,publicLinkEnabled:false}},
 {id:'external',attributes:{name:'External',isInternalGroup:false,hasAccessToAllBuilds:null,publicLinkEnabled:false}}];
const copy=x=>JSON.parse(JSON.stringify(x));
test('synthetic intake origin cannot grant database/public/distribution acceptance',()=>{
 const pins=sample.pins,controls=verifySigningControls(pins.signing.toolsSha,'',sample.controlFiles,pins);
 const p=verifyOrigin(sample.run,sample.artifact,sample.jobs,boundEnvironment(pins),{pins,controlProof:controls,workflow:sample.workflow});
 assert.equal(p.scope,'PACKAGE_INTAKE_ONLY');assert.equal(p.databaseAccepted,false);
 assert.equal(p.publicReleaseAccepted,false);assert.equal(p.distributionAllowed,false);
 assert.throws(()=>verifyDatabaseReceipt(Buffer.from('{}'),'a'.repeat(64)),'public gate still refuses missing real evidence');
});
test('manual groups can retain links to previous builds without granting195',()=>requireManualGroups(groups));
for(const value of [true,null,undefined,'false'])test('manual-group guard blocks automatic flag '+String(value),()=>{
 const g=copy(groups);g[0].attributes.hasAccessToAllBuilds=value;assert.throws(()=>requireManualGroups(g));
});
test('external automatic-all-builds and missing internal scope are blocked',()=>{
 const g=copy(groups);g[1].attributes.hasAccessToAllBuilds=true;assert.throws(()=>requireManualGroups(g));
 delete g[1].attributes.isInternalGroup;assert.throws(()=>requireManualGroups(g));
});
test('live external null remains null; its manual per-build route needs known external scope and public link disabled',()=>{
 const g=copy(groups);requireManualGroups(g);assert.equal(g[1].attributes.hasAccessToAllBuilds,null);
 for(const value of [true,null,undefined,'false']){
  const changed=copy(g);changed[1].attributes.publicLinkEnabled=value;assert.throws(()=>requireManualGroups(changed));
 }
 const changed=copy(g);changed[1].attributes.hasAccessToAllBuilds='false';assert.throws(()=>requireManualGroups(changed));
});
function api(options={}){
 return async(path,request)=>{
   assert.equal(request.method,'GET','no tester, release or permission mutation is allowed');
   if(path==='/v1/apps/6809952514')return {data:{id:'6809952514',attributes:{bundleId:'com.sogrimhashbon.app'}}};
   if(path.includes('/betaGroups?'))return {data:options.groups??copy(groups),links:{next:null}};
   if(path.startsWith('/v1/betaGroups/')&&!path.includes('/builds?')){
     const id=path.split('/').at(-1),group=(options.groups??copy(groups)).find(g=>g.id===id);
     return {data:{...group,type:'betaGroups'}};
   }
   if(path.startsWith('/v1/betaGroups/'))return {data:options.group193?[{id:'build195',attributes:{version:'195'}}]:[{id:'old191',attributes:{version:'191'}}],links:{next:null}};
   if(path.includes('/appStoreVersions?'))return {data:[{id:'store457',attributes:{versionString:'4.57',appStoreState:options.storeChanged?'READY_FOR_SALE':'PENDING_DEVELOPER_RELEASE',releaseType:'MANUAL'}}],links:{next:null}};
   if(path.startsWith('/v1/builds?'))return {data:options.after?[{id:'build195',attributes:{version:'195',processingState:options.processing??'VALID',expired:false}}]:[],links:{next:null}};
   if(path.endsWith('/preReleaseVersion'))return {data:{attributes:{version:options.version??'4.59',platform:'IOS'}}};
   if(path.includes('/individualTesters?'))return {data:options.tester193?[{id:'unintended'}]:[],links:{next:null}};
   if(path.endsWith('/relationships/appStoreVersion'))return {data:options.storeAssigned?{id:'store458'}:null};
   if(path.endsWith('/buildBetaDetail'))return {data:{attributes:{externalBuildState:options.externalState??'READY_FOR_BETA_SUBMISSION'}}};
   throw Error('Unexpected fixture endpoint '+path);
 };
}
test('preflight can ingest while4.57 remains pending, without modifying its release',async()=>{
 const before=await collectState(api());requireIntakePreflight(before);
 assert.equal(before.appStoreVersions[0].state,'PENDING_DEVELOPER_RELEASE');
});
test('preflight refuses already uploaded193',async()=>{
 const state=await collectState(api({after:true}));assert.throws(()=>requireIntakePreflight(state));
});
test('preflight refuses193 group linkage even when filtered build query is empty',async()=>{
 const state=await collectState(api({group193:true}));assert.throws(()=>requireIntakePreflight(state));
});
test('postflight requires VALID4.59/195 with zero groups/testers/store associations',async()=>{
 const p=await verifyPostflight(api({after:true}),await collectState(api()));
 assert.equal(p.assignedIndividualTesters,0);assert.deepEqual(p.assignedGroups,[]);
 assert.equal(p.publicReleaseAccepted,false);assert.equal(p.databaseAccepted,false);
});
for(const [name,change]of [['group exposure',{group193:true}],['individual exposure',{tester193:true}],['public association',{storeAssigned:true}],
 ['external review',{externalState:'IN_BETA_REVIEW'}],['external testing',{externalState:'IN_BETA_TESTING'}],
 ['wrong version',{version:'4.57'}],['not yet valid',{processing:'PROCESSING'}],['public store changed',{storeChanged:true}]])
 test('postflight blocks '+name,async()=>assert.rejects(verifyPostflight(api({after:true,...change}),await collectState(api()))));
test('postflight blocks automatic distribution switched on after upload',async()=>{
 const changed=copy(groups);changed[0].attributes.hasAccessToAllBuilds=true;
 await assert.rejects(verifyPostflight(api({after:true,groups:changed}),await collectState(api())));
});
test('pagination rejects foreign origin, duplicate or incomplete resources',async()=>{
 await assert.rejects(all(async()=>({data:[],links:{next:'https://evil.invalid/v1/apps'}}),'/v1/apps'));
 await assert.rejects(all(async()=>({data:[{id:'x'},{id:'x'}],links:{next:null}}),'/v1/apps'));
 await assert.rejects(all(async()=>({data:[],links:{next:'/v1/apps?page=2'}}),'/v1/apps'));
});
function endpointApi(change={}){
 return async(path,options)=>{
  assert.equal(options.method,'GET');
  if(path.endsWith('/preReleaseVersion'))return {data:{attributes:{version:change.version??'4.57',platform:'IOS'}}};
  if(path.includes('/individualTesters?'))return {data:[],links:{next:null}};
  if(path.endsWith('/relationships/appStoreVersion'))return {data:change.store??{type:'appStoreVersions',id:'store457'}};
  if(path.endsWith('/buildBetaDetail'))return {data:{attributes:{externalBuildState:change.state??'READY_FOR_BETA_SUBMISSION'}}};
  return {data:{id:'d868b49b-660b-41cf-8dcf-fa23cfeba16e',attributes:{version:change.build??'192'}}};
 };
}
test('read-only endpoint proof uses known192 without changing or exposing it',async()=>{
 const proof=await verifyReadEndpoints(endpointApi());assert.equal(proof.readOnly,true);
 assert.equal(proof.individualTesterCount,0);assert.equal(proof.build,'192');
});
for(const change of [{version:'4.59'},{build:'195'},{store:{type:'other',id:'x'}},{state:42}])
 test('read-only endpoint proof rejects mismatched original or unsupported relationship '+JSON.stringify(change),
  async()=>assert.rejects(verifyReadEndpoints(endpointApi(change))));
test('intake audit defaults to GET-only; public receipt workflow and verifier remain separate',()=>{
 const y=readFileSync(new URL('./intake-workflow-template.yml',import.meta.url),'utf8'),pub=readFileSync(new URL('./public-upload-workflow-baseline.yml',import.meta.url),'utf8');
 assert.ok(y.includes('default: audit'));assert.ok(!y.includes('database_receipt_sha256'));
 assert.ok(pub.includes('database_receipt_sha256'));assert.ok(pub.includes('upload-origin-guard.mjs'));
 assert.ok(readFileSync(new URL('./upload-origin-guard.mjs',import.meta.url),'utf8').includes('verifyDatabaseReceipt(bytes,env.DATABASE_RECEIPT_SHA256)'));
 for(const token of ['xcodebuild','native:prepare','import-codesign','reviewSubmission','betaAppReviewSubmission','appStoreVersionReleaseRequest'])
  assert.ok(!y.includes(token),'unexpected build/distribution operation '+token);
 assert.ok(y.includes('intake-distribution-guard.mjs" preflight'));
 assert.ok(y.includes('intake-distribution-guard.mjs" postflight'));
});


test('real preparation pins remain unbound; synthetic fixture is explicit and isolated',()=>{
 if(JSON.stringify(JSON.parse(readFileSync(new URL('./intake-bindings.json',import.meta.url),'utf8'))).includes('PENDING'))assert.throws(()=>requireBoundIntakePins(),/PENDING/);else requireBoundIntakePins();
 assert.doesNotThrow(()=>requireBoundIntakePins(sample.pins));
});
