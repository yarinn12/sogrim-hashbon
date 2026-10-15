import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {APP_SOURCE,auditDiagnosticApks} from '../scripts/qa/android-native-isolated/diagnostic/apk-members.mjs';
import {foreground15sVerdict,hostCapacitySnapshot,requireDiagnosticManifest,requireFrozenEmulatorControls,runFixedTrials,TRIAL_ORDER,webviewProviderIdentity} from '../scripts/qa/android-native-isolated/diagnostic/abba-contract.mjs';
import {executeTrial,requireDiagnosticReceipts,requireLiveCollector,requireSeparateCheckouts,toolsSourceFromCheckout} from '../scripts/qa/android-native-isolated/diagnostic/one-shot.mjs';
import {DIAGNOSTIC_CONTRACT,diagnosticMetadata} from '../scripts/qa/android-native-isolated/diagnostic-contract.mjs';
import {HOST_COHORT_CONTRACT} from '../scripts/qa/android-native-isolated/cohort-observation-coverage.mjs';
import {assertHostOwner,startOwnedTrace} from '../scripts/qa/android-native-isolated/trace-diagnostics.mjs';

function temporaryFixture(t,prefix){const parent=resolve(tmpdir()),root=mkdtempSync(join(parent,prefix));t.after(()=>{assert.equal(dirname(resolve(root)),parent);rmSync(root,{recursive:true,force:true});});return root;}

const sha='a'.repeat(64),toolsSource='b'.repeat(40);
const manifest={schemaVersion:1,appSource:APP_SOURCE,fixtureOnly:true,nativeAcceptance:false,requiredSignerVerification:true,changedMembers:['assets/public/index.html'],variants:{A:{path:'/synthetic/product.apk',apkSha256:sha},B:{path:'/synthetic/control.apk',apkSha256:sha}}};
const owner={pid:3499,startTicks:'12345'};
const session='sogrim_ci_diagnostic_1_aaaaaaaaaaaaaaaa';
const ready={...diagnosticMetadata(DIAGNOSTIC_CONTRACT.host),source:APP_SOURCE,session,owner};
const receipts={manifest,source:APP_SOURCE,toolsSource,device:'emulator-5582',avd:'sogrim_ci_diagnostic_1',emulatorPid:3499,
  network:{isolated:true,source:APP_SOURCE,device:'emulator-5582',avd:'sogrim_ci_diagnostic_1',pid:3499},
  collector:{...diagnosticMetadata(DIAGNOSTIC_CONTRACT.start),captureStarted:true,guestTransportStarted:true,source:APP_SOURCE,device:'emulator-5582',avd:'sogrim_ci_diagnostic_1',emulatorPid:3499,session,hostOwner:owner,hostObserver:{pid:789,ready},errors:[],guestTransportErrors:[],hostObservationErrors:[]}};

test('fixed ABBA records every trial even when a product trial fails; no retry or selected winner',async()=>{
  let time=Date.now();const attempted=[],durable=[];
  const result=await runFixedTrials({now:()=>time,append:row=>durable.push(row),runTrial:async({trial,variant,budgetMs})=>{
    attempted.push([trial,variant,budgetMs]);time+=1000;
    if(trial===1){const error=new Error('Synthetic ANR');error.evidence={anr:true};throw error;}
    return{observed:true};
  }});
  assert.deepEqual(TRIAL_ORDER,['A','B','B','A']);assert.deepEqual(attempted.map(row=>row.slice(0,2)),[[1,'A'],[2,'B'],[3,'B'],[4,'A']]);
  assert.equal(durable.length,4);assert.deepEqual(result.rows,durable);assert.equal(result.rows[0].status,'error');assert.deepEqual(result.rows[0].evidence,{anr:true});
  assert.deepEqual(result.rows.slice(1).map(row=>row.status),['recorded','recorded','recorded']);assert.equal(result.nativeAcceptance,false);
});

