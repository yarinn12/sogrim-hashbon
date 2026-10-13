import test from 'node:test';
import assert from 'node:assert/strict';
import {requireOwner,enableOwner,APP,BUILD,GROUP,OWNER,EMAIL_SHA,TARGET} from './owner-access-guard.mjs';
const state=()=>({appId:APP,build:{id:BUILD,attributes:{version:'193',processingState:'VALID',expired:false}},preRelease:{version:'4.58',platform:'IOS'},
 rawGroups:[{id:GROUP,attributes:{isInternalGroup:true,hasAccessToAllBuilds:false}},{id:'external',attributes:{isInternalGroup:false,hasAccessToAllBuilds:null,publicLinkEnabled:false}}],
 groups:[{id:GROUP,name:'Yarin Internal Testing',isInternalGroup:true,hasAccessToAllBuilds:false,publicLinkEnabled:null,builds:[{id:'old191',build:'191'}]},
 {id:'external',name:'Existing external',isInternalGroup:false,hasAccessToAllBuilds:null,publicLinkEnabled:false,builds:[{id:'old183',build:'183'}]}],
 members:[{id:OWNER,firstName:'Yarin',emailSha256:EMAIL_SHA,state:'INSTALLED'}],individualTesters:0,appStoreVersion:null,
 appStoreVersions:[{id:'oldstore',version:'4.57',state:'PENDING_DEVELOPER_RELEASE',releaseType:'MANUAL'}],
 betaState:{internalBuildState:'READY_FOR_BETA_TESTING',externalBuildState:'READY_FOR_BETA_SUBMISSION'},checkedAt:'fixture'});
test('exact owner-only group and existing VALID193 pass without granting database/public acceptance',()=>requireOwner(state()));
for(const [name,change] of [
 ['another build',s=>s.build.id='other'],['wrong number',s=>s.build.attributes.version='192'],['unprocessed',s=>s.build.attributes.processingState='PROCESSING'],
 ['expired',s=>s.build.attributes.expired=true],['wrong version',s=>s.preRelease.version='4.57'],['nonIOS',s=>s.preRelease.platform='MAC_OS'],
 ['internal auto access',s=>s.rawGroups[0].attributes.hasAccessToAllBuilds=true],['unknown auto access',s=>s.rawGroups[0].attributes.hasAccessToAllBuilds=null],
 ['external public link',s=>s.rawGroups[1].attributes.publicLinkEnabled=true],['extra group member',s=>s.members.push({...s.members[0],id:'other'})],
 ['different tester',s=>s.members[0].id='other'],['different account hash',s=>s.members[0].emailSha256='0'.repeat(64)],
 ['unknown name',s=>s.members[0].firstName='Other'],['invitation not installed',s=>s.members[0].state='INVITED'],
 ['individual exposure',s=>s.individualTesters=1],['public association',s=>s.appStoreVersion={id:'store458'}],
 ['external review',s=>s.betaState.externalBuildState='IN_BETA_REVIEW'],['external test distribution',s=>s.betaState.externalBuildState='IN_BETA_TESTING'],
 ['other group exposure',s=>s.groups[1].builds.push({id:BUILD,build:'193'})],['another app',s=>s.appId='other']
])test('owner visibility blocks '+name,()=>{const s=state();change(s);assert.throws(()=>requireOwner(s));});
test('audit is GET-only and grants no availability before actual association',async()=>{
 const s=state();const p=await enableOwner(async()=>{throw Error('no mutation expected')},{read:async()=>structuredClone(s)});
 assert.equal(p.ownerAvailability,false);assert.deepEqual(p.mutationsPerformed,[]);
});
test('enablement uses one exact group/build POST and verifies its real readback',async()=>{
 let linked=false,count=0;
 const read=async()=>{const s=state();if(linked)s.groups[0].builds.push({id:BUILD,build:'193'});return s;};
 const api=async(path,options)=>{count++;assert.equal(path,TARGET);assert.equal(options.method,'POST');assert.deepEqual(options.body,{data:[{type:'builds',id:BUILD}]});linked=true;};
 const p=await enableOwner(api,{mode:'enable_owner',read});assert.equal(count,1);assert.equal(p.ownerAvailability,true);
});
test('already enabled build is read back without a second POST',async()=>{
 const s=state();s.groups[0].builds.push({id:BUILD,build:'193'});
 const p=await enableOwner(async()=>{throw Error('duplicate POST')},{mode:'enable_owner',read:async()=>structuredClone(s)});
 assert.equal(p.ownerAvailability,true);assert.deepEqual(p.mutationsPerformed,[]);
});
test('lost POST response is not retried',async()=>{
 let count=0;await assert.rejects(enableOwner(async()=>{count++;throw Error('network outcome unknown');},{mode:'enable_owner',read:async()=>state()}));
 assert.equal(count,1);
});
test('membership drift is rejected before any owner-access mutation',async()=>{
 const s=state();s.members.push({...s.members[0],id:'other'});let count=0;
 await assert.rejects(enableOwner(async()=>{count++;},{mode:'enable_owner',read:async()=>s}));assert.equal(count,0);
});
test('changed public release record fails postflight without any extra mutation',async()=>{
 let count=0;const read=async()=>{const s=state();if(count){s.groups[0].builds.push({id:BUILD,build:'193'});s.appStoreVersions[0].state='READY_FOR_SALE';}return s;};
 await assert.rejects(enableOwner(async()=>{count++;},{mode:'enable_owner',read}));assert.equal(count,1);
});