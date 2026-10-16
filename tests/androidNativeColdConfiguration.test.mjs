import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {
  beginColdMatrix,launchColdFontCase,launchColdGeometry,launchColdJourney,restoreColdMatrix,
  restoreColdPages,setColdFontScale,
} from '../scripts/qa/android-native-isolated/cold-configuration.mjs';

// A font-scale write while the old Activity is alive models Android's recorded
// CONFIG_FONT_SCALE relaunch. This is a boundary fake, not emulator evidence.
function boundary({alive=true,font='1.5',staleStop=false,restartOnWrite=false,failConfig=false,failProcessRead=false,processStatus,badReadback}={}){
  const events=[];let currentAlive=alive,currentFont=font,relaunches=0,launches=0;
  const adb=args=>{
    const key=args.join(' ');
    events.push(key);
    if(args[1]==='am'&&args[2]==='force-stop'){
      assert.equal(args[3],'com.sogrimhashbon.app.debug');
      if(!staleStop)currentAlive=false;
      return '';
    }
    if(args[1]==='settings'&&args[2]==='get')return badReadback??currentFont;
    if(args[1]==='settings'&&['put','delete'].includes(args[2])){
      if(failConfig)throw new Error('OS configuration write failed');
      if(args[4]==='font_scale'){
        const next=args[2]==='delete'?'null':args[5];
        if(currentAlive&&next!==currentFont)relaunches++;
        currentFont=next;
      }
      if(restartOnWrite)currentAlive=true;
      return '';
    }
    if(args[1]==='wm'&&args[2]==='user-rotation'){
      if(failConfig)throw new Error('OS rotation write failed');
      if(restartOnWrite)currentAlive=true;
      return '';
    }
    throw new Error('Unexpected ADB call: '+key);
  };
  const adbStatus=args=>{
    assert.deepEqual(args,['shell','pidof','com.sogrimhashbon.app.debug']);
    events.push('status '+args.join(' '));
    if(failProcessRead)throw new Error('ADB process observation failed');
    return processStatus??{status:currentAlive?0:1,stdout:currentAlive?'4321\n':'',stderr:''};
  };
  const sleep=async ms=>{events.push('sleep '+ms);};
  const launch=async()=>{events.push('launch');launches++;currentAlive=true;return {native:true};};
  const launchForOwnedOrientation=async options=>{events.push('orientation');return {page:await options.launch(),receipt:{orientation:options.orientation}};};
  return {adb,adbStatus,sleep,launch,launchForOwnedOrientation,events,relaunches:()=>relaunches,launches:()=>launches,font:()=>currentFont};
}

test('matrix cold case stops the previous Activity before font configuration and its one launch',async()=>{
  const b=boundary(),result=await launchColdFontCase({...b,value:2,orientation:'portrait',rotation:0});
  assert.equal(result.receipt.orientation,'portrait');
  assert.equal(b.relaunches(),0);
  assert.equal(b.launches(),1);
  assert.ok(b.events.indexOf('shell am force-stop com.sogrimhashbon.app.debug')<b.events.indexOf('shell settings put system font_scale 2'));
  assert.ok(b.events.indexOf('shell settings put system font_scale 2')<b.events.indexOf('launch'));
  assert.equal(b.font(),'2');
});

test('a stale owned process prevents a font write and launch',async()=>{
  const b=boundary({staleStop:true});
  await assert.rejects(launchColdFontCase({...b,value:2,orientation:'portrait',rotation:0}),/remained live/);
  assert.equal(b.relaunches(),0);
  assert.equal(b.launches(),0);
  assert.ok(!b.events.some(value=>value.includes('settings put system font_scale')));
});

test('a failed process observation or OS write never starts the Activity',async()=>{
  for(const options of [{failProcessRead:true},{failConfig:true}]){
    const b=boundary(options);
    await assert.rejects(launchColdFontCase({...b,value:2,orientation:'portrait',rotation:0}),/observation failed|write failed/);
    assert.equal(b.launches(),0);
  }
});

test('only pidof exit 1 with empty stdout and stderr means the process is absent',async()=>{
  for(const processStatus of [
    {status:127,stdout:'',stderr:'pidof: not found'},
    {status:1,stdout:'',stderr:'device offline'},
    {status:1,stdout:'4321',stderr:''},
    {status:0,stdout:'garbage',stderr:''},
    {status:0,stdout:'',stderr:''},
  ]){
    const b=boundary({alive:false,processStatus});
    await assert.rejects(launchColdFontCase({...b,value:2,orientation:'portrait',rotation:0}),/observation failed|remained live/);
    assert.equal(b.launches(),0);
    assert.ok(!b.events.some(value=>value.includes('settings put system font_scale')));
  }
});

