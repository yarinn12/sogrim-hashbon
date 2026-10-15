import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {APP_SOURCE,APP_TREE,CONTROL_INDEX_SHA256,auditDiagnosticApks} from '../scripts/qa/android-native-isolated/warm-content/apk-members.mjs';
import {requirePair,validateWarmPrelude,warmOutcome,contentContrast} from '../scripts/qa/android-native-isolated/warm-content/contract.mjs';
import {instrumentWarmDriver,instrumentWarmMatrix,materializeWarmHarness} from '../scripts/qa/android-native-isolated/warm-content/materialize.mjs';
import {runWarmTarget,verifiedDebugSigner,matrixCleanupBoundary,verifyPairFiles} from '../scripts/qa/android-native-isolated/warm-content/target.mjs';
import {requireConfiguration} from '../scripts/qa/android-native-isolated/warm-content/controller.mjs';
import {assessClosedLog} from '../scripts/qa/android-native-isolated/pages-restart-materialize.mjs';
import {createTelemetry} from '../scripts/qa/android-native-isolated/pages-restart-telemetry.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex'),base=new URL('../scripts/qa/android-native-isolated/',import.meta.url);
const clockId='12345678-1234-1234-1234-123456789abc',probe=`${clockId}\n123.45 98.76\n${clockId}\n`;
const log='10-16 01:00:00.000 2001 2001 I Sogrim: synthetic original protocol\n';
const anr=pid=>`10-16 01:00:05.000 689 812 I am_anr: [0,${pid},com.sogrimhashbon.app.debug,0,Input dispatching timed out (FocusEvent(hasFocus=true))]\n`;
const temporary=fn=>{const dir=mkdtempSync(join(tmpdir(),'sogrim-warm-synthetic-'));return Promise.resolve().then(()=>fn(dir)).finally(()=>rmSync(dir,{recursive:true,force:true}));};
const warm=()=>({scale:1,orientation:'portrait',checks:Array.from({length:36},()=>({ok:true})),nativeHolds:[{durationMs:650}],capabilities:{fontScale:1},rotationReceipt:{commandApplications:1},holdRotationReceipt:{commandApplications:1},exceptions:[],holdExceptions:[]});
const rows=()=>[warm(),{scale:1,orientation:'landscape',checks:[],nativeHolds:[],warmContentCut:true}];
const font=()=>({ready:true,osScaleRestore:{exact:true}});
const pair=()=>({schemaVersion:1,appSource:APP_SOURCE,appTree:APP_TREE,nativeAcceptance:false,fixtureOnly:true,productLineageVerified:true,requiredSignerVerification:true,reviewedControlIndexSha256:CONTROL_INDEX_SHA256,changedMembers:['assets/public/index.html'],variants:{A:{path:'synthetic-A.apk',apkSha256:'a'.repeat(64)},B:{path:'synthetic-B.apk',apkSha256:'b'.repeat(64)}}});
const validReport=(variant='A')=>({errors:[],prelude:{valid:true},trace:{captureComplete:true},anr:{diagnosticsComplete:true,anrHistoryReady:true},closedLog:{file:{sha256:'f'.repeat(64)},logcatClosed:true,anrHistoryReady:true,targetAppAnrLines:[]},cleanup:{complete:true},target:{variant,prelude:{valid:true},preludeHistoryReady:true,cutPostureVerified:true,installVerified:true,pairVerified:true,clockAnchorsComplete:true,newPid:2001,warmPid:1001,rotationRequested:false,holdRequested:false,pmClearRequested:false,foregroundBeforeRotationReached:true,productNativeReady:variant==='A'?true:null,controlFixtureReady:variant==='B'?true:null,pairHashes:{A:'a'.repeat(64),B:'b'.repeat(64)},bootId:clockId}});

