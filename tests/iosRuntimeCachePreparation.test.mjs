import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,realpathSync,lstatSync} from 'node:fs';
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
function executePreparation(workflow,cacheExit) {
  const base=realpathSync(tmpdir());
  const cwd=mkdtempSync(join(base,'ios-cache-'));
  try {
    mkdirSync(join(cwd,'bin'));mkdirSync(join(cwd,'build/native-parity'),{recursive:true});
    writeFileSync(join(cwd,'calls.log'),'');writeFileSync(join(cwd,'state.txt'),'Booted\n');
    const stubs={
      xcrun:`#!/bin/bash
printf '%s\\n' "xcrun $*" >> "$CASE_CALLS"
if [[ "$*" == 'simctl runtime dyld_shared_cache update --all' ]]; then exit "$CACHE_EXIT"; fi
if [[ "$1 $2" == 'simctl shutdown' || "$1 $2" == 'simctl erase' ]]; then printf 'Shutdown\\n' > "$CASE_STATE"; fi
if [[ "$1 $2" == 'simctl boot' ]]; then printf 'Booted\\n' > "$CASE_STATE"; fi
if [[ "$1 $2" == 'simctl list' ]]; then printf '{}\\n'; fi
`,
      python3:`#!/bin/bash
cat > /dev/null
if [[ "$1" == '-c' ]]; then cat "$CASE_STATE"; else printf 'PROBE_UDID=00000000-0000-4000-8000-000000000001\\nPROBE_IOS=26.5\\nPROBE_DEVICE=synthetic\\n'; fi
`,
      xcodebuild:`#!/bin/bash
printf '%s\\n' "xcodebuild $*" >> "$CASE_CALLS"
`,
      node:`#!/bin/bash
printf 'PROBE_HTTP_READY\\nPROBE_HTTP_REDIRECT\\n'
`
    };
    for(const [name,body] of Object.entries(stubs))writeFileSync(join(cwd,'bin',name),body,{mode:0o755});
    const script=`export CASE_CALLS="$PWD/calls.log" CASE_STATE="$PWD/state.txt" PROBE_FIXTURES="$PWD/fixtures" GITHUB_WORKSPACE="$PWD"\nexport PATH="$PWD/bin:$PATH"\n`+scriptFromWorkflow(workflow);
    writeFileSync(join(cwd,'setup.sh'),script);
    const env=Object.fromEntries(['PATH','SystemRoot','WINDIR','COMSPEC','TEMP','TMP','TMPDIR','HOME','USERPROFILE'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
    Object.assign(env,{CACHE_EXIT:String(cacheExit),SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD:'1'});
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

for(const workflow of workflows) {
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
