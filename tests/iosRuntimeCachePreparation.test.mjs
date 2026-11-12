import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,realpathSync,lstatSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {spawnSync} from 'node:child_process';

const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'/bin/bash';
const workflows=[
  {file:'ios-auth-return-qa.yml',step:'Build and run the real system-session redirect with synthetic account data',output:'build/probe/runtime-cache-preparation.log'},
  {file:'ios-parity-qa.yml',step:'Build unsigned Debug before booting a clean iPhone 15 or 16',output:'build/native-parity/runtime-cache-preparation.log'}
];

function scriptFromWorkflow({file,step}) {
  const lines=readFileSync(new URL('../.github/workflows/'+file,import.meta.url),'utf8').split(/\r?\n/);
  const start=lines.indexOf('      - name: '+step);assert.ok(start>=0,'missing native preparation step');
  let end=lines.findIndex((line,index)=>index>start&&/^      - /.test(line));if(end<0)end=lines.length;
  const run=lines.findIndex((line,index)=>index>start&&index<end&&line==='        run: |');
  assert.ok(run>start,'preparation must be a literal shell script');
  return lines.slice(run+1,end).map(line=>{assert.ok(!line.trim()||line.startsWith('          '));return line.slice(10);}).join('\n');
}

// Run the actual preparation step with synthetic tool processes. A failed
// cache operation must stop GitHub's `bash -e` before any boot/build/test.
// No Apple executable, simulator, app, network request or provider key is used.
function executePreparation(workflow,cacheExit,options={}) {
  const base=realpathSync(tmpdir());
  const cwd=mkdtempSync(join(base,'ios-cache-'));
  try {
    mkdirSync(join(cwd,'bin'));mkdirSync(join(cwd,'build/native-parity'),{recursive:true});
    const bootVerifier=new URL('../scripts/qa/native-auth-session/verify-ios-simulator-boot.mjs',import.meta.url);
    if(existsSync(bootVerifier)){mkdirSync(join(cwd,'scripts/qa/native-auth-session'),{recursive:true});writeFileSync(join(cwd,'scripts/qa/native-auth-session/verify-ios-simulator-boot.mjs'),readFileSync(bootVerifier));}
    writeFileSync(join(cwd,'calls.log'),'');writeFileSync(join(cwd,'state.txt'),options.coldBuild?'Shutdown\n':'Booted\n');
    const stubs={
      xcrun:`#!/bin/bash
printf '%s\\n' "xcrun $*" >> "$CASE_CALLS"
if [[ "$*" == 'simctl runtime dyld_shared_cache update --all' ]]; then exit "$CACHE_EXIT"; fi
if [[ "$1 $2" == 'simctl shutdown' ]]; then
  if [[ "$SHUTDOWN_STUCK" != '1' ]]; then printf 'Shutdown\\n' > "$CASE_STATE"; fi
fi
if [[ "$1 $2" == 'simctl erase' ]]; then printf 'Shutdown\\n' > "$CASE_STATE"; fi
if [[ "$1 $2" == 'simctl boot' ]]; then printf 'Booted\\n' > "$CASE_STATE"; fi
if [[ "$1 $2" == 'simctl bootstatus' ]]; then
  if [[ "$BOOT_STATUS_EXIT" != '0' ]]; then exit "$BOOT_STATUS_EXIT"; fi
  owner="$3"; if [[ "$BOOT_TRANSCRIPT" == foreign || "$BOOT_TRANSCRIPT" == already-booted-foreign ]]; then owner=00000000-0000-4000-8000-000000000002; fi
  printf 'Monitoring boot status for Synthetic native probe (%s).\\n' "$owner"
  if [[ "$BOOT_TRANSCRIPT" == already-booted || "$BOOT_TRANSCRIPT" == already-booted-foreign ]]; then printf 'Device already booted, nothing to do.\\n';
  elif [[ "$BOOT_TRANSCRIPT" == already-booted-failed ]]; then printf 'Status=3, isTerminal=YES, Elapsed=00:05.\\n\\tData Migration Failed\\nDevice already booted, nothing to do.\\n';
  elif [[ "$BOOT_TRANSCRIPT" == already-booted-incomplete ]]; then printf 'Status=2, isTerminal=NO, Elapsed=00:05.\\nDevice already booted, nothing to do.\\n';
  elif [[ "$BOOT_TRANSCRIPT" == migration-failed ]]; then printf 'Status=3, isTerminal=YES, Elapsed=14:48.\\n\\tData Migration Failed\\n';
  elif [[ "$BOOT_TRANSCRIPT" == incomplete ]]; then printf 'Status=2, isTerminal=NO, Elapsed=00:05.\\n\\tWaiting on Data Migration\\n';
  else printf 'Status=4294967295, isTerminal=YES, Elapsed=00:05.\\n\\tFinished\\n'; fi
fi
if [[ "$1 $2" == 'simctl list' ]]; then printf '{}\\n'; fi
`,
      python3:`#!/bin/bash
cat > /dev/null
if [[ "$1" == '-c' ]]; then cat "$CASE_STATE"; else printf 'PROBE_UDID=00000000-0000-4000-8000-000000000001\\nPROBE_IOS=26.5\\nPROBE_DEVICE=synthetic\\n'; fi
`,
      xcodebuild:`#!/bin/bash
printf '%s\\n' "xcodebuild $*" >> "$CASE_CALLS"
if [[ "$COLD_BUILD" == '1' && "$*" == *'build-for-testing'* ]]; then
  if [[ "$(cat "$CASE_STATE")" != 'Shutdown' ]]; then
    printf 'Compilation overlapped a running simulator\\n' >&2; exit 73
  fi
  # Some Xcode preparation can start a guest. The real step must shut it down
  # and erase only its owned device before the measured authentication test.
  printf 'Booted\\n' > "$CASE_STATE"
fi
`,
      node:`#!/bin/bash
if [[ "$1" == 'scripts/qa/native-auth-session/verify-ios-simulator-boot.mjs' ]]; then exec "$REAL_TEST_NODE" "$@"; fi
printf 'PROBE_HTTP_READY\\nPROBE_HTTP_REDIRECT\\n'
`
    };
    for(const [name,body] of Object.entries(stubs))writeFileSync(join(cwd,'bin',name),body,{mode:0o755});
    const script=`export CASE_CALLS="$PWD/calls.log" CASE_STATE="$PWD/state.txt" PROBE_FIXTURES="$PWD/fixtures" GITHUB_WORKSPACE="$PWD"\nexport PATH="$PWD/bin:$PATH"\n`+scriptFromWorkflow(workflow);
    writeFileSync(join(cwd,'setup.sh'),script);
    const env=Object.fromEntries(['PATH','SystemRoot','WINDIR','COMSPEC','TEMP','TMP','TMPDIR','HOME','USERPROFILE'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
    Object.assign(env,{CACHE_EXIT:String(cacheExit),COLD_BUILD:options.coldBuild?'1':'0',SHUTDOWN_STUCK:options.shutdownStuck?'1':'0',SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD:'1',BOOT_TRANSCRIPT:options.bootTranscript??'finished',BOOT_STATUS_EXIT:String(options.bootStatusExit??0),REAL_TEST_NODE:process.execPath.replaceAll('\\','/')});
    const r=spawnSync(bash,['--noprofile','--norc','-e','setup.sh'],{cwd,env,encoding:'utf8',windowsHide:true,timeout:30_000});
    assert.ifError(r.error);assert.equal(r.signal,null);
    return {status:r.status,stderr:r.stderr,calls:readFileSync(join(cwd,'calls.log'),'utf8').trim().split(/\r?\n/).filter(Boolean)};
  } finally {
    assert.equal(realpathSync(dirname(cwd)),base);
    assert.match(basename(cwd),/^ios-cache-/);
    assert.equal(lstatSync(cwd).isSymbolicLink(),false);
    rmSync(cwd,{recursive:true,force:true});
  }
}

test('AuthReturn compiles without a running guest, then shuts down, verifies, erases and boots the owned simulator before XCTest',()=>{
  const r=executePreparation(workflows[0],0,{coldBuild:true});
  assert.equal(r.status,0,r.stderr);
  const build=r.calls.findIndex(line=>line.startsWith('xcodebuild ')&&line.includes('build-for-testing'));
  const shutdown=r.calls.indexOf('xcrun simctl shutdown 00000000-0000-4000-8000-000000000001');
  const erase=r.calls.indexOf('xcrun simctl erase 00000000-0000-4000-8000-000000000001');
  const boot=r.calls.indexOf('xcrun simctl boot 00000000-0000-4000-8000-000000000001');
  const ready=r.calls.indexOf('xcrun simctl bootstatus 00000000-0000-4000-8000-000000000001 -b');
  const run=r.calls.findIndex(line=>line.startsWith('xcodebuild ')&&line.includes('test-without-building'));
  assert.ok(build>=0&&shutdown>build&&erase>shutdown&&boot>erase&&ready>boot&&run>ready,JSON.stringify(r.calls));
  assert.equal(r.calls.filter(line=>line.startsWith('xcodebuild ')&&line.includes('build-for-testing')).length,1);
  assert.equal(r.calls.filter(line=>line.startsWith('xcodebuild ')&&line.includes('test-without-building')).length,1);
});

test('AuthReturn refuses to erase or test when its owned simulator did not shut down after compilation',()=>{
  const r=executePreparation(workflows[0],0,{coldBuild:true,shutdownStuck:true});
  assert.notEqual(r.status,0);
  assert.ok(r.calls.some(line=>line.startsWith('xcrun simctl shutdown ')));
  assert.ok(!r.calls.some(line=>line.startsWith('xcrun simctl erase ')||line.startsWith('xcrun simctl boot ')||line.includes('test-without-building')));
});

for(const workflow of workflows) {
  test(workflow.file+': exact owned-device already-booted success permits native measurement',()=>{
    const r=executePreparation(workflow,0,{bootTranscript:'already-booted'});assert.equal(r.status,0,r.stderr);
    assert.ok(r.calls.some(line=>line.startsWith('xcrun simctl bootstatus ')));
    if(workflow.file==='ios-auth-return-qa.yml')assert.ok(r.calls.some(line=>line.includes('test-without-building')));
  });
  for(const bootTranscript of ['migration-failed','incomplete','foreign','already-booted-foreign','already-booted-failed','already-booted-incomplete'])test(workflow.file+': zero-exit '+bootTranscript+' boot status blocks native measurement',()=>{
    const r=executePreparation(workflow,0,{bootTranscript});assert.notEqual(r.status,0,r.stderr);
    assert.ok(r.calls.some(line=>line.startsWith('xcrun simctl bootstatus ')));
    assert.ok(!r.calls.some(line=>line.includes('test-without-building')));
  });
  test(workflow.file+': a nonzero bootstatus remains a failure before native measurement',()=>{
    const r=executePreparation(workflow,0,{bootStatusExit:77});assert.equal(r.status,77,r.stderr);
    assert.ok(!r.calls.some(line=>line.includes('test-without-building')));
  });
  test(workflow.file+': complete cache preparation once before the simulator boots',()=>{
    const r=executePreparation(workflow,0);assert.equal(r.status,0,r.stderr);
    const cache=r.calls.indexOf('xcrun simctl runtime dyld_shared_cache update --all');
    const boot=r.calls.findIndex(line=>line.startsWith('xcrun simctl boot '));
    const build=r.calls.findIndex(line=>line.startsWith('xcodebuild '));
    assert.ok(cache>=0&&boot>cache&&build>cache,'cache barrier must finish before boot and build');
    assert.equal(r.calls.filter(line=>line==='xcrun simctl runtime dyld_shared_cache update --all').length,1);
    assert.match(scriptFromWorkflow(workflow),new RegExp('> '+workflow.output.replaceAll('.','\\.')+' 2>&1'));
  });
  test(workflow.file+': a failed cache preparation blocks simulator boot and XCTest',()=>{
    const r=executePreparation(workflow,37);assert.equal(r.status,37,r.stderr);
    assert.deepEqual(r.calls,['xcrun simctl runtime dyld_shared_cache update --all']);
  });
}