test('ownership stop keeps explicit unattempted rows and never resumes unsafe work',async()=>{
  const called=[],rows=[];const result=await runFixedTrials({append:row=>rows.push(row),runTrial:async({trial})=>{
    called.push(trial);const error=new Error('Owned emulator changed');error.safetyStop=true;throw error;
  }});
  assert.deepEqual(called,[1]);assert.equal(rows.length,4);assert.deepEqual(result.rows.slice(1).map(row=>[row.attempted,row.status]),[[false,'not-attempted'],[false,'not-attempted'],[false,'not-attempted']]);
});

test('the original foreground 15-second result is never fabricated from an unstarted or short observation',()=>{
  assert.equal(foreground15sVerdict([],null),null);
  assert.equal(foreground15sVerdict([{elapsedSinceForegroundWaitMs:5000,ownedActivityFocus:false}],1),null);
  assert.equal(foreground15sVerdict([{elapsedSinceForegroundWaitMs:100,ownedActivityFocus:true,nativeAndroid:true}],1),true);
  assert.equal(foreground15sVerdict([{elapsedSinceForegroundWaitMs:100,ownedActivityFocus:true,nativeAndroid:false}],1),null);
  assert.equal(foreground15sVerdict([{elapsedSinceForegroundWaitMs:100,ownedActivityFocus:true,nativeAndroid:null}],1,{requireNativeAndroid:false}),true);
  assert.equal(foreground15sVerdict([{elapsedSinceForegroundWaitMs:15001,ownedActivityFocus:false}],1),false);
});

test('one-shot preflight requires the exact app source, isolated AVD and an approved v5 collector',()=>{
  assert.deepEqual(requireDiagnosticReceipts(receipts),receipts.collector.hostOwner);
  for(const invalid of [
    {...receipts,source:'c'.repeat(40)},
    {...receipts,toolsSource:APP_SOURCE},
    {...receipts,network:{...receipts.network,isolated:false}},
    {...receipts,collector:{...receipts.collector,diagnosticsVersion:1}},
    {...receipts,collector:{...receipts.collector,source:'c'.repeat(40)}},
    {...receipts,collector:{...receipts.collector,hostObserver:{...receipts.collector.hostObserver,ready:{...ready,owner:{...owner,startTicks:'99999'}}}}},
    {...receipts,collector:{...receipts.collector,errors:['host start failed']}},
    {...receipts,manifest:{...manifest,nativeAcceptance:true}},
    {...receipts,manifest:{...manifest,changedMembers:['assets/public/index.html','classes.dex']}},
    {...receipts,manifest:{...manifest,changedMembers:['assets/public/index.html','META-INF/OTHER.SF']}}
  ])assert.throws(()=>requireDiagnosticReceipts(invalid));
  assert.equal(requireDiagnosticManifest(manifest),manifest);
  assert.equal(HOST_COHORT_CONTRACT.version,5);
});

function procStat(pid,name,startTicks='12345'){
  const fields=Array(40).fill('0');fields[10]='3';fields[11]='4';fields[18]=startTicks;
  return `${pid} (${name}) S ${fields.join(' ')}\n`;
}

