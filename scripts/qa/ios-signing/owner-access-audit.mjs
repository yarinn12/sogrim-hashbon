import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {all} from './intake-distribution-guard.mjs';
const APP='6809952514',BUILD='10837c40-5e4f-464d-b71e-ea6e28c0446f',GROUP='4646e3de-7401-4e70-ac32-9a00072e1376';
const {createAppStoreClient}=await import(pathToFileURL(resolve('scripts/lib/app-store-release.mjs')));
const api=createAppStoreClient({issuerId:process.env.APPSTORE_ISSUER_ID,keyId:process.env.APPSTORE_API_KEY_ID,privateKey:process.env.APPSTORE_API_PRIVATE_KEY});
const a=(await api('/v1/apps/'+APP,{method:'GET'})).data;
assert.equal(a.id,APP);assert.equal(a.attributes.bundleId,'com.sogrimhashbon.app');
const b=(await api('/v1/builds/'+BUILD,{method:'GET'})).data;
assert.equal(b.id,BUILD);assert.equal(b.attributes.version,'193');assert.equal(b.attributes.processingState,'VALID');assert.equal(b.attributes.expired,false);
const v=(await api('/v1/builds/'+BUILD+'/preReleaseVersion',{method:'GET'})).data;
assert.equal(v.attributes.version,'4.58');assert.equal(v.attributes.platform,'IOS');
const g=(await api('/v1/betaGroups/'+GROUP,{method:'GET'})).data;
assert.equal(g.id,GROUP);assert.equal(g.attributes.isInternalGroup,true);assert.equal(g.attributes.hasAccessToAllBuilds,false);
const members=await all(api,'/v1/betaGroups/'+GROUP+'/betaTesters?'+new URLSearchParams({'fields[betaTesters]':'email,firstName,lastName,state',limit:'200'}));
const linked=await all(api,'/v1/betaGroups/'+GROUP+'/builds?'+new URLSearchParams({'fields[builds]':'version',limit:'200'}));
const result={appId:APP,buildId:BUILD,version:'4.58',build:'193',groupId:GROUP,groupName:g.attributes.name,isInternalGroup:true,hasAccessToAllBuilds:false,
 memberCount:members.length,members:members.map(m=>({id:m.id,firstName:m.attributes.firstName,
 emailMask:typeof m.attributes.email==='string'?m.attributes.email.replace(/^(.).*(@.*)$/,'$1***$2'):null,
 emailSha256:typeof m.attributes.email==='string'?createHash('sha256').update(m.attributes.email.trim().toLowerCase()).digest('hex'):null,state:m.attributes.state})),
 buildAlreadyAssigned:linked.some(x=>x.id===BUILD),checkedAt:new Date().toISOString(),scope:'OWNER_ACCESS_READONLY',mutationsPerformed:[]};
writeFileSync('build/ios/owner-access-audit.json',JSON.stringify(result,null,2)+'\n');
console.log('IOS193_OWNER_ACCESS_AUDIT:'+JSON.stringify(result));