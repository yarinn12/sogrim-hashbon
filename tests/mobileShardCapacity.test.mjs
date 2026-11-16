import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MOBILE_SHARD_JOBS} from '../scripts/lib/release-ci-policy.mjs';
const workflow=readFileSync(new URL('../.github/workflows/qa.yml',import.meta.url),'utf8');
const jobs=[...workflow.matchAll(/^  ([a-z][a-z0-9-]*):\r?$/gm)];
const job=name=>{const i=jobs.findIndex(m=>m[1]===name);return i<0?'':workflow.slice(jobs[i].index,jobs[i+1]?.index??workflow.length);};
const matrix=block=>block.match(/shard: \[([^\]]+)\]/)?.[1].split(',').map(n=>Number(n.trim()));

test('each mobile browser profile has eight complete isolated single-worker shards',()=>{
  const m=job('mobile');
  assert.deepEqual(matrix(m),[1,2,3,4,5,6,7,8]);
  assert.match(m,/project: \[android-mobile, ipad-webkit, reflow-200\]/);
  assert.match(m,/timeout-minutes: 40/);assert.match(m,/fail-fast: false/);
  assert.match(m,/--shard=\$\{\{ matrix\.shard \}\}\/8/);
  assert.match(m,/verify-shard-capacity\.mjs/);
  assert.match(m,/write-iphone-shard-receipt\.mjs \$\{\{ matrix\.project \}\} \$\{\{ matrix\.shard \}\} 8/);
  assert.doesNotMatch(m,/--workers|--retries|--grep|--test-match/);
  for(const project of ['iphone-webkit','iphone-large-text'])for(const group of [1,2]){
    const b=job(`mobile-${project}-shard-${group}`);
    assert.deepEqual(matrix(b),group===1?[1,2,3,4]:[5,6,7,8]);
    assert.match(b,/timeout-minutes: 40/);assert.match(b,/fail-fast: false/);
    assert.match(b,/--shard=\$\{\{ matrix\.shard \}\}\/8/);
    assert.match(b,/verify-shard-capacity\.mjs/);
    assert.match(b,new RegExp('write-iphone-shard-receipt\\.mjs '+project+' \\$\\{\\{ matrix\\.shard \\}\\} 8'));
    assert.doesNotMatch(b,/--workers|--retries|--grep|--test-match/);
  }
  assert.equal(MOBILE_SHARD_JOBS.length,40);assert.equal(new Set(MOBILE_SHARD_JOBS).size,40);
});
test('all eight mobile results and source inventories are required before release',()=>{
  for(const name of ['mobile-coverage','mobile-iphone-webkit','mobile-iphone-large-text']){
    const b=job(name);assert.match(b,/always\(\)/);
    assert.match(b,/merge-multiple: false/);assert.match(b,/for shard in \$\(seq 1 8\)/);
    assert.match(b,/verify-large-text-shards\.mjs --shard-count 8 inventory shards/);
    assert.match(b,/test "\$\(git rev-parse HEAD\)" = "\$EXPECTED_SOURCE"/);
  }
  assert.match(job('unit-and-mobile'),/MOBILE_COVERAGE_RESULT/);
});
test('maximum preview and actual iOS accessibility-equivalent phone checks stay mandatory once',()=>{
  const b=job('mobile-iphone-large-text-shard-1');
  assert.match(b,/if: \$\{\{ matrix\.shard == 1 \}\}/);
  assert.match(b,/for size in 32 37\.64706/);
  assert.match(b,/PW_DYNAMIC_TYPE_SIZE="\$size"/);
  assert.match(b,/e2e\/iphone-landscape-proportions\.spec\.mjs/);
});