test('warm prelude requires only original 36 checks/one 650ms hold and retains strict failure',()=>{
  assert.equal(validateWarmPrelude(rows(),font()).valid,true);assert.equal(validateWarmPrelude(rows(),font()).originalMatrixVerdict,1);
  for(const mutate of [r=>r[0].checks.pop(),r=>r[0].checks[0].ok=false,r=>r[0].nativeHolds=[],r=>r[0].nativeHolds[0].durationMs=649,r=>r[0].capabilities.fontScale=2,r=>r[0].error='failure',r=>r.reverse(),r=>r.push(warm()),r=>r[1].checks.push({ok:true})]){const value=rows();mutate(value);assert.equal(validateWarmPrelude(value,font()).valid,false);}
  assert.equal(validateWarmPrelude(rows(),{...font(),ready:false}).valid,false);
});
test('a60 APK pair contract rejects old 59b lineage, changed DEX or unreviewed index',()=>{
  assert.equal(requirePair(pair()).appTree,APP_TREE);
  for(const delta of [{appSource:'59b599c24341e4659bce62b02c9d78fce3dd050d'},{appTree:'f'.repeat(40)},{productLineageVerified:false},{reviewedControlIndexSha256:'0'.repeat(64)},{changedMembers:['assets/public/index.html','classes.dex']},{nativeAcceptance:true}])assert.throws(()=>requirePair({...pair(),...delta}),/c14/);
});
test('target ANR with complete raw evidence is positive evidence and still exits failure',()=>temporary(path=>{
  const file=join(path,'logcat-live.log');writeFileSync(file,log+anr(2001));const report=validReport();report.closedLog=assessClosedLog(file,true);report.target.error='original foreground timeout';report.target.foregroundBeforeRotationReached=false;report.anr.anrHistoryReady=false;
  const result=warmOutcome(report);assert.equal(result.evidenceComplete,true);assert.equal(result.factorTested,true);assert.equal(result.positiveAnrObservation,true);assert.equal(result.exitCode,1);assert.equal(result.nativeAcceptance,false);
}));
test('a late closed-tail ANR is never accepted after clean pre-close scan',()=>temporary(path=>{
  const file=join(path,'logcat-live.log');writeFileSync(file,log);const report=validReport();report.closedLog=assessClosedLog(file,true);assert.equal(warmOutcome(report).exitCode,0);
  writeFileSync(file,log+anr(2001));report.closedLog=assessClosedLog(file,true);assert.equal(warmOutcome(report).positiveAnrObservation,true);assert.equal(warmOutcome(report).exitCode,1);
}));
test('prelude ANR/unknown PID, missing proof, clock or failed cleanup cannot count as factor tested',()=>{
  for(const mutate of [r=>r.target.preludeHistoryReady=false,r=>r.prelude.valid=false,r=>r.target.installVerified=false,r=>r.target.newPid=r.target.warmPid,r=>r.target.clockAnchorsComplete=false,r=>r.target.pairVerified=false,r=>r.target.pmClearRequested=true,r=>r.closedLog.targetAppAnrLines=[anr(1001).trim()],r=>r.closedLog.targetAppAnrLines=['10-16 01:00:05.000 689 812 E ActivityManager: ANR in com.sogrimhashbon.app.debug']]){const r=validReport();mutate(r);assert.equal(warmOutcome(r).factorTested,false);assert.equal(warmOutcome(r).exitCode,1);}
  for(const mutate of [r=>r.closedLog.logcatClosed=false,r=>r.closedLog.targetAppAnrLines=undefined,r=>r.trace.captureComplete=false,r=>r.cleanup.complete=false,r=>r.errors.push('observer error')]){const r=validReport();mutate(r);assert.equal(warmOutcome(r).evidenceComplete,false);assert.equal(warmOutcome(r).exitCode,1);}
});
test('minimal control readiness is distinct; contrast needs fresh guests and A reproduction',()=>{
  const reports=['A','B','B','A'].map((v,i)=>{const r=validReport(v);Object.assign(r,warmOutcome(r));r.target.bootId=clockId+String(i);return r;});
  assert.equal(contentContrast(reports).descriptiveContrastObserved,false);
  reports[0].positiveAnrObservation=true;reports[0].successfulObservation=false;
  assert.equal(contentContrast(reports).descriptiveContrastObserved,true);assert.equal(contentContrast(reports).installerConfoundRetained,true);assert.equal(contentContrast(reports).causalAttributionAuthorized,false);
  reports[1].target.bootId=reports[0].target.bootId;assert.equal(contentContrast(reports).complete,false);
  const r=validReport('B');r.target.controlFixtureReady=false;r.target.productNativeReady=true;assert.equal(warmOutcome(r).successfulObservation,false);
});
test('verified signer rejects release, duplicate, mismatched or missing certificate evidence',()=>{
  const raw='Signer #1 certificate DN: CN=Android Debug, O=Android\nSigner #1 certificate SHA-256 digest: '+'a'.repeat(64)+'\n';
  assert.equal(verifiedDebugSigner(raw),'a'.repeat(64));
  for(const wrong of ['',raw.replace('Android Debug','Release'),raw+raw])assert.throws(()=>verifiedDebugSigner(wrong));
});
test('fresh pair audit and actual verified Debug signers must match before any install',()=>temporary(path=>{
  const previous=process.env.ANDROID_RESTART_COMMAND_EVIDENCE;process.env.ANDROID_RESTART_COMMAND_EVIDENCE=join(path,'commands');
  try{
    const manifest={...pair(),productAuditSha256:'c'.repeat(64),fixtureReceiptSha256:'d'.repeat(64)},file=join(path,'pair.json');writeFileSync(file,JSON.stringify(manifest));
    const env={ANDROID_WARM_PAIR_MANIFEST:file,ANDROID_WARM_PRODUCT_AUDIT:'synthetic-audit.json',ANDROID_WARM_FIXTURE_RECEIPT:'synthetic-fixture.json',ANDROID_WARM_CONTROL_INDEX:'synthetic-control.html',APKSIGNER_PATH:'synthetic-apksigner'};
    const signer=digest=>({status:0,stdout:'Signer #1 certificate DN: CN=Android Debug, O=Android\nSigner #1 certificate SHA-256 digest: '+digest+'\n',stderr:''});
    assert.equal(verifyPairFiles(env,{audit:()=>manifest,run:()=>signer('e'.repeat(64))}).signerSha256,'e'.repeat(64));
    assert.throws(()=>verifyPairFiles(env,{audit:()=>manifest,run:(_cmd,args)=>signer((args.at(-1).includes('B')?'f':'e').repeat(64))}),/certificates differ/);
    assert.throws(()=>verifyPairFiles(env,{audit:()=>({...manifest,appSource:'59b599c24341e4659bce62b02c9d78fce3dd050d'}),run:()=>signer('e'.repeat(64))}),/c14/);
    assert.throws(()=>verifyPairFiles(env,{audit:()=>({...manifest,productAuditSha256:'0'.repeat(64)}),run:()=>signer('e'.repeat(64))}),/lineage changed/);
    assert.throws(()=>verifyPairFiles(env,{audit:()=>manifest,run:()=>({status:1,stdout:'',stderr:'synthetic invalid signature'})}),/signature verification failed/);
  }finally{if(previous===undefined)delete process.env.ANDROID_RESTART_COMMAND_EVIDENCE;else process.env.ANDROID_RESTART_COMMAND_EVIDENCE=previous;}
}));