test('actual startOwnedTrace v5 producer gives the one-shot a compatible owned start receipt',async t=>{
  const root=temporaryFixture(t,'sogrim-abba-v5-');
  const proc=join(root,'proc'),processDir=join(proc,'3499');mkdirSync(processDir,{recursive:true});
  writeFileSync(join(processDir,'cmdline'),['/sdk/emulator/emulator','-avd','sogrim_ci_diagnostic_1','-port','5582',''].join('\0'));
  writeFileSync(join(processDir,'stat'),procStat(3499,'qemu-system-x86'));
  const options={adbPath:'boundary-adb',device:receipts.device,avd:receipts.avd,source:APP_SOURCE,emulatorPid:3499,output:join(root,'trace')};
  const state={configIdentity:'7:122:1024',traceIdentity:'7:123'};
  const run=(binary,args,settings)=>{
    assert.equal(binary,options.adbPath);assert.deepEqual(args.slice(0,2),['-s',options.device]);
    const command=args.slice(2);
    if(command[0]==='emu')return{status:0,stdout:options.avd+'\nOK\n'};
    if(command[1]==='perfetto'){
      if(command.includes('--version'))return{status:0,stdout:'Perfetto v51.2 (N/A)\n'};
      if(command.includes('--help'))return{status:0,stdout:'--background-wait --config --query --txt\n'};
      if(command.includes('--query'))return{status:0,stdout:'linux.ftrace traced_probes gfx,view,wm,am,input\nlinux.process_stats traced_probes\nandroid.surfaceflinger.frametimeline surfaceflinger\n'};
      assert.equal(command.at(-1),state.configPath);return{status:0,stdout:'7000\n'};
    }
    if(command[1]==='toybox')return{status:0,stdout:'inotifyd timeout stat sha256sum sed cut grep tr head seq sleep cat'};
    if(command[1]==='sh'&&command[2]==='-s'){
      const script=settings.input,reserve=script.includes('set -C');
      if(reserve){
        state.configPath=/config='([^']+)'/.exec(script)[1];state.guestPath=/trace='([^']+)'/.exec(script)[1];
        const config=script.split("<<'SOGRIM_OWNED_CONFIG'\n")[1].split('SOGRIM_OWNED_CONFIG\n')[0];
        state.configSha=createHash('sha256').update(config).digest('hex');
      }
      return{status:0,stdout:`CONFIG ${state.configIdentity} ${state.configSha} ${state.configPath}\n`+(reserve?'':`TRACE ${state.traceIdentity} ${state.guestPath}\n`)};
    }
    if(command[1]==='cat'&&command[2].endsWith('/cmdline'))return{status:0,stdout:'/system/bin/perfetto\0--background-wait\0--txt\0-c\0'+state.configPath+'\0'};
    if(command[1]==='cat'&&command[2].endsWith('/stat'))return{status:0,stdout:procStat(7000,'perfetto','6789')};
    assert.fail('Unexpected startOwnedTrace boundary command '+JSON.stringify(command));
  };
  const launchHost=async(start,hostOwner)=>({pid:789,ready:{...diagnosticMetadata(DIAGNOSTIC_CONTRACT.host),source:start.source,session:start.session,owner:hostOwner}});
  const collector=await startOwnedTrace(options,{run,platform:'linux',procRoot:proc,launchHost});
  assert.equal(collector.captureStarted,true,collector.errors.join('\n'));
  assert.deepEqual(requireDiagnosticReceipts({...receipts,collector}),collector.hostOwner);
  assert.equal(collector.coverageVersion,undefined);
  assert.equal(collector.hostObserver.ready.diagnosticsProducer,DIAGNOSTIC_CONTRACT.host);
});

test('tools source comes from the checkout and must equal the workflow SHA guard',()=>{
  const checkout='C:/synthetic/tools';
  const run=(program,args)=>{assert.equal(program,'git');assert.deepEqual(args.slice(-2),['rev-parse','HEAD']);return toolsSource+'\n';};
  assert.equal(toolsSourceFromCheckout(checkout,{run,expectedSha:toolsSource}),toolsSource);
  assert.throws(()=>toolsSourceFromCheckout(checkout,{run,expectedSha:'c'.repeat(40)}));
});

