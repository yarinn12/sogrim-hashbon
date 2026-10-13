import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const APP='6809952514',BUNDLE='com.sogrimhashbon.app';
export async function all(api,path){
  const rows=[];let next=path;
  for(let n=0;next&&n<20;n++){
    if(next.startsWith('http')){
      const u=new URL(next);assert.equal(u.origin,'https://api.appstoreconnect.apple.com');
      next=u.pathname+u.search;
    }
    assert.ok(next.startsWith('/v1/')&&!next.startsWith('//'));
    const result=await api(next,{method:'GET'});
    assert.ok(Array.isArray(result.data),'Incomplete Apple collection');
    rows.push(...result.data);next=result.links?.next;
  }
  assert.ok(!next,'Apple pagination incomplete');
  assert.equal(new Set(rows.map(x=>x.id)).size,rows.length,'Duplicate Apple resource');
  return rows;
}
export function requireManualGroups(groups){
  for(const group of groups){
    assert.equal(typeof group.attributes?.isInternalGroup,'boolean','Unknown internal/external group scope');
    assert.equal(group.attributes?.hasAccessToAllBuilds,false,
      'Automatic access is enabled or unknown for group '+group.id);
  }
}
function versionState(rows){
  return rows.map(v=>({id:v.id,version:v.attributes.versionString,state:v.attributes.appStoreState,
    releaseType:v.attributes.releaseType})).sort((a,b)=>a.id.localeCompare(b.id));
}
export async function collectState(api){
  const app=(await api('/v1/apps/'+APP,{method:'GET'})).data;
  assert.equal(app?.id,APP);assert.equal(app.attributes?.bundleId,BUNDLE);
  const groups=await all(api,'/v1/apps/'+APP+'/betaGroups?'+new URLSearchParams({
    'fields[betaGroups]':'name,isInternalGroup,hasAccessToAllBuilds,publicLinkEnabled',limit:'200'}));
  const groupStates=[];
  for(const g of groups){
    assert.ok(typeof g.id==='string'&&/^[A-Za-z0-9-]+$/.test(g.id));
    const detail=(await api('/v1/betaGroups/'+g.id,{method:'GET'})).data;
    assert.equal(detail?.id,g.id);assert.equal(detail?.type,'betaGroups');
    assert.equal(detail.attributes?.isInternalGroup,g.attributes?.isInternalGroup,'Group scope changed between reads');
    g.attributes={name:detail.attributes?.name,isInternalGroup:detail.attributes?.isInternalGroup,
      hasAccessToAllBuilds:detail.attributes?.hasAccessToAllBuilds,
      publicLinkEnabled:detail.attributes?.publicLinkEnabled};
    const builds=await all(api,'/v1/betaGroups/'+g.id+'/builds?'+new URLSearchParams({'fields[builds]':'version',limit:'200'}));
    groupStates.push({id:g.id,name:g.attributes?.name,isInternalGroup:g.attributes?.isInternalGroup,
      hasAccessToAllBuilds:g.attributes?.hasAccessToAllBuilds??null,
      publicLinkEnabled:g.attributes?.publicLinkEnabled??null,
      builds:builds.map(b=>({id:b.id,build:b.attributes?.version}))});
  }
  const versions=await all(api,'/v1/apps/'+APP+'/appStoreVersions?'+new URLSearchParams({
    'filter[platform]':'IOS','fields[appStoreVersions]':'versionString,appStoreState,releaseType',limit:'200'}));
  const matches=await all(api,'/v1/builds?'+new URLSearchParams({
    'filter[app]':APP,'filter[version]':'193','filter[preReleaseVersion.platform]':'IOS',limit:'200'}));
  assert.ok(matches.length<=1,'Ambiguous build193');
  return {appId:APP,groups:groupStates,rawGroups:groups,appStoreVersions:versionState(versions),
    build:matches[0]??null,checkedAt:new Date().toISOString(),mode:'GET_ONLY'};
}
export function requireIntakePreflight(snapshot){
  requireManualGroups(snapshot.rawGroups);
  assert.equal(snapshot.build,null,'Build193 exists; do not upload twice');
  for(const group of snapshot.groups)
    assert.ok(!group.builds.some(b=>b.build==='193'),'Build193 already assigned to group');
}
export async function verifyPostflight(api,before){
  const after=await collectState(api);requireManualGroups(after.rawGroups);
  assert.deepEqual(after.appStoreVersions,before.appStoreVersions,'App Store release record changed');
  const build=after.build;assert.ok(build?.id,'Missing processed193');
  assert.equal(build.attributes?.version,'193');
  assert.equal(build.attributes.processingState,'VALID');
  assert.equal(build.attributes.expired,false);
  const prerelease=(await api('/v1/builds/'+build.id+'/preReleaseVersion',{method:'GET'})).data;
  assert.equal(prerelease?.attributes?.version,'4.58');assert.equal(prerelease?.attributes?.platform,'IOS');
  for(const group of after.groups)
    assert.ok(!group.builds.some(b=>b.id===build.id||b.build==='193'),'193 assigned to group '+group.id);
  const testers=await all(api,'/v1/builds/'+build.id+'/individualTesters?'+
    new URLSearchParams({'fields[betaTesters]':'state',limit:'200'}));
  assert.equal(testers.length,0,'193 has individually assigned testers');
  const store=(await api('/v1/builds/'+build.id+'/relationships/appStoreVersion',{method:'GET'})).data;
  assert.equal(store,null,'193 linked to an App Store release record');
  const beta=(await api('/v1/builds/'+build.id+'/buildBetaDetail',{method:'GET'})).data;
  assert.ok(beta?.attributes,'Missing beta status');
  assert.ok(['READY_FOR_BETA_SUBMISSION','NOT_APPLICABLE'].includes(beta.attributes.externalBuildState),
    'Unexpected external review/distribution state');
  return {...after,rawGroups:undefined,build:{id:build.id,build:'193',version:'4.58',processingState:'VALID'},
    assignedGroups:[],assignedIndividualTesters:0,appStoreVersion:null,betaState:beta.attributes,
    scope:'PACKAGE_INTAKE_ONLY',databaseAccepted:false,publicReleaseAccepted:false,distributionAllowed:false};
}
async function main(){
  const phase=process.argv[2];assert.ok(['audit','preflight','postflight'].includes(phase));
  const {createAppStoreClient}=await import(pathToFileURL(resolve('scripts/lib/app-store-release.mjs')));
  const api=createAppStoreClient({issuerId:process.env.APPSTORE_ISSUER_ID,keyId:process.env.APPSTORE_API_KEY_ID,
    privateKey:process.env.APPSTORE_API_PRIVATE_KEY});
  if(phase==='postflight'){
    const before=JSON.parse(readFileSync('build/ios/intake-preflight.json','utf8'));
    const after=await verifyPostflight(api,before);
    writeFileSync('build/ios/intake-postflight.json',JSON.stringify(after,null,2)+'\n');
    console.log('IOS193_INTAKE_POSTFLIGHT:'+JSON.stringify(after));return;
  }
  const snapshot=await collectState(api);
  if(phase==='preflight'){
    let previous;
    try{previous=JSON.parse(readFileSync('build/ios/intake-preflight.json','utf8'));}
    catch(error){if(error.code!=='ENOENT')throw error;}
    if(previous)assert.deepEqual(snapshot.appStoreVersions,previous.appStoreVersions,'App Store state changed during intake preparation');
  }
  const safe={...snapshot,rawGroups:undefined,build:snapshot.build?{id:snapshot.build.id,...snapshot.build.attributes}:null};
  writeFileSync('build/ios/intake-'+phase+'.json',JSON.stringify(snapshot,null,2)+'\n');
  console.log('IOS193_INTAKE_'+phase.toUpperCase()+':'+JSON.stringify(safe));
  if(phase==='preflight')requireIntakePreflight(snapshot);
}
if(import.meta.url.startsWith('file:')&&process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))await main();
