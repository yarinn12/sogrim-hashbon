import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,writeFileSync,readFileSync,openSync,closeSync,fstatSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {profileCommand,openProfileStdout,profileOutputIdentity} from '../scripts/qa/android-host-profile/stdio.mjs';

test('READY is visible before the owned profiler exits with the actual launch argv and stdout binding',async()=>{
  const root=mkdtempSync(join(tmpdir(),'host-profile-ready-')),dataPath=join(root,'profile.txt');writeFileSync(dataPath,'',{mode:0o600});
  const command=profileCommand({tool:'/usr/bin/bpftrace'},{pid:1234},dataPath,join(root,'scope.bt'));
  const stdout=openProfileStdout(root,dataPath),stderr=openSync(join(root,'stderr.log'),'wx',0o600);
  let child,closed;
  try{
    child=spawn(process.execPath,[fileURLToPath(new URL('./helpers/androidHostProfileOutputFixture.mjs',import.meta.url)),...command.slice(1)],{env:{},stdio:['ignore',stdout,stderr,'ipc'],windowsHide:true});
    closed=once(child,'close');const [generated]=await once(child,'message');assert.equal(generated.type,'ready-generated');
    assert.equal(child.exitCode,null,'READY must be inspected while the owned child is alive');
    assert.match(readFileSync(dataPath,'utf8'),/SOGRIM_PROFILE_READY 1234 999\n/,'READY must be visible before owned process exit, not only after file-stream close');
  }finally{
    if(child?.connected)child.send('finish');
    if(closed){const [code,signal]=await closed;assert.equal(code,0,'Synthetic owned fixture must close normally');assert.equal(signal,null);}
    closeSync(stdout);closeSync(stderr);
  }
});

test('raw startup and stop records remain in the same private output after owned close',async()=>{
  const root=mkdtempSync(join(tmpdir(),'host-profile-close-')),dataPath=join(root,'profile.txt');writeFileSync(dataPath,'',{mode:0o600});
  const command=profileCommand({tool:'/usr/bin/bpftrace'},{pid:1234},dataPath,join(root,'scope.bt')),stdout=openProfileStdout(root,dataPath),stderr=openSync(join(root,'stderr.log'),'wx',0o600);
  try{
    const child=spawn(process.execPath,[fileURLToPath(new URL('./helpers/androidHostProfileOutputFixture.mjs',import.meta.url)),...command.slice(1)],{env:{},stdio:['ignore',stdout,stderr,'ipc'],windowsHide:true}),closed=once(child,'close');
    await once(child,'message');child.send('finish');const [code,signal]=await closed;assert.equal(code,0);assert.equal(signal,null);
    const raw=readFileSync(dataPath,'utf8');assert.match(raw,/Attaching 4 probes/);assert.match(raw,/SOGRIM_PROFILE_READY 1234 999/);assert.match(raw,/SOGRIM_PROFILE_STOPPED/);
  }finally{closeSync(stdout);closeSync(stderr);}
});

test('inherited stdout names the pinned output inode/device and the fixed argv has no separate ofstream',()=>{
  const root=mkdtempSync(join(tmpdir(),'host-profile-fd-')),dataPath=join(root,'profile.txt'),program=join(root,'scope.bt');writeFileSync(dataPath,'',{mode:0o600});
  const pinned=profileOutputIdentity(dataPath),fd=openProfileStdout(root,dataPath);
  try{const actual=fstatSync(fd,{bigint:true});assert.deepEqual({device:String(actual.dev),inode:String(actual.ino)},pinned);assert.deepEqual(profileCommand({tool:'/usr/bin/bpftrace'},{pid:1234},dataPath,program),['/usr/bin/bpftrace','-B','line','-kk','-p','1234',program]);}
  finally{closeSync(fd);}
});
