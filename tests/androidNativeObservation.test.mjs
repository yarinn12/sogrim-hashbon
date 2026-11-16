import test from 'node:test';
import assert from 'node:assert/strict';
const {observeFreshWebViewBounds}=await import(process.env.ANDROID_QA_OBSERVATION_TEST_MODULE||'../scripts/qa/android-native-isolated/native-observation.mjs');
const packageName='com.sogrimhashbon.app.debug';
const xml=packageName=>`<hierarchy><node class="android.webkit.WebView" package="${packageName}" bounds="[0,80][1080,2300]"/></hierarchy>`;

test('a failed UI observation uses a new dump before allowing one subsequent Native input',async()=>{
  const paths=[],records=[];let reads=0,inputs=0;
  const observed=await observeFreshWebViewBounds({packageName,makePath:n=>'/sdcard/fresh-'+n+'.xml',dump:path=>{paths.push(path);if(paths.length===1)throw new Error('Nonzero ADB status despite dumped-to stdout');return 'UI hierchary dumped to: '+path;},read:()=>{reads++;return xml(packageName);},delay:async()=>{},onAttempt:record=>records.push(record)});
  inputs++;
  assert.deepEqual(paths,['/sdcard/fresh-1.xml','/sdcard/fresh-2.xml']);assert.equal(reads,1);assert.equal(inputs,1);assert.equal(records[0].ok,false);assert.equal(records[1].ok,true);assert.deepEqual(observed.bounds,[0,80,1080,2300]);
});
test('observation retries are bounded and foreign or stale dumps cannot authorize a tap',async()=>{
  let dumps=0;const records=[];
  await assert.rejects(observeFreshWebViewBounds({packageName,makePath:n=>'/sdcard/new-'+n+'.xml',dump:path=>{dumps++;return 'UI hierchary dumped to: '+path;},read:()=>xml('unrelated.app'),delay:async()=>{},onAttempt:record=>records.push(record)}),/failed before any input/);
  assert.equal(dumps,3);assert.equal(records.length,3);assert.ok(records.every(record=>!record.ok));
  let reads=0;
  await assert.rejects(observeFreshWebViewBounds({packageName,makePath:n=>'/sdcard/new-'+n+'.xml',dump:()=> 'UI hierchary dumped to: /sdcard/old.xml',read:()=>{reads++;return xml(packageName);},delay:async()=>{}}),/new unique path/);assert.equal(reads,0);
});
