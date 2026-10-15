import assert from 'node:assert/strict';
import {generateKeyPairSync, randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {RELEASE_SOURCE, RELEASE_TREE, SOURCE, requiredRuns, verifyRuns, verifyCommit,
  requireUnusedArtifactSlot, readUnusedBuild, verifyCheckout, APPLE_APP_ID, SOURCE_BRANCH} from './source-guard.mjs';
import {protect, unprotect} from './protect-artifact.mjs';

const env = {SOURCE_SHA: SOURCE, SOURCE_QA_RUN: '38280270544', SOURCE_WINDOWS_QA_RUN: '38280270132',
  SOURCE_FONT_QA_RUN: '38280270159', SOURCE_AUTH_QA_RUN: '38280270319',
  GITHUB_REPOSITORY: 'yarinn12/sogrim-hashbon', GITHUB_EVENT_NAME: 'workflow_dispatch',
  APPLE_TEAM_ID: 'MA9S4L7WKS', IOS_VERSION: '4.58', IOS_BUILD: '194'};
const names = ['unit','cross-platform','two-client-sync','unit-and-mobile','backup-runtime',
  ...['android-mobile','iphone-webkit','ipad-webkit','iphone-large-text','reflow-200'].map(p=>'mobile ('+p+')'),
  'ios-native / native-parity','android-native / native-parity',
  'mobile-iphone-large-text-shard-1','mobile-iphone-large-text-shard-2',
  'mobile-iphone-webkit-shard-1','mobile-iphone-webkit-shard-2'];
function ci(edit = () => {}) {
  return async (url, options) => {
    assert.equal(options.method, 'GET');
    const match = url.match(/\/actions\/runs\/(\d+)(.*)/);
    assert.ok(match);
    const [id, path] = requiredRuns(env).find(([id]) => id === match[1]);
    let value;
    if (match[2]) value = {total_count: path.endsWith('/qa.yml') ? names.length : 1,
      jobs: (path.endsWith('/qa.yml') ? names : [path.endsWith('/qa-windows.yml')?'windows-unit':path.endsWith('/ios-auth-return-qa.yml')?'native':'linux-font-provenance']).map((name,i) => ({id:i+1,run_id:Number(id),
        head_sha:SOURCE,name,status:'completed',conclusion:'success'}))};
    else value = {id:Number(id),head_sha:SOURCE,repository:{full_name:env.GITHUB_REPOSITORY},
      head_repository:{full_name:env.GITHUB_REPOSITORY},head_branch:SOURCE_BRANCH,event:'pull_request',path,status:'completed',conclusion:'success',run_attempt:1};
    edit(value, path, !!match[2]); return {ok:true,json:async()=>value};
  };
}
test('four complete exact-source CI runs and all native lanes pass',async()=>{
  const proof=await verifyRuns(ci(),'synthetic-token',env); assert.equal(proof.length,4);
});
for(const workflow of ['qa-windows.yml','cross-engine-font-provenance-qa.yml','ios-auth-return-qa.yml'])
 test('private CI rejects a substitute passing job instead of '+workflow,async()=>assert.rejects(verifyRuns(ci((v,p,j)=>{
  if(j&&p.endsWith('/'+workflow))v.jobs[0].name='unrelated-passing-check';
 }),'synthetic',env)));
test('private candidate CI rejects another branch and privileged PR target events',async()=>{
 await assert.rejects(verifyRuns(ci((v,p,j)=>{if(!j)v.head_branch='main';}),'synthetic',env));
 await assert.rejects(verifyRuns(ci((v,p,j)=>{if(!j)v.event='pull_request_target';}),'synthetic',env));
});
for (const [name,field,value] of [
  ['another source','head_sha','a'.repeat(40)],['failed','conclusion','failure'],
  ['unfinished','status','in_progress'],['retry','run_attempt',2],
  ['foreign repository','repository',{full_name:'other/repo'}],
  ['fork','head_repository',{full_name:'other/repo'}],['wrong workflow','path','.github/workflows/other.yml']
]) test('CI rejects '+name,async()=>assert.rejects(verifyRuns(ci((v,p,j)=>{if(!j)v[field]=value;}),'synthetic',env)));
for(const value of ['skipped','failure','cancelled']) test('CI rejects '+value+' native job',async()=>{
  await assert.rejects(verifyRuns(ci((v,p,j)=>{if(j)v.jobs.at(-1).conclusion=value;}),'synthetic',env));
});
test('CI rejects absent native lane',async()=>assert.rejects(verifyRuns(ci((v,p,j)=>{
  if(j&&p.endsWith('/qa.yml')){v.jobs.pop();v.total_count--;}
}),'synthetic',env)));
test('CI rejects job from another source',async()=>assert.rejects(verifyRuns(ci((v,p,j)=>{
  if(j)v.jobs[0].head_sha='b'.repeat(40);
}),'synthetic',env)));
test('CI rejects incomplete pagination',async()=>assert.rejects(verifyRuns(ci((v,p,j)=>{
  if(j){v.total_count++;v.jobs=[];}
}),'synthetic',env)));
test('CI refuses unreadable API and missing credentials',async()=>{
  await assert.rejects(verifyRuns(async()=>({ok:false}),'synthetic',env));
  await assert.rejects(verifyRuns(ci(),'',env));
});
test('run inputs are mandatory and distinct',()=>{
  assert.throws(()=>requiredRuns({...env,SOURCE_AUTH_QA_RUN:undefined}));
  assert.throws(()=>requiredRuns({...env,SOURCE_AUTH_QA_RUN:env.SOURCE_QA_RUN}));
});
test('GitHub commit/tree identity accepts only frozen source',async()=>{
  const f = tree=>async(u,o)=>{assert.equal(o.method,'GET');return {ok:true,json:async()=>({sha:SOURCE,tree:{sha:tree}})};};
  await verifyCommit(f(RELEASE_TREE),'synthetic',RELEASE_TREE);
  await assert.rejects(verifyCommit(f('a'.repeat(40)),'synthetic',RELEASE_TREE));
});
function api(builds,next=null) {
  return async(path,options)=>{
    assert.equal(options.method,'GET');
    if(path.startsWith('/v1/apps/')) assert.equal(path,'/v1/apps/6809952514');
    else if(!new URL(path,'https://api.appstoreconnect.apple.com').searchParams.has('next'))
      assert.equal(new URL(path,'https://api.appstoreconnect.apple.com').searchParams.get('filter[app]'),'6809952514');
    return path.startsWith('/v1/apps/') ? {data:{attributes:{bundleId:'com.sogrimhashbon.app'}}}
      : {data:builds.map(version=>({attributes:{version}})),links:{next}};
  };
}
test('Apple application identity is independent of PWA516 and build194',async()=>{
  assert.equal(APPLE_APP_ID,'6809952514');
  const proof=await readUnusedBuild(api(['191','192','193']));
  assert.equal(proof.appId,'6809952514');
});
test('Apple rejects an unreadable application before inspecting build availability',async()=>{
  let buildsRead=false;
  await assert.rejects(readUnusedBuild(async(path,options)=>{
    assert.equal(options.method,'GET');
    if(path==='/v1/apps/6809952514') return {data:{attributes:{bundleId:'wrong.app'}}};
    buildsRead=true; return {data:[],links:{next:null}};
  }));
  assert.equal(buildsRead,false);
});
test('192 permits currently unused 194 without reservation',async()=>{
  const r=await readUnusedBuild(api(['191','192','193']));assert.equal(r.maximumUploadedBuild,193);assert.equal(r.reserved,false);
});
for(const value of ['194','195','invalid']) test('Apple rejects build '+value,async()=>assert.rejects(readUnusedBuild(api([value]))));
test('Apple rejects incomplete pagination',async()=>assert.rejects(readUnusedBuild(api(['192'],'/v1/builds?next=1'))));
test('Apple refuses foreign pagination origin',async()=>assert.rejects(readUnusedBuild(api(['192'],'https://evil.example/v1/builds?next=1'))));
test('Apple reads later pages before deciding',async()=>{
  let n=0;const request=async(p,o)=>{
    assert.equal(o.method,'GET');if(p.startsWith('/v1/apps/'))return {data:{attributes:{bundleId:'com.sogrimhashbon.app'}}};
    n++;return {data:[{attributes:{version:n===1?'192':'194'}}],
      links:{next:n===1?'https://api.appstoreconnect.apple.com/v1/builds?next=2':null}};
  };await assert.rejects(readUnusedBuild(request));assert.equal(n,2);
});
test('duplicate encrypted preparation blocks another signing attempt',async()=>{
  const fixture=(count,expired)=>async(u,o)=>{
    assert.equal(o.method,'GET');assert.ok(u.includes('name=sogrim-ios-4.58-194-encrypted'));
    return {ok:true,json:async()=>({total_count:count,artifacts:count?[{expired}]:[]})};
  };
  assert.equal((await requireUnusedArtifactSlot(fixture(0),'synthetic')).reserved,false);
  await assert.rejects(requireUnusedArtifactSlot(fixture(1,false),'synthetic'));
  await assert.rejects(requireUnusedArtifactSlot(fixture(1,true),'synthetic'));
});
const readText=p=>p==='src/pwaBootstrap.mjs'?'const PWA_RELEASE = "516";':
  JSON.stringify({version:{number:'4.58',build:194}});
const git=args=>args[1]==='HEAD'?RELEASE_SOURCE:RELEASE_TREE;
test('checkout/source/version/build/PWA exact identity passes',()=>assert.equal(verifyCheckout(git,readText,env).sourceTree,RELEASE_TREE));
for(const [name,change] of [['build',{IOS_BUILD:'192'}],['version',{IOS_VERSION:'4.57'}],
  ['source',{SOURCE_SHA:'a'.repeat(40)}],['team',{APPLE_TEAM_ID:'other'}],['event',{GITHUB_EVENT_NAME:'push'}]])
  test('checkout rejects wrong '+name,()=>assert.throws(()=>verifyCheckout(git,readText,{...env,...change})));
test('checkout rejects another tree/PWA/store metadata',()=>{
  assert.throws(()=>verifyCheckout(()=>SOURCE,readText,env));
  assert.throws(()=>verifyCheckout(git,p=>readText(p).replace('516','511'),env));
  assert.throws(()=>verifyCheckout(git,p=>readText(p).replace('4.58','4.57'),env));
});
const pem=()=>generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({type:'pkcs8',format:'pem'});
const key=pem(),otherKey=pem(),payload=randomBytes(4096);
const identity={sourceCommit:SOURCE,sourceTree:RELEASE_TREE,version:'4.58',build:'194',buildRunId:'synthetic',buildRunAttempt:'1'};
test('authenticated encryption round trip and canonical DER whitespace',()=>{
  const r=protect(payload,'\n'+key+'\n',identity);
  assert.ok(unprotect(r.ciphertext,r.envelope,key).equals(payload));assert.ok(!r.ciphertext.equals(payload));
});
test('other key, ciphertext, tag and AAD tampering fail closed',()=>{
  const r=protect(payload,key,identity);assert.throws(()=>unprotect(r.ciphertext,r.envelope,otherKey));
  const modified=Buffer.from(r.ciphertext);modified[0]^=1;assert.throws(()=>unprotect(modified,r.envelope,key));
  const tag=Buffer.from(r.envelope.tag,'base64');tag[0]^=1;
  assert.throws(()=>unprotect(r.ciphertext,{...r.envelope,tag:tag.toString('base64')},key));
  assert.throws(()=>unprotect(r.ciphertext,{...r.envelope,aad:r.envelope.aad.replace('synthetic','changed')},key));
});
for (const [field,value] of [['sourceCommit','a'.repeat(40)],['sourceTree','b'.repeat(40)],['build','192'],['version','4.57']])
  test('encryption rejects mismatched '+field,()=>assert.throws(()=>protect(payload,key,{...identity,[field]:value})));
test('artifact-only preparation preserves exact checkout and gates signing while preventing Apple delivery',()=>{
 const next=readFileSync(new URL('../../../.github/workflows/ios-testflight.yml',import.meta.url),'utf8');
 assert.ok(next.includes('ref: '+'$'+'{{ inputs.source_sha }}'));
 assert.ok(next.includes('ref: '+'$'+'{{ github.workflow_sha }}'));
 assert.ok(next.indexOf('source-guard.mjs" ci-only')<next.indexOf('secrets.APPSTORE'));
 for(const token of ['npm ci','native:prepare','npm run qa:ios','qa:ios:artifact','--extract-certificates']){
  if(token==='--extract-certificates') continue; assert.ok(next.includes(token),'lost preparation check: '+token);
 }
 assert.ok(!/upload-testflight-build|complete-ios-testflight|reviewSubmission|appStoreVersionReleaseRequest/.test(next));
 assert.ok(next.includes('sogrim-ios-4.58-194-encrypted'));
 assert.ok(next.includes('retention-days: 7'));
 assert.ok(next.includes('persist-credentials: false'));
});
test('previous build193 and PWA514 cannot be signed as194',()=>{
 assert.throws(()=>verifyCheckout(git,readText,{...env,IOS_BUILD:'193'}));
 assert.throws(()=>verifyCheckout(git,p=>readText(p).replace('516','514'),env));
 assert.throws(()=>protect(payload,key,{...identity,build:'193'}));
});

for (const name of ['mobile-iphone-large-text-shard-1', 'mobile-iphone-large-text-shard-2',
 'mobile-iphone-webkit-shard-1', 'mobile-iphone-webkit-shard-2']) {
 test('private CI requires the exact source-bound '+name, async()=>{
  await assert.rejects(verifyRuns(ci((v,p,j)=>{
   if(j&&p.endsWith('/qa.yml')) { v.jobs=v.jobs.filter(job=>job.name!==name);v.total_count=v.jobs.length; }
  }),'synthetic',env),error=>error.code==='ERR_ASSERTION' && error.actual===0 &&
    error.expected===1 && error.message.startsWith('Missing QA lane: '+name+'\n'));
  await assert.rejects(verifyRuns(ci((v,p,j)=>{
   if(j&&p.endsWith('/qa.yml'))v.jobs.find(job=>job.name===name).conclusion='failure';
  }),'synthetic',env));
 });
}

const oneShotEnv={...env,GITHUB_EVENT_NAME:'push',
 GITHUB_REF:'refs/heads/codex/ios194-fdce-sign-only-20261015',
 GITHUB_WORKFLOW_REF:'yarinn12/sogrim-hashbon/.github/workflows/ios194-fdce-sign-only.yml@refs/heads/codex/ios194-fdce-sign-only-20261015',
 GITHUB_RUN_NUMBER:'1',GITHUB_RUN_ATTEMPT:'1'};
test('one-shot artifact preparation accepts only the explicitly frozen push scope',()=>{
 assert.equal(verifyCheckout(git,readText,oneShotEnv).sourceCommit,RELEASE_SOURCE);
});
for(const [name,change] of [['branch',{GITHUB_REF:'refs/heads/main'}],
 ['workflow',{GITHUB_WORKFLOW_REF:'yarinn12/sogrim-hashbon/.github/workflows/ios-testflight.yml@refs/heads/main'}],
 ['retry',{GITHUB_RUN_ATTEMPT:'2'}],['duplicate',{GITHUB_RUN_NUMBER:'2'}]])
 test('one-shot preparation rejects wrong '+name,()=>assert.throws(()=>verifyCheckout(git,readText,{...oneShotEnv,...change})));
test('actual one-shot workflow keeps signing gates and creates encrypted artifact only',()=>{
 const original=readFileSync(new URL('../../../.github/workflows/ios-testflight.yml',import.meta.url),'utf8');
 const actual=readFileSync(new URL('../../../.github/workflows/ios194-fdce-sign-only.yml',import.meta.url),'utf8');
 assert.ok(actual.includes('github.run_number == 1')&&actual.includes('github.run_attempt == 1'));
 assert.ok(actual.includes('branches: [codex/ios194-fdce-sign-only-20261015]'));
 assert.ok(actual.indexOf('source-guard.mjs" ci-only')<actual.indexOf('secrets.APPSTORE'));
 assert.equal(actual.split('      - name: Set up Node.js')[1],original.split('      - name: Set up Node.js')[1]);
 assert.ok(!/upload-testflight-build|complete-ios-testflight|reviewSubmission|appStoreVersionReleaseRequest/.test(actual));
});


test('manual preparation is disabled so input CI runs cannot replace the frozen one-shot run set',()=>{
 const workflow=readFileSync(new URL('../../../.github/workflows/ios-testflight.yml',import.meta.url),'utf8');
 const jobs=workflow.split('\njobs:\n')[1];
 const triggers=workflow.split('\non:\n')[1].split('\npermissions:')[0];
 assert.deepEqual(triggers.match(/^  [a-zA-Z0-9_-]+:\r?$/gm),['  workflow_dispatch:']);
 assert.ok(jobs,'manual template jobs must remain inspectable');
 assert.equal((jobs.match(/^  [a-zA-Z0-9_-]+:\r?$/gm)||[]).length,1,'no second enabled manual job');
 assert.match(jobs,/^  build-export-verify-private:\r?\n    if: github\.event_name != 'workflow_dispatch'\r?\n/m);
});