async function targetFixture(path,variant,{preludeAnr=false,installFails=false,foregroundFails=false}={}){
  const previous=process.env.ANDROID_RESTART_COMMAND_EVIDENCE;process.env.ANDROID_RESTART_COMMAND_EVIDENCE=join(path,'commands');
  mkdirSync(join(path,'font-regression'));writeFileSync(join(path,'font-regression/font-regression.json'),JSON.stringify(font()));writeFileSync(join(path,'logcat-live.log'),log);
  const env={ANDROID_WARM_CONTENT_OUTPUT:path,ANDROID_WARM_CONTENT_ARM:variant},commands=[];let installedHash='a'.repeat(64),launched=false,closed=false;
  const page={evaluate:async expression=>expression.includes('getCapabilities')?{fontScale:1}:{ready:true,native:true,platform:'android'},close(){closed=true;}};
  const adb=args=>{commands.push(args);if(args.includes('/proc/uptime'))return probe;if(args[0]==='logcat')return log+(preludeAnr?anr(1001):'');if(args.includes('user-rotation'))return 'lock 0';if(args.includes('get'))return args.at(-1)==='font_scale'?'1':'0';if(args[0]==='install'){if(installFails)return 'Failure [synthetic]';installedHash=variant==='A'?'a'.repeat(64):'b'.repeat(64);return 'Success\n';}if(args.includes('path'))return 'package:/data/app/synthetic/base.apk\n';if(args.includes('sha256sum'))return installedHash+'  /data/app/synthetic/base.apk\n';if(args.includes('pidof'))return launched?'2001':'1001';if(args.includes('displays'))return '  Display: mDisplayId=0\n    mCurrentFocus=Window{owned u0 com.sogrimhashbon.app.debug/com.sogrimhashbon.app.MainActivity}\n';return '';};
  try{const result=await runWarmTarget({adb,results:rows(),launch:async callback=>{launched=true;callback(page);return page;},waitFor:async(fn,label,timeout)=>{assert.ok(timeout>0&&timeout<=15000);if(foregroundFails)throw new Error('synthetic original foreground timeout');assert.ok(await fn());},onPage(){}},env,{verifyPair:()=>({manifest:pair(),pairHashes:{A:'a'.repeat(64),B:'b'.repeat(64)},signerSha256:'c'.repeat(64)})});return {result,commands,launched,closed,env};}
  finally{if(previous===undefined)delete process.env.ANDROID_RESTART_COMMAND_EVIDENCE;else process.env.ANDROID_RESTART_COMMAND_EVIDENCE=previous;}
}
for(const variant of ['A','B'])test('warm '+variant+' performs one symmetric reinstall, new PID, no pm clear/rotation/hold',()=>temporary(async path=>{
  const {result,commands,closed,env}=await targetFixture(path,variant);
  assert.equal(result.installVerified,true);assert.equal(result.warmInstalled.sha256,'a'.repeat(64));assert.equal(result.installed.sha256,(variant==='A'?'a':'b').repeat(64));assert.equal(result.newPid,2001);assert.equal(result.warmPid,1001);assert.equal(result.clockAnchorsComplete,true);assert.equal(closed,true);assert.equal(env.ANDROID_WARM_CONTENT_TARGET,undefined);
  assert.equal(commands.filter(c=>c[0]==='install').length,1);assert.deepEqual(commands.find(c=>c[0]==='install'),['install','-r',`synthetic-${variant}.apk`]);assert.ok(commands.every(c=>!c.includes('clear')&&!c.includes('lock')&&!c.includes('swipe')));
  assert.equal(variant==='A'?result.productNativeReady:result.controlFixtureReady,true);assert.equal(variant==='A'?result.controlFixtureReady:result.productNativeReady,null);
}));
test('warm prelude ANR blocks install, and installer failure blocks target launch',()=>temporary(async path=>{
  const a=join(path,'prelude'),b=join(path,'install');mkdirSync(a);mkdirSync(b);
  const first=await targetFixture(a,'A',{preludeAnr:true});assert.equal(first.launched,false);assert.ok(first.commands.every(c=>c[0]!=='install'));assert.equal(first.result.preludeHistoryReady,undefined);
  const second=await targetFixture(b,'B',{installFails:true});assert.equal(second.launched,false);assert.equal(second.result.installVerified,undefined);
}));
test('foreground failure retains new PID, closed page, error and both bounded clock probes',()=>temporary(async path=>{
  const {result,closed}=await targetFixture(path,'A',{foregroundFails:true});assert.match(result.error,/foreground timeout/);assert.equal(result.newPid,2001);assert.equal(result.clockAnchorsComplete,true);assert.equal(closed,true);
}));

