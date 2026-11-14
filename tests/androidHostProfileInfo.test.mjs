import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {queryKernelInfo} from '../scripts/qa/android-host-profile/profiler.mjs';
import {profilerEnvironment} from '../scripts/qa/android-host-profile/profile-contract.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/android-host-profile-f101-nonroot-info.json',import.meta.url),'utf8'));

test('actual f101 root-required metadata failure is avoided through the guarded privileged helper',()=>{
  const context={environment:profilerEnvironment({sdk:'/sdk',home:'/owned/home',temp:'/owned/temp',avdHome:'/owned/avds'})},tool={tool:fixture.file},config='/owned/profile-config.json',calls=[];
  const result=queryKernelInfo(context,tool,config,{timeout:2500,execute:(file,args,env,options)=>{
    calls.push({file,args,env,options});
    // Faithful recorded response to the original nonprivileged query. This
    // fixture is not proof of actual privileged BPF/kernel compatibility.
    if(file===fixture.file&&args.length===1&&args[0]==='--info')return fixture;
    assert.equal(file,'/usr/bin/sudo');assert.deepEqual(args.slice(0,5),['-n','--','/usr/bin/python3','-I','-B']);assert.match(args[5],/root-control\.py$/);assert.deepEqual(args.slice(6),['info',config]);
    return {file,args,exitCode:0,signal:null,error:null,stdout:'synthetic privileged feature metadata',stderr:''};
  }});
  assert.equal(result.exitCode,0,fixture.stderr.trim());assert.equal(calls.length,1);assert.deepEqual(calls[0].env,context.environment);assert.equal(calls[0].options.timeout,2500);
});

test('metadata failures retain nonzero status instead of weakening the exit-zero requirement',()=>{
  const error={exitCode:1,signal:null,error:null,stdout:'',stderr:'synthetic kernel query failure'};
  const result=queryKernelInfo({environment:{}},{tool:fixture.file},'/owned/config',{execute:()=>error});assert.equal(result,error);assert.equal(result.exitCode,1);
  const source=readFileSync(new URL('../scripts/qa/android-host-profile/profiler.mjs',import.meta.url),'utf8');assert.match(source,/requireCommand\(info,'BPF\/kernel feature query'\)/);
});

test('foreign profiler metadata request is rejected before any privileged launch',()=>{
  let executed=false;assert.throws(()=>queryKernelInfo({environment:{}},{tool:'/private/profiler'},'/owned/config',{execute:()=>{executed=true;}}),/pinned official profiler/);assert.equal(executed,false);
});