test('one-shot binds its original tools module to tools HEAD and separately checks the frozen app HEAD',()=>{
  const toolsCheckout=resolve('synthetic/tools'),appCheckout=resolve('synthetic/tools/app');
  const modulePath=join(toolsCheckout,'scripts/qa/android-native-isolated/diagnostic/one-shot.mjs');
  const calls=[];
  const run=(program,args)=>{
    assert.equal(program,'git');calls.push(args);
    if(args.at(-1)==='--show-toplevel')return toolsCheckout+'\n';
    return resolve(args[1])===toolsCheckout?toolsSource+'\n':APP_SOURCE+'\n';
  };
  const options={appCheckout,toolsCheckout,modulePath,expectedToolsSha:toolsSource,run};
  assert.deepEqual(requireSeparateCheckouts(options),{source:APP_SOURCE,toolsSource});
  assert.equal(calls.length,3);
  assert.throws(()=>requireSeparateCheckouts({...options,modulePath:join(appCheckout,'scripts/qa/android-native-isolated/diagnostic/one-shot.mjs')}));
  assert.throws(()=>requireSeparateCheckouts({...options,toolsCheckout:appCheckout}));
  assert.throws(()=>requireSeparateCheckouts({...options,expectedToolsSha:'c'.repeat(40)}));
  assert.throws(()=>requireSeparateCheckouts({...options,run:(program,args)=>args.at(-1)==='--show-toplevel'?toolsCheckout+'\n':resolve(args[1])===toolsCheckout?toolsSource+'\n':'c'.repeat(40)+'\n'}));
});

test('stopped, stale or capped v5 host collection is a safety stop',()=>{
  const base={collector:receipts.collector,output:'/synthetic/trace',clock:()=>5000,
    exists:()=>false,stat:()=>({isFile:()=>true,size:100,mtimeMs:5000}),signal:(pid,signal)=>{assert.equal(pid,789);assert.equal(signal,0);}};
  assert.equal(requireLiveCollector(base).journalBytes,100);
  for(const changed of [
    {exists:path=>path.endsWith('host-summary.json')},
    {stat:()=>({isFile:()=>true,size:64*1024*1024,mtimeMs:5000})},
    {stat:()=>({isFile:()=>true,size:100,mtimeMs:-1000})},
    {signal:()=>{throw new Error('observer exited');}}
  ])assert.throws(()=>requireLiveCollector({...base,...changed}),error=>error.safetyStop===true);
});

function trialBoundary(t,{loseOwner=false,stopCollector=false,failInstall=false}={}){
  const root=temporaryFixture(t,'sogrim-abba-owner-');
  const proc=join(root,'proc'),processDir=join(proc,'3499');mkdirSync(processDir,{recursive:true});
  const command=['/sdk/emulator/emulator','-avd',receipts.avd,'-port','5582','-no-window','-no-snapshot','-gpu','swiftshader','-feature','GLDirectMem,HasSharedSlotsHostMemoryAllocator','-memory','4096','-cores','2'];
  writeFileSync(join(processDir,'cmdline'),[...command,''].join('\0'));writeFileSync(join(processDir,'stat'),procStat(3499,'qemu-system-x86'));
  const rawWebView='Current WebView package (name, version): (com.google.android.webview, 141.0.1)';
  const ctx={...receipts,owner,ownerCommand:command,webview:webviewProviderIdentity(rawWebView),guestVcpus:'2',output:root,collectorOutput:root,adbPath:'boundary-adb'};
  const calls=[];let collectorChecks=0;
  const makeAdb=async()=>async args=>{
    calls.push(args);
    const cmd=args.join(' ');
    if(cmd==='emu avd name')return receipts.avd+'\nOK\n';
    if(cmd==='shell dumpsys webviewupdate')return rawWebView;
    if(cmd==='shell nproc')return '2';
    if(cmd==='shell settings get global airplane_mode_on')return '1';
    if(cmd==='shell dumpsys connectivity')return 'Active default network: none\n';
    if(cmd==='shell settings get system font_scale')return '1';
    if(cmd==='shell wm user-rotation')return 'lock 0';
    if(cmd==='shell settings get system accelerometer_rotation'){
      if(loseOwner)writeFileSync(join(processDir,'stat'),procStat(3499,'qemu-system-x86','99999'));
      return '0';
    }
    if(cmd==='shell dumpsys activity lastanr')return 'no owned ANR';
    if(cmd.startsWith('install -r')&&failInstall)throw new Error('Synthetic install refused');
    assert.fail('Unexpected ADB boundary command '+cmd);
  };
  const hostOwner=(identity,options)=>assertHostOwner(identity,{...options,procRoot:proc});
  const checkCollector=()=>{
    collectorChecks++;
    return requireLiveCollector({collector:ctx.collector,output:root,clock:()=>5000,
      exists:path=>stopCollector&&collectorChecks>=2&&path.endsWith('host-summary.json'),
      stat:()=>({isFile:()=>true,size:100,mtimeMs:5000}),signal:()=>{}});
  };
  return{ctx,calls,deps:{makeAdb,hostOwner,checkCollector}};
}