test('malformed, empty and infinite font readbacks fail closed before launch',async()=>{
  for(const badReadback of ['garbage','','Infinity']){
    const b=boundary({badReadback});
    await assert.rejects(launchColdFontCase({...b,value:2,orientation:'portrait',rotation:0}),/readback differs/);
    assert.equal(b.launches(),0);
  }
});

test('the direct pidof argv is accepted through an actual child process exit status',async()=>{
  const b=boundary();
  const program=`if(process.argv.slice(1).join(' ')!=='shell pidof com.sogrimhashbon.app.debug'){process.stderr.write('bad argv');process.exit(127)}process.exit(1)`;
  const adbStatus=args=>spawnSync(process.execPath,['-e',program,...args],{encoding:'utf8'});
  const result=await setColdFontScale({...b,adbStatus,value:2,settleMs:0});
  assert.ok(result.processReadbacks.length>=3);
  assert.ok(result.processReadbacks.every(row=>row.status===1&&row.stdout===''&&row.stderr===''));
});

test('a process appearing during configuration is rejected before launch',async()=>{
  const b=boundary({restartOnWrite:true});
  await assert.rejects(launchColdFontCase({...b,value:2,orientation:'portrait',rotation:0}),/remained live/);
  assert.equal(b.launches(),0);
});

test('matrix setup and restoration keep OS writes outside the old Activity',async()=>{
  const b=boundary();
  await beginColdMatrix(b);
  await restoreColdMatrix({...b,original:{font_scale:'1.0',accelerometer_rotation:'1',user_rotation:'0'}});
  assert.equal(b.relaunches(),0);
  assert.equal(b.font(),'1.0');
  assert.ok(b.events.includes('shell wm user-rotation lock 0'));
  assert.equal(b.launches(),0);
});

test('pages restoration stops the last Activity before returning OS font and rotation',async()=>{
  const b=boundary({font:'2'});
  await restoreColdPages({...b,originalScale:'1.0',originalRotation:'0'});
  assert.equal(b.relaunches(),0);
  assert.equal(b.font(),'1.0');
  assert.equal(b.launches(),0);
  assert.ok(b.events.indexOf('shell am force-stop com.sogrimhashbon.app.debug')<b.events.indexOf('shell settings put system font_scale 1.0'));
});

test('journey cold setup prevents a live previous Activity during all OS writes',async()=>{
  const b=boundary({font:'2'});
  await launchColdJourney(b);
  assert.equal(b.relaunches(),0);
  assert.equal(b.launches(),1);
  assert.equal(b.font(),'1');
  assert.ok(b.events.indexOf('shell wm user-rotation lock 0')<b.events.indexOf('launch'));
});

test('journey configuration failure prevents its launch',async()=>{
  const b=boundary({failConfig:true});
  await assert.rejects(launchColdJourney(b),/write failed/);
  assert.equal(b.launches(),0);
});

test('font restoration can delete an originally absent OS setting while app stays stopped',async()=>{
  const b=boundary({font:'1.5'});
  const result=await setColdFontScale({...b,value:null,settleMs:0});
  assert.equal(result.readback,'null');
  assert.equal(b.relaunches(),0);
  assert.equal(b.launches(),0);
});

test('an original positive font scale below one can be restored exactly',async()=>{
  const b=boundary({font:'2'});
  const result=await setColdFontScale({...b,value:'0.85',settleMs:0});
  assert.equal(result.readback,'0.85');
  assert.equal(b.relaunches(),0);
});

test('the actual cold journey entrypoint stops the old Activity before OS configuration and launch',async()=>{
  const b=boundary({font:'2'}),writes=[];
  const source=readFileSync(new URL('../scripts/qa/android-native-isolated/journey.mjs',import.meta.url),'utf8');
  const body=source.replace(/^import .*;\r?\n/gm,'');
  assert.ok(!/^import /m.test(body),'All journey dependencies must be supplied by the boundary');
  const page={command:async()=>{throw new Error('stop after cold launch');},evaluate:async()=>({}),exceptions:[],close(){}};
  const launch=async()=>{b.events.push('launch');return page;};
  await runInNewContext(`(async()=>{${body}\n})()`,{
    ...b,launch,launchColdJourney,assert,mkdirSync:()=>{},writeFileSync:(path,data)=>writes.push({path,data}),
    resolve:(...parts)=>parts.join('/'),acceptanceRunProvenance:()=>({}),
    process:{env:{ANDROID_QA_OUTPUT:'synthetic-output'},exitCode:0},console:{log(){}},inspectExpression:'({})',
  });
  assert.equal(b.relaunches(),0);
  assert.ok(b.events.indexOf('shell am force-stop com.sogrimhashbon.app.debug')<b.events.indexOf('shell settings put system font_scale 1'));
  assert.ok(b.events.indexOf('shell wm user-rotation lock 0')<b.events.indexOf('launch'));
  const evidence=JSON.parse(writes.find(row=>row.path.endsWith('journey.json')).data);
  assert.ok(evidence.coldConfiguration.processReadbacks.length>=7);
  assert.ok(evidence.coldConfiguration.processReadbacks.every(row=>row.status===1&&row.stdout===''&&row.stderr===''));
  assert.match(evidence.error,/stop after cold launch/);
});

