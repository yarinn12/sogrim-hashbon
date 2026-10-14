import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectAdbOwnerProcess} from '../scripts/qa/android-renderer-ab/adb-owner.mjs';
const sdk='/sdk/platform-tools/adb',pid=4123;
function proc({exe=sdk,argv0='adb',start='991',command}={}){
 const args=command??[argv0,'-L','tcp:5037','fork-server','server','--reply-fd','4'];
 return {identityFor:()=>({pid,group:pid,startTicks:start}),readFile:path=>{
   assert.equal(path,'/proc/'+pid+'/cmdline');return args.join('\0')+'\0';
 },realpath:path=>{
   if(path==='/proc/'+pid+'/exe')return exe;
   if(path===sdk)return sdk;
   throw Object.assign(new Error('ENOENT: no such file or directory, lstat '+path),{code:'ENOENT'});
 }};
}
test('actual ADB argv basename is valid only with the kernel SDK executable; OLD cwd resolution rejects it',async t=>{
 const filesystem=proc();
 const expected=inspectAdbOwnerProcess(pid,sdk,filesystem);
 assert.equal(expected.command[0],'adb');assert.equal(expected.executable,sdk);
 assert.deepEqual(inspectAdbOwnerProcess(pid,sdk,filesystem,expected),expected);
 assert.equal(inspectAdbOwnerProcess(pid,sdk,proc({argv0:sdk})).executable,sdk);
 const directory=mkdtempSync(join(tmpdir(),'adb-owner-control-')),file=join(directory,'old-argv-resolution.mjs');
 t.after(()=>{assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));unlinkSync(file);rmdirSync(directory);});
 const source=readFileSync(new URL('../scripts/qa/android-renderer-ab/adb-owner.mjs',import.meta.url),'utf8');
 const old=source.replace("realpath('/proc/'+pid+'/exe')","realpath(command[0])");
 assert.notEqual(old,source);writeFileSync(file,old);
 const baseline=await import(pathToFileURL(file));
 assert.throws(()=>baseline.inspectAdbOwnerProcess(pid,sdk,filesystem),{code:'ENOENT'});
});
test('kernel executable, socket role, full command and PID reuse checks remain mandatory',()=>{
 const expected=inspectAdbOwnerProcess(pid,sdk,proc());
 assert.throws(()=>inspectAdbOwnerProcess(pid,sdk,proc({exe:'/other/adb',argv0:sdk})),/exact SDK executable/);
 assert.throws(()=>inspectAdbOwnerProcess(pid,sdk,proc({start:'992'}),expected),/PID reused/);
 assert.throws(()=>inspectAdbOwnerProcess(pid,sdk,proc({argv0:sdk}),expected),/command identity changed/);
 for(const command of [['adb','fork-server','server','tcp:5038'],['adb','server','tcp:5037'],['adb','fork-server','tcp:5037']])
   assert.throws(()=>inspectAdbOwnerProcess(pid,sdk,proc({command})),/reviewed socket role/);
 assert.throws(()=>inspectAdbOwnerProcess(1,sdk,proc()),/explicit ADB server PID/);
 assert.throws(()=>inspectAdbOwnerProcess(pid,sdk,{...proc(),realpath:()=>{throw Object.assign(new Error('unreadable process executable'),{code:'EACCES'});}}),{code:'EACCES'});
});
