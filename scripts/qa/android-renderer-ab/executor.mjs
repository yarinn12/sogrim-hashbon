import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, cpSync, readdirSync, statSync, realpathSync, readlinkSync} from 'node:fs';
import {resolve, join, dirname, relative, isAbsolute} from 'node:path';
import {platform} from 'node:os';
import {createServer} from 'node:net';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {PIN, ARMS, assertContext, assertArtifactIdentity, assertSdk, assertRenderer, executePair, pairVerdict, probeEmulator} from './policy.mjs';
import {sha256File} from './hash-file.mjs';

const now = () => new Date().toISOString();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const save = (path, data) => {mkdirSync(dirname(path), {recursive:true}); writeFileSync(path, JSON.stringify(data, null, 2) + '\n');};
const delay = ms => new Promise(done => setTimeout(done, ms));
const activeCommands = new Set();
function processIdentity(pid) {
  const raw=readFileSync('/proc/'+pid+'/stat','utf8'),match=/^(\d+) \((.*)\) (\S) (.*)$/.exec(raw.trim());
  assert.ok(match,'Malformed process identity');const fields=match[4].split(/\s+/);
  return {pid:Number(match[1]),group:Number(fields[1]),startTicks:fields[18]};
}
function stopCommand(child, identity, signal) {
  if(child.exitCode!==null||!identity)return;
  try {const current=processIdentity(identity.pid);assert.deepEqual(current,identity);assert.equal(current.group,current.pid);process.kill(-current.group,signal);}
  catch(error) {if(error.code!=='ENOENT'&&error.code!=='ESRCH')throw error;}
}
function sourceReceipt(root) {
  const git = args => execFileSync('git', ['-C', root, ...args], {encoding:'utf8'}).trim();
  return {commit:git(['rev-parse','HEAD']), tree:git(['rev-parse','HEAD^{tree}']), clean:git(['status','--porcelain']) === ''};
}
function assertInside(path, root) {
  const rel = relative(root, path);
  assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel), 'Require distinct contained task path');
  assert.ok(!rel.split(/[\\/]/).includes('..'));
}
async function requireFree(port) {
  const server=createServer();
  await new Promise((done, reject) => {server.once('error',reject); server.listen(port,'127.0.0.1',()=>server.close(error=>error?reject(error):done()));});
}
function files(root, sdkRoot) {
  return readdirSync(root,{withFileTypes:true}).flatMap(e => {
    const path=join(root,e.name);
    if(e.isSymbolicLink()) {assert.ok(sdkRoot&&statSync(path).isFile(),'Refuse symlink in retained evidence or SDK directory');assertInside(realpathSync(path),realpathSync(sdkRoot));return [path];}
    return e.isDirectory()?files(path,sdkRoot):e.isFile()?[path]:[];
  });
}
function context() {
  const control=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
  const source=resolve(process.env.ANDROID_AB_SOURCE_ROOT || '');
  const tools=resolve(process.env.ANDROID_AB_TOOLS_ROOT || '');
  const output=join(control,'artifacts/android-renderer-ab');
  const scratch=join(resolve(process.env.RUNNER_TEMP || ''),'android-renderer-ab-'+process.env.GITHUB_RUN_ID);
  const controlSource=sourceReceipt(control);
  assert.equal(controlSource.clean,true,'Reviewed control plane must remain clean');
  const toolingHead=controlSource.commit;
  assertContext(process.env,{platform:platform(),toolingHead,source:sourceReceipt(source),tools:sourceReceipt(tools)});
  assert.equal(process.env.SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD,'1');
  assert.ok(process.env.RUNNER_TEMP && process.env.ANDROID_HOME && process.env.JAVA_HOME);
  assertInside(scratch,resolve(process.env.RUNNER_TEMP));
  return {control,source,tools,output,scratch,toolingHead,archive:join(output,'original.zip'),sdk:resolve(process.env.ANDROID_HOME)};
}
function immutableIdentity(ctx) {
  return {source:PIN.source,tree:PIN.tree,tools:PIN.tools,APKsha256:PIN.apkSha,
    toolingCommit:ctx.toolingHead,runId:process.env.GITHUB_RUN_ID,runAttempt:1,recordedAtUtc:now()};
}
async function command(ctx, label, executable, args, {cwd=ctx.control, env, timeout, allowFailure=false}={}) {
  const directory=join(ctx.output,'commands');
  mkdirSync(directory,{recursive:true});
  const serial=String(readdirSync(directory).filter(n=>n.endsWith('.json')).length+1).padStart(4,'0');
  const stem=serial+'-'+label.replace(/[^a-z0-9_-]/gi,'_');
  const record={...immutableIdentity(ctx),label,executable,args,cwd,state:'running',startedAtUtc:now()};
  const receipt=join(directory,stem+'.json');save(receipt,record);
  let stdout='',stderr='',timer,child;
  const result=await new Promise(done=>{
    child=spawn(executable,args,{cwd,env:env || process.env,detached:true,stdio:['ignore','pipe','pipe']});
    record.pid=child.pid;save(receipt,record);
    child.once('spawn',()=>{try{record.processIdentity=processIdentity(child.pid);activeCommands.add({child,identity:record.processIdentity});save(receipt,record);}catch(error){record.identityError=error.message;}});
    child.stdout.on('data',data=>{appendFileSync(join(directory,stem+'.stdout'),data);stdout+=data.toString('utf8');});
    child.stderr.on('data',data=>{appendFileSync(join(directory,stem+'.stderr'),data);stderr+=data.toString('utf8');});
    child.once('error',error=>done({status:null,error:error.message}));
    child.once('close',(status,signal)=>done({status,signal}));
    if(timeout)timer=setTimeout(()=>{record.timedOut=true;try{stopCommand(child,record.processIdentity,'SIGKILL');}catch(error){record.killError=error.message;}},timeout);
  });
  clearTimeout(timer);
  for(const item of activeCommands)if(item.child===child)activeCommands.delete(item);
  Object.assign(record,result,{state:result.status===0&&!record.timedOut?'passed':'failed',completedAtUtc:now()});save(receipt,record);
  if(!allowFailure)assert.equal(record.state,'passed',label+' failed; retain '+receipt);
  return {...record,stdout,stderr};
}
function childEnv(ctx, arm) {
  const safe=Object.fromEntries(['PATH','HOME','JAVA_HOME','LANG','LC_ALL','LD_LIBRARY_PATH'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  return {...safe,ANDROID_HOME:ctx.sdk,ANDROID_SDK_ROOT:ctx.sdk,RUNNER_TEMP:ctx.scratch,
    SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD:'1',
    SOGRIM_ANDROID_SIGNING_PROPERTIES_FILE:join(ctx.scratch,'no-signing.properties'),
    ANDROID_QA_SOURCE:PIN.source,ANDROID_QA_DEVICE:'emulator-5582',ANDROID_QA_AVD:arm.avd,
    ANDROID_AVD_HOME:join(ctx.scratch,'avds'),ANDROID_USER_HOME:join(ctx.scratch,'android-native-home'),
    ANDROID_EMULATOR_HOME:join(ctx.scratch,'android-native-home'),ADB_VENDOR_KEYS:join(ctx.scratch,'android-native-home/adbkey'),
    ANDROID_ADB_SERVER_PORT:'5037',ADB_SERVER_SOCKET:'tcp:5037',ADB_PATH:join(ctx.sdk,'platform-tools/adb')};
}
function sdkDigest(ctx) {
  const candidates=['emulator','system-images/android-36.1/google_apis_playstore/x86_64','platform-tools','build-tools/36.1.0'];
  const rows=candidates.flatMap(p=>files(join(ctx.sdk,p),ctx.sdk)).sort().map(p=>[relative(ctx.sdk,p),statSync(p).size,sha256File(p)]);
  return {sha256:hash(Buffer.from(JSON.stringify(rows))),files:rows};
}
function adbOwner(ctx, expected) {
  if(expected) {assert.deepEqual(processIdentity(expected.pid),expected.identity);assert.deepEqual(readFileSync('/proc/'+expected.pid+'/cmdline','utf8').split('\0').filter(Boolean),expected.command);return expected;}
  const rows=['/proc/net/tcp','/proc/net/tcp6'].flatMap(p=>readFileSync(p,'utf8').split('\n').slice(1));
  const inodes=rows.map(row=>row.trim().split(/\s+/)).filter(row=>row[3]==='0A'&&row[1]?.split(':')[1]==='13AD').map(row=>row[9]);
  assert.equal(inodes.length,1,'Require exactly one newly prepared ADB5037 listener');
  const owners=[];
  for(const pid of readdirSync('/proc').filter(p=>/^\d+$/.test(p)))try {
    const matches=readdirSync('/proc/'+pid+'/fd').some(fd=>readlinkSync('/proc/'+pid+'/fd/'+fd)==='socket:['+inodes[0]+']');
    if(matches)owners.push(Number(pid));
  } catch(error) {if(!['EACCES','EPERM','ENOENT'].includes(error.code))throw error;}
  assert.equal(owners.length,1,'Require one readable owned ADB server PID');
  const pid=owners[0],command=readFileSync('/proc/'+pid+'/cmdline','utf8').split('\0').filter(Boolean);
  assert.equal(realpathSync(command[0]),realpathSync(join(ctx.sdk,'platform-tools/adb')));
  assert.ok(command.includes('tcp:5037')&&command.includes('fork-server')&&command.includes('server'));
  return {pid,identity:processIdentity(pid),command};
}
async function closeAdb(ctx) {
  const receipt=join(ctx.output,'adb-owner.json');
  if(!existsSync(receipt))return;
  const saved=readJson(receipt);assert.equal(saved.source,PIN.source);assert.equal(saved.runId,process.env.GITHUB_RUN_ID);
  if(existsSync('/proc/'+saved.owner.pid)) {
    adbOwner(ctx,saved.owner);
    await command(ctx,'close-owned-adb',join(ctx.sdk,'platform-tools/adb'),['kill-server'],{env:childEnv(ctx,{id:'A',avd:'sogrim_ci_'+process.env.GITHUB_RUN_ID+'_1_a'}),timeout:15000});
  }
  const end=Date.now()+15000;
  while(existsSync('/proc/'+saved.owner.pid)&&Date.now()<end)await delay(100);
  assert.ok(!existsSync('/proc/'+saved.owner.pid),'Owned ADB process closure unconfirmed');
  await requireFree(5037);save(join(ctx.output,'adb-closure.json'),{...immutableIdentity(ctx),pid:saved.owner.pid,closed:true});
}
async function prepareGlobal(ctx) {
  assert.ok(!existsSync(ctx.scratch),'Refuse an existing experiment scratch directory');
  mkdirSync(ctx.scratch);
  const original=join(ctx.scratch,'original');
  const verified=await command(ctx,'verify-original-artifact','python3',[join(ctx.control,'scripts/qa/android-renderer-ab/verify-artifact.py'),'verify',
    '--archive',ctx.archive,'--source-root',ctx.source,'--tools-root',ctx.tools,'--destination',original]);
  const artifact=JSON.parse(verified.stdout.trim());assertArtifactIdentity(artifact);save(join(ctx.output,'artifact-identity.json'),artifact);
  const api=await import(pathToFileURL(join(ctx.tools,'scripts/qa/android-native-isolated/renderer-capabilities.mjs')));
  const probes=await probeEmulator((...args)=>command(ctx,...args),join(ctx.sdk,'emulator/emulator'));
  const sdk=api.readRendererSdk(ctx.sdk);assertSdk(sdk,probes.version,probes.gpuHelp);
  const digest=sdkDigest(ctx);save(join(ctx.output,'sdk-inputs.json'),{...sdk,stableDigest:digest});
  ctx.sdkDigest=digest.sha256;ctx.original=original;
  for(const port of [5037,5582,5583,9232])await requireFree(port);
  mkdirSync(join(ctx.scratch,'avds'));
}
class NativeAdapter {
  constructor(ctx){this.ctx=ctx;this.traceApi=null;this.emulators=new Map();this.loggers=new Map();}
  paths(arm){return {app:join(this.ctx.scratch,'arms',arm.id,'app'),native:join(this.ctx.scratch,'arms',arm.id,'app/artifacts/android-native-isolated')};}
  async tool(arm,name,extraEnv={}) {
    const {app}=this.paths(arm);
    return command(this.ctx,arm.id+'-'+name,process.execPath,[join(this.ctx.tools,'scripts/qa/android-native-isolated',name+'.mjs')],
      {cwd:app,env:{...childEnv(this.ctx,arm),...extraEnv}});
  }
  async adb(arm,args,options={}) {
    return command(this.ctx,arm.id+'-adb-'+args.slice(0,3).join('-'),join(this.ctx.sdk,'platform-tools/adb'),['-s','emulator-5582',...args],
      {cwd:this.paths(arm).app,env:childEnv(this.ctx,arm),timeout:20000,...options});
  }
  async owner(arm) {
    const emulatorPid=arm.owner?.pid;
    assert.ok(emulatorPid,'No explicit owned emulator PID');
    this.traceApi ||= await import(pathToFileURL(join(this.ctx.tools,'scripts/qa/android-native-isolated/trace-diagnostics.mjs')));
    return this.traceApi.assertHostOwner({emulatorPid,avd:arm.avd,device:'emulator-5582'},{expectedStartTicks:arm.owner.startTicks});
  }
  async phase(arm,name) {
    const ctx=this.ctx,{app,native}=this.paths(arm);
    if(name==='prepare') {
      arm.avd='sogrim_ci_'+process.env.GITHUB_RUN_ID+'_1_'+arm.id.toLowerCase();
      await command(ctx,arm.id+'-clone-source','git',['clone','--no-hardlinks','--no-checkout',ctx.source,app]);
      await command(ctx,arm.id+'-detach-source','git',['-C',app,'checkout','--detach',PIN.source]);
      assert.deepEqual(sourceReceipt(app),{commit:PIN.source,tree:PIN.tree,clean:true});
      await command(ctx,arm.id+'-seed-artifact','python3',[join(ctx.control,'scripts/qa/android-renderer-ab/verify-artifact.py'),'seed','--original',ctx.original,'--app-root',app]);
      const env=childEnv(ctx,arm);
      if(arm.id==='A') {await this.tool(arm,'adb-key-preflight');save(join(ctx.output,'adb-owner.json'),{...immutableIdentity(ctx),owner:adbOwner(ctx)});}
      else {assert.equal(readJson(join(this.paths({id:'A'}).native,'adb-key-preflight.json')).prepared,true,'B cannot retry a failed ADB key/server preparation');adbOwner(ctx,readJson(join(ctx.output,'adb-owner.json')).owner);}
      arm.sdkDigest=ctx.sdkDigest;
      const sdkBin=process.env.ANDROID_AB_SDK_BIN;
      assert.ok(sdkBin && existsSync(join(sdkBin,'avdmanager')),'Require SDK tool path recorded during workflow setup');
      // Explicit noninteractive stdin is the original avdmanager "no" response.
      const log=join(native,'avd.log');mkdirSync(native,{recursive:true});
      const args=['create','avd','-n',arm.avd,'-k',PIN.image,'-d','pixel_6'];
      await new Promise((done,reject)=>{
        const child=spawn(join(sdkBin,'avdmanager'),args,{env,stdio:['pipe','pipe','pipe']});
        child.stdout.on('data',data=>appendFileSync(log,data));child.stderr.on('data',data=>appendFileSync(log,data));
        child.once('error',reject);child.once('close',code=>code===0?done():reject(new Error('avdmanager failed without retry')));
        child.stdin.end('no\n');
      });
      const config=join(env.ANDROID_AVD_HOME,arm.avd+'.avd/config.ini');
      const values={'hw.cpu.ncore':'2','hw.ramSize':'4096','hw.lcd.width':'1080','hw.lcd.height':'2400','hw.lcd.density':'420','hw.keyboard':'yes','hw.camera.back':'none','hw.camera.front':'none'};
      const rows=readFileSync(config,'utf8').split(/\r?\n/).filter(row=>!(row.split('=')[0].trim() in values));
      writeFileSync(config,rows.concat(Object.entries(values).map(([k,v])=>k+' = '+v)).join('\n')+'\n');
      save(join(native,'avd-config-receipt.json'),{...immutableIdentity(ctx),avd:arm.avd,values});
      return {avd:arm.avd,source:sourceReceipt(app),APKsha256:hash(readFileSync(join(app,'android/app/build/outputs/apk/debug/app-debug.apk')))};
    }
    if(name==='renderer-sdk') {
      const result=await command(ctx,arm.id+'-renderer-sdk',process.execPath,[join(ctx.tools,'scripts/qa/android-native-isolated/renderer-capabilities.mjs'),'snapshot'],{cwd:app,env:childEnv(ctx,arm)});
      assert.equal(readJson(join(native,'renderer-sdk.json')).sdk.files.hostVersion.revision,PIN.emulator);
      return {command:result.label,sdkDigest:arm.sdkDigest};
    }
    if(name==='boot') {
      for(const port of [5582,5583,9232])await requireFree(port);
      const executable=join(ctx.sdk,'emulator/emulator'),env=childEnv(ctx,arm);
      const args=['-avd',arm.avd,'-port','5582','-no-window','-no-snapshot','-no-audio','-no-boot-anim','-gpu',arm.gpu,'-feature','GLDirectMem,HasSharedSlotsHostMemoryAllocator','-verbose','-memory','4096','-cores','2'];
      const child=spawn(executable,args,{env,stdio:['ignore','pipe','pipe']});this.emulators.set(arm.id,child);
      child.stdout.on('data',data=>appendFileSync(join(native,'emulator.log'),data));child.stderr.on('data',data=>appendFileSync(join(native,'emulator.log'),data));
      await new Promise((done,reject)=>{child.once('spawn',done);child.once('error',reject);});
      writeFileSync(join(native,'emulator.pid'),String(child.pid)+'\n',{flag:'wx'});
      this.traceApi ||= await import(pathToFileURL(join(ctx.tools,'scripts/qa/android-native-isolated/trace-diagnostics.mjs')));
      arm.owner=this.traceApi.assertHostOwner({emulatorPid:child.pid,avd:arm.avd,device:'emulator-5582'});
      save(join(native,'emulator-owner.json'),{...immutableIdentity(ctx),owner:arm.owner,avd:arm.avd,arm:arm.id});
      save(join(ctx.output,'live-identities',arm.id+'.json'),{...immutableIdentity(ctx),owner:arm.owner,avd:arm.avd,arm:arm.id});
      await this.adb(arm,['wait-for-device'],{timeout:240000});
      let booted=false;
      for(let n=0;n<180;n++){
        await this.owner(arm);
        if((await this.adb(arm,['shell','getprop','sys.boot_completed'])).stdout.trim()==='1'){booted=true;break;}
        await delay(1000);
      }
      assert.ok(booted,'Original boot budget exhausted');
      assert.equal((await this.adb(arm,['emu','avd','name'])).stdout.split(/\r?\n/)[0].trim(),arm.avd);
      return {owner:await this.owner(arm)};
    }
    if(name==='network') {
      await this.owner(arm);await this.tool(arm,'network-isolation',{ANDROID_QA_EMULATOR_PID:String(arm.owner.pid)});
      assert.equal(readJson(join(native,'network-isolation.json')).isolated,true);return {isolated:true};
    }
    if(name==='install') {
      const apk=join(app,'android/app/build/outputs/apk/debug/app-debug.apk');
      assert.equal(hash(readFileSync(apk)),PIN.apkSha);
      const badging=await command(ctx,arm.id+'-badging',join(ctx.sdk,'build-tools/36.1.0/aapt'),['dump','badging',apk],{env:childEnv(ctx,arm),timeout:30000});
      assert.match(badging.stdout,/package: name='com\.sogrimhashbon\.app\.debug' versionCode='190' versionName='4\.58-debug'/);
      const cert=await command(ctx,arm.id+'-certificate',join(ctx.sdk,'build-tools/36.1.0/apksigner'),['verify','--print-certs',apk],{env:childEnv(ctx,arm),timeout:30000});
      assert.match(cert.stdout,new RegExp('Signer #1 certificate SHA-256 digest: '+PIN.certificate));
      await this.adb(arm,['shell','settings','put','secure','show_ime_with_hard_keyboard','1']);
      await this.adb(arm,['install',apk]);
      const installed=(await this.adb(arm,['shell','pm','path','com.sogrimhashbon.app.debug'])).stdout.trim();
      assert.match(installed,/^package:\/data\/app\/[^\r\n]+\/base\.apk$/);
      const retained=join(native,'installed-app-debug.apk');
      await this.adb(arm,['pull',installed.slice(8),retained]);
      assert.equal(hash(readFileSync(retained)),PIN.apkSha,'Installed APK differs from original');
      return {apkSha256:PIN.apkSha,installedAPKVerified:true};
    }
    if(name==='health-before'||name==='health-after') {
      await this.owner(arm);await this.tool(arm,'emulator-health',{ANDROID_QA_HEALTH_PHASE:name==='health-before'?'before':'after'});
      assert.equal(readJson(join(native,'emulator-health-'+(name==='health-before'?'before':'after')+'.json')).healthy,true);
      return {healthy:true};
    }
    if(name==='renderer') {
      await this.owner(arm);
      await command(ctx,arm.id+'-renderer-verify',process.execPath,[join(ctx.tools,'scripts/qa/android-native-isolated/renderer-capabilities.mjs'),'verify'],{cwd:app,env:{...childEnv(ctx,arm),ANDROID_QA_EMULATOR_PID:String(arm.owner.pid)}});
      arm.renderer=assertRenderer(readFileSync(join(native,'emulator.log'),'utf8'),arm.gpu,readJson(join(native,'renderer-capabilities.json')));
      save(join(native,'effective-renderer.json'),arm.renderer);return arm.renderer;
    }
    if(name==='continuous-log') {
      await this.owner(arm);
      const child=spawn(join(ctx.sdk,'platform-tools/adb'),['-s','emulator-5582','logcat','-b','all','-v','threadtime'],{env:childEnv(ctx,arm),stdio:['ignore','pipe','pipe']});
      this.loggers.set(arm.id,child);
      child.stdout.on('data',data=>appendFileSync(join(native,'logcat-live.log'),data));child.stderr.on('data',data=>appendFileSync(join(native,'logcat-live.log'),data));
      await new Promise((done,reject)=>{child.once('spawn',done);child.once('error',reject);});
      save(join(native,'logcat-owner.json'),{pid:child.pid,source:PIN.source,emulator:arm.owner});return {pid:child.pid};
    }
    if(name==='trace-start'||name==='trace-finish') {
      await this.owner(arm);
      await command(ctx,arm.id+'-'+name,process.execPath,[join(ctx.tools,'scripts/qa/android-native-isolated/trace-diagnostics.mjs'),name==='trace-start'?'start':'finish'],
        {cwd:app,env:{...childEnv(ctx,arm),ANDROID_QA_JOB_STATUS:arm.phases.some(p=>p.state==='failed')?'failure':'success'}});
      const report=readJson(join(native,'trace-diagnostics',name==='trace-start'?'trace-start.json':'trace-diagnostics.json'));
      assert.equal(name==='trace-start'?report.captureStarted:report.captureComplete,true);
      return {captureComplete:report.captureComplete??false,nativeAcceptance:false,semanticCoverage:'pending offline loss/scheduling/coverage analysis'};
    }
    if(name==='font-regression'||name==='acceptance'||name==='geometry') {
      await this.owner(arm);
      await this.tool(arm,name==='geometry'?'geometry-regression':name);
      const file=name==='acceptance'?'acceptance/acceptance.json':name==='geometry'?'geometry-regression/geometry-regression.json':'font-regression/font-regression.json';
      const report=readJson(join(native,file));assert.equal(report.ready,true);
      return {ready:true,source:report.provenance?.sourceCommit};
    }
    if(name==='anr-history') {
      await this.owner(arm);
      await this.tool(arm,'anr-diagnostics',{ANDROID_QA_JOB_STATUS:arm.phases.some(p=>p.state==='failed')?'failure':'success'});
      const report=readJson(join(native,'anr-diagnostics/anr-diagnostics.json'));
      assert.equal(report.diagnosticsComplete,true);assert.equal(report.anrHistoryReady,true);
      return {diagnosticsComplete:true,targetAppAnrLines:report.targetAppAnrLines.length};
    }
    if(name==='cleanup') {
      if(arm.owner && existsSync('/proc/'+arm.owner.pid)) {
        await this.owner(arm);
        const forwards=(await this.adb(arm,['forward','--list'])).stdout.trim().split(/\r?\n/).filter(Boolean);
        const relevant=forwards.filter(line=>line.split(/\s+/)[1]==='tcp:9232');
        assert.ok(relevant.every(line=>line.split(/\s+/)[0]==='emulator-5582'),'Foreign CDP forward; refuse touching it');
        if(relevant.length)await this.adb(arm,['forward','--remove','tcp:9232']);
        await this.adb(arm,['emu','kill'],{timeout:15000});
      const deadline=Date.now()+15000;
        while(Date.now()<deadline&&existsSync('/proc/'+arm.owner.pid))await delay(100);
        assert.ok(!existsSync('/proc/'+arm.owner.pid),'Owned emulator did not exit; cannot start B');
      } else assert.ok(arm.owner || !this.emulators.get(arm.id)?.pid,'Unconfirmed emulator owner; refuse adoption or kill');
      const logger=this.loggers.get(arm.id);
      if(logger && logger.exitCode===null&&logger.signalCode===null) {logger.kill('SIGTERM');await new Promise(done=>logger.once('close',done));}
      for(const port of [5582,5583,9232])await requireFree(port);
      assert.deepEqual(sourceReceipt(app),{commit:PIN.source,tree:PIN.tree,clean:true});
      assert.equal(sdkDigest(ctx).sha256,ctx.sdkDigest,'SDK files changed between arms');
      arm.closed=true;return {ownedEmulatorExited:true,portsFree:true,sourceUnchanged:true};
    }
    if(name==='retain-evidence') {
      const destination=join(ctx.output,'arms',arm.id);
      assert.ok(!existsSync(destination),'Refuse overwrite of arm evidence');
      mkdirSync(destination,{recursive:true});
      if(existsSync(native))cpSync(native,join(destination,'native'),{recursive:true,errorOnExist:true,force:false});
      const inventory=files(destination).map(p=>({path:relative(destination,p),bytes:statSync(p).size,sha256:sha256File(p)}));
      save(join(destination,'inventory.json'),{...immutableIdentity(ctx),arm:arm.id,files:inventory});
      arm.evidenceRetained=inventory.length>0;
      assert.ok(arm.evidenceRetained,'Arm has no retained native evidence');return {files:inventory.length};
    }
    throw new Error('Unknown arm phase: '+name);
  }
}
async function finalizeInterrupted(ctx) {
  const pairPath=join(ctx.output,'pair.json');
  assert.ok(existsSync(pairPath),'Missing initialization; cannot infer native ownership');
  const pair=readJson(pairPath),adapter=new NativeAdapter(ctx);
  assert.equal(pair.source,PIN.source);assert.equal(pair.runId,process.env.GITHUB_RUN_ID);
  assert.equal(pair.toolingCommit,ctx.toolingHead);
  if(existsSync(join(ctx.output,'sdk-inputs.json')))ctx.sdkDigest=readJson(join(ctx.output,'sdk-inputs.json')).stableDigest.sha256;
  const records=[];
  for(const arm of pair.arms || []) {
    if(arm.closed&&arm.evidenceRetained)continue;
    const {native}=adapter.paths(arm);
    if(!existsSync(native))continue;
    const identityPath=join(ctx.output,'live-identities',arm.id+'.json');
    if(!arm.owner&&existsSync(identityPath)) {
      const identity=readJson(identityPath);
      assert.equal(identity.source,PIN.source);assert.equal(identity.runId,process.env.GITHUB_RUN_ID);
      assert.equal(identity.toolingCommit,ctx.toolingHead);assert.equal(identity.arm,arm.id);
      assert.equal(identity.avd,'sogrim_ci_'+process.env.GITHUB_RUN_ID+'_1_'+arm.id.toLowerCase());
      arm.owner=identity.owner;arm.avd=identity.avd;
    }
    for(const name of ['trace-finish','anr-history','cleanup','retain-evidence']) {
      const prior=arm.phases?.find(p=>p.name===name);
      // A started finalizer may already have written partial output. Preserve
      // it; this recovery path never reruns a started measurement/finalizer.
      if((name==='trace-finish'||name==='anr-history')&&prior&&['running','failed','passed'].includes(prior.state))continue;
      const record={arm:arm.id,name,state:'running',startedAtUtc:now(),...immutableIdentity(ctx)};records.push(record);
      save(join(ctx.output,'interruption-finalization.json'),{records,nativeAcceptance:false});
      try {record.result=await adapter.phase(arm,name);record.state='passed';}
      catch(error){record.state='failed';record.error=error.stack;}
      record.completedAtUtc=now();save(join(ctx.output,'interruption-finalization.json'),{records,nativeAcceptance:false});
    }
  }
  save(pairPath,{...pair,arms:pair.arms,interruptionFinalization:records,nativeAcceptance:false,releaseAcceptance:false});
  await closeAdb(ctx);
}
async function main() {
  const mode=process.argv[2],ctx=context(),pairPath=join(ctx.output,'pair.json'),journal=join(ctx.output,'phase-history.jsonl');
  if(mode==='--initialize') {
    assert.ok(!existsSync(pairPath),'Refuse another initialized attempt');mkdirSync(ctx.output,{recursive:true});
    save(pairPath,{...immutableIdentity(ctx),state:'initialized',arms:ARMS.map(a=>({...a,state:'planned',attempts:1})),nativeAcceptance:false,releaseAcceptance:false});return;
  }
  if(mode==='--summarize') {
    const pair=readJson(pairPath);
    let verdict;try{verdict=pairVerdict(pair.arms);if(existsSync(join(ctx.output,'adb-owner.json')))assert.equal(readJson(join(ctx.output,'adb-closure.json')).closed,true);}
    catch(error){verdict={controlsPassed:false,error:error.message,nativeAcceptance:false,releaseAcceptance:false};}
    save(join(ctx.output,'final-verdict.json'),{...immutableIdentity(ctx),...verdict});
    assert.equal(verdict.controlsPassed,true,'Missing/failed/incomplete arm; diagnostic is not accepted');return;
  }
  if(mode==='--finalize') {await finalizeInterrupted(ctx);return;}
  assert.equal(mode,'--run');
  assert.equal(readJson(pairPath).state,'initialized','Refuse rerun of started or completed experiment');
  let stopped=false;
  const adapter=new NativeAdapter(ctx);
  const onRecord=arms=>{
    const snapshot={...immutableIdentity(ctx),state:'running',arms,nativeAcceptance:false,releaseAcceptance:false};
    save(pairPath,snapshot);appendFileSync(journal,JSON.stringify(snapshot)+'\n');
  };
  const handler=()=>{stopped=true;appendFileSync(journal,JSON.stringify({...immutableIdentity(ctx),signal:'interrupted',nativeAcceptance:false})+'\n');for(const item of activeCommands)try{stopCommand(item.child,item.identity,'SIGTERM');}catch(error){appendFileSync(journal,JSON.stringify({signalCleanupError:error.message})+'\n');}};
  process.once('SIGINT',handler);process.once('SIGTERM',handler);
  try {
    save(pairPath,{...readJson(pairPath),state:'preparing',preparationStartedAtUtc:now()});
    await prepareGlobal(ctx);
    const result=await executePair(adapter,{onRecord,shouldStop:()=>stopped});
    save(pairPath,{...immutableIdentity(ctx),state:'completed',...result,completedAtUtc:now()});
    assert.equal(result.controlsPassed,true,'One or both diagnostic arms failed; retained failures remain terminal');
  }catch(error) {
    const pair=readJson(pairPath);save(pairPath,{...pair,state:pair.state==='completed'?'completed':'interrupted-or-preflight-failed',error:error.stack,nativeAcceptance:false,releaseAcceptance:false});
    throw error;
  }finally {process.removeListener('SIGINT',handler);process.removeListener('SIGTERM',handler);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.stack);process.exitCode=1;});