test('generated canonical matrix cuts after original setter/sleep and restores all original settings',()=>temporary(async path=>{
  const original=readFileSync(new URL('matrix.mjs',base),'utf8');let code=instrumentWarmMatrix(original,'synthetic-target').replace(/^import .*;\r?\n/gm,'');
  code=code.replace('results.push(row);','results.push(row);if(scale===1&&orientation===\'portrait\'){Object.assign(row,warmFixture);continue;}');
  const commands=[],sleeps=[],boundaries=[],fake={env:{ANDROID_QA_OUTPUT:join(path,'matrix')},exitCode:null};let cuts=0;
  const adb=args=>{commands.push(args);return args.includes('get')?(args.at(-1)==='font_scale'?'1':'0'):'';};
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  await new AsyncFunction('writeFileSync','mkdirSync','resolve','process','acceptanceRunProvenance','adb','sleep','runWarmTarget','matrixCleanupBoundary','matrixExitCode','warmFixture','launch','waitFor',code)(writeFileSync,mkdirSync,resolve,fake,()=>({synthetic:true}),adb,async ms=>sleeps.push(ms),async({results})=>{cuts++;assert.equal(validateWarmPrelude(results,font()).valid,true);assert.deepEqual(commands.at(-1),['shell','settings','put','system','font_scale','1']);assert.deepEqual(sleeps,[750]);},(phase,original)=>boundaries.push({phase,original}),()=>1,warm(),async()=>{throw new Error('Unexpected target launch inside untruncated matrix');},async()=>{});
  assert.equal(cuts,1);assert.equal(fake.exitCode,1);assert.deepEqual(boundaries.map(r=>r.phase),['start','complete']);assert.equal(commands.filter(c=>c.includes('lock')).length,1,'only original cleanup may restore rotation');
  const saved=JSON.parse(readFileSync(join(path,'matrix/matrix.json'),'utf8'));assert.equal(saved.results.length,2);assert.equal(saved.results[1].warmContentCut,true);
}));
test('37 canonical c14 files materialize; only driver/matrix differ and both parse',()=>temporary(path=>{
  const git=args=>args[0]==='rev-parse'?Buffer.from(args[1]==='HEAD'?APP_SOURCE:APP_TREE):args[0]==='diff'?Buffer.from(''):execFileSync('git',args);
  const dest=materializeWarmHarness({root:process.cwd(),output:path},git),bindings=JSON.parse(readFileSync(join(path,'harness-bindings.json'),'utf8'));
  assert.equal(readdirSync(dest).length,37);assert.deepEqual(bindings.bindings.filter(b=>b.instrumented).map(b=>b.path.split('/').at(-1)),['driver.mjs','matrix.mjs']);
  for(const name of ['driver.mjs','matrix.mjs']){const r=spawnSync(process.execPath,['--check',join(dest,name)],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
  assert.throws(()=>instrumentWarmMatrix('changed source','x'),/anchor/);
  assert.throws(()=>materializeWarmHarness({root:process.cwd(),output:join(path,'bad')},a=>a[0]==='rev-parse'?Buffer.from('f'.repeat(40)):git(a)),/c14/);
}));
test('inactive Linux controller refuses missing review flag, old source and existing trace',()=>{
  const env={ANDROID_WARM_CONTENT_RUN:'reviewed-diagnostic-only',SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD:'1',ANDROID_WARM_CONTENT_SOURCE_ROOT:process.cwd(),ANDROID_WARM_CONTENT_ARM:'A',ANDROID_QA_SOURCE:APP_SOURCE,ANDROID_QA_DEVICE:'emulator-5582',ANDROID_QA_AVD:'sogrim_ci_synthetic',ADB_PATH:'synthetic-adb',ANDROID_HOME:'synthetic-sdk',GITHUB_SHA:'d'.repeat(40)};
  assert.equal(requireConfiguration(env,'linux').arm,'A');assert.throws(()=>requireConfiguration(env,'win32'),/Linux/);
  for(const [key,value]of [['ANDROID_WARM_CONTENT_RUN',''],['ANDROID_QA_SOURCE','59b599c24341e4659bce62b02c9d78fce3dd050d'],['GITHUB_SHA',APP_SOURCE],['ANDROID_WARM_CONTENT_ARM','C']])assert.throws(()=>requireConfiguration({...env,[key]:value},'linux'));
});

for(const variant of ['A','B',undefined])test('actual driver readiness and raw ACKs '+(variant||'original warm-up'),()=>temporary(async path=>{
  const code=instrumentWarmDriver(readFileSync(new URL('driver.mjs',base),'utf8'),'synthetic-telemetry').replace(/^import .*;\r?\n/gm,'').replaceAll('export ','');
  const journal=createTelemetry(path),commands=[],expressions=[],timers=[];
  class Socket{listeners=new Map();constructor(){queueMicrotask(()=>this.listeners.get('open')?.({}));}addEventListener(k,f){this.listeners.set(k,f);}send(raw){const r=JSON.parse(raw);if(r.params.expression)expressions.push(r.params.expression);queueMicrotask(()=>this.listeners.get('message')({data:JSON.stringify({id:r.id,result:{result:{value:true}}})}));}close(){}}
  const environment={ANDROID_QA_DEVICE:'emulator-5582',ANDROID_QA_AVD:'sogrim_ci_synthetic',ADB_PATH:'synthetic-adb',ANDROID_WARM_CONTENT_TARGET:variant};
  const api=new Function('spawnSync','process','record','observedSpawnSync','WebSocket','setTimeout','clearTimeout','fetch','cardInputTraceInstallExpression',code+';return {launch};')((cmd,args)=>{commands.push(args);return{status:0,stdout:args.includes('name')?'sogrim_ci_synthetic\n':args.includes('/proc/net/unix')?'webview_devtools_remote_2001':args.includes('pidof')?'2001':'Success',stderr:''};},{env:environment},journal.record,journal.observedSpawnSync,Socket,(fn,ms)=>{timers.push(ms);return setTimeout(fn,ms===500?0:ms);},clearTimeout,async()=>({json:async()=>[{type:'page',url:'https://localhost/',webSocketDebuggerUrl:'ws://synthetic'}]}),'synthetic-card-product-trace');
  let observed;const page=await api.launch(value=>{observed=value;});assert.equal(observed,variant?page:undefined);page.close();assert.equal(expressions.some(e=>e.includes('minimal-webview')),variant==='B');assert.equal(expressions.some(e=>e.includes('synthetic-card-product-trace')),variant!=='B');assert.ok(timers.includes(500));assert.ok(timers.includes(15000));
  const records=readFileSync(join(path,'commands.jsonl'),'utf8').trim().split('\n').map(JSON.parse);assert.ok(records.some(r=>r.kind==='cdp-ack'&&r.data.raw&&r.data.matched));assert.equal(commands.filter(c=>c.includes('clear')).length,0);
}));

test('target does not retry a failed original process-start wait',()=>temporary(async path=>{
  const code=instrumentWarmDriver(readFileSync(new URL('driver.mjs',base),'utf8'),'synthetic-telemetry').replace(/^import .*;\r?\n/gm,'').replaceAll('export ','');
  const journal=createTelemetry(path),commands=[];let now=0;
  class FakeDate extends Date{static now(){now+=1000;return now;}}
  const api=new Function('spawnSync','process','record','observedSpawnSync','setTimeout','Date',code+';return {launch};')((cmd,args)=>{commands.push(args);return{status:0,stdout:args.includes('name')?'sogrim_ci_synthetic\n':'',stderr:''};},{env:{ANDROID_QA_DEVICE:'emulator-5582',ANDROID_QA_AVD:'sogrim_ci_synthetic',ADB_PATH:'synthetic-adb',ANDROID_WARM_CONTENT_TARGET:'B'}},journal.record,journal.observedSpawnSync,(fn,ms)=>setTimeout(fn,0),FakeDate);
  await assert.rejects(api.launch(),/QA process launched timed out/);assert.equal(commands.filter(c=>c.includes('start')).length,1);
}));

test('original matrix cleanup boundary lists all restores and remains incomplete on failure',()=>temporary(path=>{
  const previous={output:process.env.ANDROID_WARM_CONTENT_OUTPUT,commands:process.env.ANDROID_RESTART_COMMAND_EVIDENCE};process.env.ANDROID_WARM_CONTENT_OUTPUT=path;process.env.ANDROID_RESTART_COMMAND_EVIDENCE=join(path,'commands');
  try{
    const original={font_scale:'1',accelerometer_rotation:'1',user_rotation:'null'};matrixCleanupBoundary('start',original);
    const started=JSON.parse(readFileSync(join(path,'cleanup.json'),'utf8'));assert.equal(started.complete,false);assert.equal(started.commands.length,4);assert.deepEqual(started.commands[2],['shell','settings','delete','system','user_rotation']);
    assert.equal(warmOutcome({...validReport(),cleanup:started}).evidenceComplete,false);
    matrixCleanupBoundary('complete',original);assert.equal(JSON.parse(readFileSync(join(path,'cleanup.json'),'utf8')).complete,true);assert.throws(()=>matrixCleanupBoundary('complete',original),/repeated/);
  }finally{for(const[k,v]of [['ANDROID_WARM_CONTENT_OUTPUT',previous.output],['ANDROID_RESTART_COMMAND_EVIDENCE',previous.commands]])if(v===undefined)delete process.env[k];else process.env[k]=v;}
}));

for(const fault of ['none','dex','resource','css','font','extra','index','old-source','bad-audit','duplicate'])test('actual ZIP pair reader '+fault,()=>temporary(path=>{
  const python=process.env.SOGRIM_TEST_PYTHON||'python3',helper=fileURLToPath(new URL('./helpers/androidWarmApkFixture.py',import.meta.url)),control=fileURLToPath(new URL('warm-content/control-index.html',base));
  const generated=spawnSync(python,[helper,path,control,fault],{encoding:'utf8'});assert.equal(generated.status,0,generated.stderr);
  const options={python,productApk:join(path,'A.apk'),controlApk:join(path,'B.apk'),controlIndex:control,productAudit:join(path,'audit.json'),fixtureReceipt:join(path,'fixture.json')};
  if(fault==='none'){const report=auditDiagnosticApks(options);assert.equal(report.appSource,APP_SOURCE);assert.equal(report.productLineageVerified,true);assert.equal(report.changedMembers.includes('assets/public/index.html'),true);assert.equal(report.members['classes.dex'].product,report.members['classes.dex'].control);}
  else assert.throws(()=>auditDiagnosticApks(options),/audit/);
}));