test('the actual matrix and pages entrypoints keep six cold launches and restoration free of live font writes',async()=>{
  for(const name of ['matrix','pages'])for(const restorationFails of [false,true]){
    const b=boundary(),writes=[];
    const source=readFileSync(new URL(`../scripts/qa/android-native-isolated/${name}.mjs`,import.meta.url),'utf8');
    const body=source.replace(/^import .*;\r?\n/gm,'');
    assert.ok(!/^import /m.test(body),`${name} dependencies must be supplied by the boundary`);
    const launchForOwnedOrientation=async options=>{await options.launch();throw new Error('stop after cold launch');};
    const rejectRestore=async()=>{throw new Error('synthetic restore failure');};
    const execution={env:{ANDROID_QA_OUTPUT:'synthetic-output'},exitCode:0};
    await runInNewContext(`(async()=>{${body}\n})()`,{
      ...b,beginColdMatrix,launchColdFontCase,restoreColdMatrix:restorationFails?rejectRestore:restoreColdMatrix,restoreColdPages:restorationFails?rejectRestore:restoreColdPages,launchForOwnedOrientation,waitFor:async()=>{},
      mkdirSync:()=>{},writeFileSync:(path,data)=>writes.push({path,data}),resolve:(...parts)=>parts.join('/'),
      acceptanceRunProvenance:()=>({}),matrixExitCode:()=>1,
      process:execution,console:{log(){}},
    });
    assert.equal(b.relaunches(),0,name);
    assert.equal(b.launches(),6,name);
    const evidence=JSON.parse(writes.findLast(row=>row.path.endsWith(`${name}.json`)).data);
    assert.equal(name==='matrix'?evidence.results.length:evidence.checks.length,6,name);
    if(restorationFails){
      assert.match(evidence.coldRestoreError,/synthetic restore failure/);
      assert.equal(execution.exitCode,1);
    }else assert.ok(evidence.coldRestore.processReadbacks.every(row=>row.status===1&&row.stdout===''&&row.stderr===''),name);
    assert.match(name==='matrix'?evidence.results[0].error:evidence.checks[0].name,/stop after cold launch/);
  }
});

test('the actual geometry entrypoint stops before setup and restoration',async()=>{
  const b=boundary({font:'1.5'}),writes=[];
  const source=readFileSync(new URL('../scripts/qa/android-native-isolated/geometry-regression.mjs',import.meta.url),'utf8');
  const body=source.replace(/^import .*;\r?\n/gm,'');
  assert.ok(!/^import /m.test(body));
  const page={evaluate:async()=>{throw new Error('stop after cold launch');},close(){}};
  const launch=async()=>{b.events.push('launch');return page;};
  await runInNewContext(`(async()=>{${body}\n})()`,{
    ...b,launch,launchColdGeometry,restoreColdPages,assert,mkdirSync:()=>{},
    writeFileSync:(path,data)=>writes.push({path,data}),resolve:(...parts)=>parts.join('/'),
    acceptanceRunProvenance:()=>({}),waitFor:async predicate=>predicate(),
    process:{env:{ANDROID_QA_OUTPUT:'synthetic-output'},exitCode:0},console:{log(){}},
  });
  assert.equal(b.relaunches(),0);
  assert.equal(b.events.filter(row=>row==='launch').length,1);
  const report=JSON.parse(writes.find(row=>row.path.endsWith('geometry-regression.json')).data);
  assert.equal(report.checks.length,0);
  assert.match(report.error,/stop after cold launch/);
  assert.ok(report.coldConfiguration.processReadbacks.length>=5);
  assert.ok(report.coldRestore.processReadbacks.length>=5);
  assert.equal(b.font(),'1.5');
});
