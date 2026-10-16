import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {createActivityLoadProbe} from './helpers/androidWebViewLoadProbe.mjs';

const activity=fileURLToPath(new URL('../android/app/src/main/java/com/sogrimhashbon/app/MainActivity.java',import.meta.url));
let probe;
before(()=>{probe=createActivityLoadProbe(activity);});
after(()=>probe?.close());

test('the Android view boundary gives an unknown resource id no cache-refresh credit',()=>{
 const parent=resolve(tmpdir()),directory=mkdtempSync(join(parent,'sogrim-wrong-view-id-'));
 let mutant;
 try{
  const source=readFileSync(activity,'utf8'),id='com.getcapacitor.android.R.id.webview';
  assert.equal(source.split(id).length,2,'the controlled mutation must change exactly one actual resource lookup');
  const path=join(directory,'MainActivity.java');
  writeFileSync(path,source.replace(id,id+' + 1'));
  mutant=createActivityLoadProbe(path);
  const result=mutant.run('update');
  assert.equal(result.clears,0);assert.equal(result.puts,0);
  assert.deepEqual(result.navigations,['old-bundle']);
 }finally{
  mutant?.close();assert.equal(dirname(resolve(directory)),parent);
  rmSync(directory,{recursive:true,force:true});
 }
});
test('synthetic cookie and storage deletion is observable rather than a constant retained result',()=>{
 assert.equal(probe.run('update').accountRetained,true);
 assert.equal(probe.run('storage-wipe').accountRetained,false);
});