test('real owner identity loss inside executeTrial stops before any package mutation and retains remaining ABBA rows',async t=>{
  const boundary=trialBoundary(t,{loseOwner:true}),rows=[];
  const result=await runFixedTrials({append:row=>rows.push(row),runTrial:input=>executeTrial(input,boundary.ctx,()=>false,boundary.deps)});
  assert.deepEqual(result.rows.map(row=>row.status),['error','not-attempted','not-attempted','not-attempted']);
  assert.match(result.rows[0].error,/Owned emulator unavailable/);
  assert.equal(boundary.calls.filter(args=>['install','am','pm'].includes(args[0])||args.join(' ').includes('force-stop')).length,0);
  assert.equal(rows.length,4);
});

test('collector stop inside executeTrial stops before installation and retains remaining ABBA rows',async t=>{
  const boundary=trialBoundary(t,{stopCollector:true}),rows=[];
  const result=await runFixedTrials({append:row=>rows.push(row),runTrial:input=>executeTrial(input,boundary.ctx,()=>false,boundary.deps)});
  assert.deepEqual(result.rows.map(row=>row.status),['error','not-attempted','not-attempted','not-attempted']);
  assert.match(result.rows[0].error,/collector unavailable/);
  assert.equal(boundary.calls.some(args=>args[0]==='install'),false);
  assert.equal(rows.length,4);
});

test('install request start is recorded even when ADB never acknowledges completion',async t=>{
  const boundary=trialBoundary(t,{failInstall:true});
  await assert.rejects(()=>executeTrial({trial:1,variant:'A',budgetMs:90_000},boundary.ctx,()=>false,boundary.deps),error=>{
    assert.match(error.message,/Synthetic install refused/);
    assert.ok(error.evidence.events.some(event=>event.kind==='apk-install-request-start'));
    assert.equal(error.evidence.events.some(event=>event.kind==='apk-install-completed'),false);
    return true;
  });
});

test('capacity report preserves unavailable kernel fields instead of inventing CPU measurements',()=>{
  const sample=hostCapacitySnapshot({reader:path=>{if(path==='/proc/loadavg')return '1.0 2.0 3.0 1/2 3';throw Object.assign(new Error('missing'),{code:'ENOENT'});},parallelism:()=>4,hostCpus:()=>Array(8).fill({})});
  assert.equal(sample.allowedCpus,4);assert.equal(sample.logicalHostCpus,8);assert.equal(sample.procLoadavg.value,'1.0 2.0 3.0 1/2 3');assert.equal(sample.cgroupCpuMax.unavailable,'ENOENT');
});

test('WebView identity compares observed package and version rather than a variable dumpsys body',()=>{
  assert.deepEqual(webviewProviderIdentity('Current WebView package (name, version): (com.google.android.webview, 141.0.1)'),{name:'com.google.android.webview',version:'141.0.1'});
  assert.deepEqual(webviewProviderIdentity('Current WebView package is com.google.android.webview (version 141.0.1)'),{name:'com.google.android.webview',version:'141.0.1'});
  assert.throws(()=>webviewProviderIdentity('Current WebView package unavailable'));
});

