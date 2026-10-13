import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {all,collectState,requireManualGroups} from './intake-distribution-guard.mjs';
export const APP='6809952514',BUILD='10837c40-5e4f-464d-b71e-ea6e28c0446f',GROUP='4646e3de-7401-4e70-ac32-9a00072e1376';
export const OWNER='5d2040f0-3af9-4d98-a188-fd6eeb5547db',EMAIL_SHA='004ec2efff572434a5fd20635e1d32b406e494a5a9ea932d539734b248143a85';
export const TARGET='/v1/betaGroups/'+GROUP+'/relationships/builds';
export function requireOwner(state,{assigned=false}={}){
 assert.equal(state.appId,APP);assert.equal(state.build?.id,BUILD);
 assert.equal(state.build.attributes.version,'193');assert.equal(state.build.attributes.processingState,'VALID');assert.equal(state.build.attributes.expired,false);
 assert.equal(state.preRelease.version,'4.58');assert.equal(state.preRelease.platform,'IOS');
 requireManualGroups(state.rawGroups);
 const group=state.groups.find(g=>g.id===GROUP);assert.ok(group,'Existing owner group must belong to this app');
 assert.equal(group.name,'Yarin Internal Testing');assert.equal(group.isInternalGroup,true);assert.equal(group.hasAccessToAllBuilds,false);
 assert.equal(state.members.length,1,'Only the existing sole owner can receive this build');
 assert.equal(state.members[0].id,OWNER);assert.equal(state.members[0].emailSha256,EMAIL_SHA);assert.equal(state.members[0].firstName,'Yarin');assert.equal(state.members[0].state,'INSTALLED');
 assert.equal(state.individualTesters,0);assert.equal(state.appStoreVersion,null);
 assert.equal(state.betaState.externalBuildState,'READY_FOR_BETA_SUBMISSION');
 assert.ok(['READY_FOR_BETA_TESTING','IN_BETA_TESTING'].includes(state.betaState.internalBuildState));
 for(const g of state.groups){
  const receives=g.builds.some(b=>b.id===BUILD||b.build==='193');
  assert.equal(receives,g.id===GROUP&&assigned,'Unexpected193 exposure in group '+g.id);
 }
 return true;
}
export async function readOwnerState(api){
 const state=await collectState(api);
 const pre=(await api('/v1/builds/'+BUILD+'/preReleaseVersion',{method:'GET'})).data;
 state.preRelease=pre.attributes;
 const members=await all(api,'/v1/betaGroups/'+GROUP+'/betaTesters?'+new URLSearchParams({'fields[betaTesters]':'email,firstName,state',limit:'200'}));
 state.members=members.map(m=>({id:m.id,firstName:m.attributes.firstName,state:m.attributes.state,
  emailSha256:typeof m.attributes.email==='string'?createHash('sha256').update(m.attributes.email.trim().toLowerCase()).digest('hex'):null}));
 state.individualTesters=(await all(api,'/v1/builds/'+BUILD+'/individualTesters?'+new URLSearchParams({'fields[betaTesters]':'state',limit:'200'}))).length;
 state.appStoreVersion=(await api('/v1/builds/'+BUILD+'/relationships/appStoreVersion',{method:'GET'})).data;
 state.betaState=(await api('/v1/builds/'+BUILD+'/buildBetaDetail',{method:'GET'})).data.attributes;
 return state;
}
function unchangedGroups(before,after){
 const normalized=s=>s.groups.map(g=>({...g,builds:g.builds.filter(b=>b.id!==BUILD&&b.build!=='193').sort((a,b)=>a.id.localeCompare(b.id))})).sort((a,b)=>a.id.localeCompare(b.id));
 assert.deepEqual(normalized(after),normalized(before),'Previous builds or group settings changed');
 assert.deepEqual(after.appStoreVersions,before.appStoreVersions,'Store release record changed');
 assert.deepEqual(after.members,before.members,'Owner group membership changed');
}
export async function enableOwner(api,{mode='audit',read=readOwnerState}={}){
 assert.ok(['audit','enable_owner'].includes(mode));
 const before=await read(api);
 const already=before.groups.find(g=>g.id===GROUP)?.builds.some(b=>b.id===BUILD);
 requireOwner(before,{assigned:already});
 if(mode==='audit')return {before,after:before,mutationsPerformed:[],ownerAvailability:already};
 let mutation=false;
 if(!already){
  await api(TARGET,{method:'POST',body:{data:[{type:'builds',id:BUILD}]}});
  mutation=true;
 }
 let after=await read(api);
 // Read propagation only. The POST is never retried because a lost response may have succeeded.
 for(let n=0;n<10&&!after.groups.find(g=>g.id===GROUP)?.builds.some(b=>b.id===BUILD);n++){
  await new Promise(r=>setTimeout(r,2000));after=await read(api);
 }
 requireOwner(after,{assigned:true});unchangedGroups(before,after);
 return {before,after,mutationsPerformed:mutation?[{method:'POST',path:TARGET,buildId:BUILD}]:[],ownerAvailability:true};
}
async function main(){
 const mode=process.argv[2];assert.ok(['audit','enable_owner'].includes(mode));
 if(mode==='enable_owner')assert.equal(process.env.GITHUB_EVENT_NAME,'workflow_dispatch','Owner enablement cannot run on push');
 const {createAppStoreClient}=await import(pathToFileURL(resolve('scripts/lib/app-store-release.mjs')));
 const api=createAppStoreClient({issuerId:process.env.APPSTORE_ISSUER_ID,keyId:process.env.APPSTORE_API_KEY_ID,privateKey:process.env.APPSTORE_API_PRIVATE_KEY});
 const result=await enableOwner(api,{mode});
 const receipt={checkedAt:result.after.checkedAt,appId:APP,version:'4.58',build:'193',buildId:BUILD,sourceCommit:'bf254b5235deb706234b00362e6eaea78e129e98',
  sourceTree:'4a208e596cbaf0576cccd7f67fc99a665287836d',groupId:GROUP,groupName:'Yarin Internal Testing',ownerTesterId:OWNER,ownerCount:1,
  ownerAvailability:result.ownerAvailability,hasAccessToAllBuilds:false,otherAssignedGroups:[],individualTesters:0,appStoreVersion:null,
  appStoreVersions:result.after.appStoreVersions,betaState:result.after.betaState,mutationsPerformed:result.mutationsPerformed,
  scope:'PERSONAL_TESTFLIGHT_VISIBILITY',databaseAccepted:false,productionUsageAccepted:false,publicReleaseAccepted:false,rebuilt:false};
 writeFileSync('build/ios/owner-access-receipt.json',JSON.stringify(receipt,null,2)+'\n');
 console.log('IOS193_OWNER_ACCESS_RECEIPT:'+JSON.stringify(receipt));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))await main();