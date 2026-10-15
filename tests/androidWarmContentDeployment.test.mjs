import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('warm-content diagnostic branch explicitly disables web deployment',()=>{
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.equal(config.git.deploymentEnabled['codex/android-warm-content-abba-20261016'],false);
 assert.equal(config.git.deploymentEnabled['codex/android-warm-runtime-abba-20261016'],false);
});