test('one-shot rejects a changed emulator renderer or resource recipe before the first trial',()=>{
  const command=['emulator','-avd','sogrim_ci_diagnostic_1','-no-window','-no-snapshot','-gpu','swiftshader','-feature','GLDirectMem,HasSharedSlotsHostMemoryAllocator','-memory','4096','-cores','2'];
  assert.equal(requireFrozenEmulatorControls(command),command);
  for(const [flag,replacement] of [['-gpu','host'],['-feature','GLDirectMem'],['-memory','2048'],['-cores','4']]){
    const changed=[...command];changed[changed.indexOf(flag)+1]=replacement;assert.throws(()=>requireFrozenEmulatorControls(changed));
  }
});

test('control is static fixture-only HTML and the exact diagnostic branch disables Vercel deployment',()=>{
  const control=readFileSync(new URL('../scripts/qa/android-native-isolated/diagnostic/control-index.html',import.meta.url),'utf8');
  assert.match(control,/data-diagnostic-control="minimal-webview"/);assert.doesNotMatch(control,/<script\b|<link\b/i);
  const vercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.equal(vercel.git.deploymentEnabled['codex/android-cold-launch-abba-20261015'],false);
});

test('real APK member audit accepts only the reviewed index and exact signature metadata delta',t=>{
  const root=temporaryFixture(t,'sogrim-abba-apk-');
  const python=process.env.PYTHON3_PATH||'python3';
  const indexPath=new URL('../scripts/qa/android-native-isolated/diagnostic/control-index.html',import.meta.url);
  const control=readFileSync(indexPath,'utf8'),fixturePath=join(root,'reviewed-control.html');writeFileSync(fixturePath,control);
  const productPath=join(root,'product.apk'),controlPath=join(root,'control.apk');
  const productIndex='<html><script src="./android-native-qa-fixture.js"></script></html>';
  const common={'classes.dex':'dex-same','assets/public/styles.css':'css-same','assets/public/assets/fonts/qa.woff2':'font-same',
    'lib/x86_64/libqa.so':'native-same','resources.arsc':'resource-same','META-INF/CERT.RSA':'certificate-same','META-INF/OTHER.SF':'other-same'};
  const zipCode='import json,sys,zipfile\nwith zipfile.ZipFile(sys.argv[1],"w",compression=zipfile.ZIP_DEFLATED) as archive:\n for name,value in json.loads(sys.argv[2]).items(): archive.writestr(name,value.encode("utf-8"))\n';
  const build=(path,members)=>{
    const result=spawnSync(python,['-c',zipCode,path,JSON.stringify(members)],{encoding:'utf8',windowsHide:true,timeout:10000});
    assert.equal(result.status,0,result.error?.message||result.stderr);
  };
  build(productPath,{...common,'assets/public/index.html':productIndex});
  build(controlPath,{...common,'assets/public/index.html':control,'META-INF/CERT.RSA':'certificate-resigned'});
  const audit=()=>auditDiagnosticApks({productApk:productPath,controlApk:controlPath,controlIndex:fixturePath,python});
  const accepted=audit();
  assert.deepEqual(accepted.changedMembers,['META-INF/CERT.RSA','assets/public/index.html']);
  assert.equal(accepted.fixtureOnly,true);assert.equal(accepted.nativeAcceptance,false);
  for(const member of ['classes.dex','assets/public/styles.css','assets/public/assets/fonts/qa.woff2','lib/x86_64/libqa.so','resources.arsc','META-INF/OTHER.SF']){
    build(controlPath,{...common,[member]:'changed-'+member,'assets/public/index.html':control,'META-INF/CERT.RSA':'certificate-resigned'});
    assert.throws(audit,error=>error.message.includes(member),member);
  }
  build(controlPath,{...common,'assets/public/index.html':control,'META-INF/CERT.RSA':'certificate-resigned'});
  writeFileSync(fixturePath,control+'\nchanged fixture');
  assert.throws(audit,/reviewed minimal fixture/);
});
