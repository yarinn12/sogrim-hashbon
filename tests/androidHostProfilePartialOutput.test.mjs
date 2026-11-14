import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseProfileOutput,profileHealth} from '../scripts/qa/android-host-profile/profile-contract.mjs';

// Exact selected map records from original run42317759888 artifact13552666441.
// Full raw SHA256:578a5c45768ba0446dc9c48fab6b3f4a9b9ec729f1de609eb0c7e50fb9a7e725.
// The original run remains failed; this fixture is an excerpt, not its result.
const raw=JSON.parse(readFileSync(new URL('./fixtures/android-host-profile-inline-empty-42317759888.json',import.meta.url),'utf8')).output;
const owner={pid:3620,startTicks:'15518'};

test('recorded inline empty stacks retain unknown sample weights alongside valid frames',()=>{
  for(const output of [raw,raw.replaceAll('\n','\r\n')]){
  const parsed=parseProfileOutput(output,owner);
  assert.equal(parsed.rows.length,4);assert.equal(parsed.totalSamples,52);
  assert.equal(parsed.unknownFrameRows,2);assert.equal(parsed.unknownStackSamples,50);
  assert.deepEqual(parsed.rows.map(r=>[r.tid,r.count,r.frames]),[[3801,1,['0x5573c424789f']],[3803,1,['0x5573c42477d8']],[5708,1,[]],[3668,49,[]]]);
  assert.equal(parsed.stopped,true);assert.equal(parsed.unwindCompletenessProven,false);
  }
});

test('partial parsing keeps helper warnings and does not produce a clean or loss-free profile',()=>{
  const parsed=parseProfileOutput(raw,owner);
  const health=profileHealth({stdout:raw,stderr:'WARNING: Bad address\nAdditional Info - helper: get_stackid, retcode: -14\n',fileBytes:Buffer.byteLength(raw),exitCode:0,parsed});
  assert.equal(health.cleanTechnicalStop,false);assert.equal(health.unknownStackSamples,50);
  assert.equal(health.diagnosticMessages.length,1);assert.equal(health.dataAvailability,'partial');
  assert.equal(health.reportedDroppedSamples,null);assert.equal(health.lossFreeCaptureProven,false);
  assert.equal(health.fullUnwindCoverageProven,false);
});

test('empty-stack support still rejects malformed maps, zero weights and oversized frames',()=>{
  for(const broken of [raw.replace('@samples[767, 5708, ]: 1','@samples[767, 5708, ]: 0'),raw.replace('@samples[767, 5708, ]: 1','@samples[invalid, 5708, ]: 1'),raw.replace('5573c424789f',Array(33).fill('5573c424789f').join('\n'))])assert.throws(()=>parseProfileOutput(broken,owner));
});
