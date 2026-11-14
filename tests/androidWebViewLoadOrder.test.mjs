import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createActivityLoadProbe} from './helpers/androidWebViewLoadProbe.mjs';

let probe;
before(()=>{probe=createActivityLoadProbe(fileURLToPath(new URL('../android/app/src/main/java/com/sogrimhashbon/app/MainActivity.java',import.meta.url)));});
after(()=>probe?.close());

test('an installed-version update clears resource cache before the first application navigation',()=>{
 const result=probe.run('update');
 assert.deepEqual(result.navigations,['fresh-bundle']);
 assert.equal(result.clears,1);assert.equal(result.storedVersion,190);
 assert.equal(result.puts,1);assert.equal(result.accountRetained,true);
});
test('QA still refreshes each fresh activity, including a same-version rebuilt bundle, with one navigation each',()=>{
 const result=probe.run('qa');
 assert.deepEqual(result.navigations,['fresh-bundle','fresh-bundle']);
 assert.equal(result.clears,2);assert.equal(result.puts,0);
 assert.equal(result.accountRetained,true);
});
test('an unchanged release version keeps its resource cache and account state',()=>{
 const result=probe.run('same');
 assert.deepEqual(result.navigations,['current-bundle']);
 assert.equal(result.clears,0);assert.equal(result.puts,0);assert.equal(result.accountRetained,true);
});
test('restoring an activity keeps the saved-state cache policy without marking a version update',()=>{
 const result=probe.run('restored');
 assert.deepEqual(result.navigations,['restored-bundle']);
 assert.equal(result.clears,0);assert.equal(result.puts,0);assert.equal(result.storedVersion,187);
});
test('a missing version marker refreshes resources before navigation and retains user state',()=>{
 const result=probe.run('missing');
 assert.deepEqual(result.navigations,['fresh-bundle']);
 assert.equal(result.clears,1);assert.equal(result.storedVersion,190);assert.equal(result.accountRetained,true);
});
test('a failed cache refresh cannot first start the application from stale resources',()=>{
 const result=probe.run('cache-failure');
 assert.equal(result.threw,true);assert.deepEqual(result.navigations,[]);
 assert.equal(result.accountRetained,true);
});

test('a failed cache clear leaves the version pending so the next launch refreshes before navigation',()=>{
 const result=probe.run('cache-retry');
 assert.equal(result.threw,true);
 assert.equal(result.firstStoredVersion,187,'failed clear must not mark the new bundle as refreshed');
 assert.equal(result.firstPuts,0,'no installed-version write before successful clear');
 assert.deepEqual(result.navigations,['fresh-bundle']);
 assert.equal(result.clears,2);
 assert.equal(result.storedVersion,190);
 assert.equal(result.puts,1);
 assert.equal(result.accountRetained,true);
});
