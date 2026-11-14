import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {CONTRACT,INTAKE_BINDINGS,requireBoundIntakePins} from '../scripts/qa/ios-signing/intake-bindings.mjs';
import {SOURCE_QA_JOBS} from '../scripts/qa/ios-signing/source-ci-required-jobs.mjs';

test('historical194 fixtures retain the complete original17871 bytes',()=>{
  const hashes={
    'ios194-2cf-intake-source-guard.mjs.txt':'b0bab132d535a412f9934d0b2491cd99dd50f64a977979184ec4cbd14ba3b2b5',
    'ios194-2cf-source-guard.mjs.txt':'c026899ea753d499fdd93c93486a750d09bbe1f3af691fadfb7014d78356dfd0',
    'ios194-2cf-disabled-signing-workflow.yml.txt':'4c70f37382ce112786344c693a5cbfe79efc9431b8e2a816bb9f1f6e7d128bf8'
  };
  for(const[name,hash]of Object.entries(hashes))assert.equal(createHash('sha256').update(readFileSync(new URL('./fixtures/'+name,import.meta.url))).digest('hex'),hash,name);
});
test('current196 keeps its68-role contract and cannot consume historical fixture acceptance',()=>{
  assert.equal(CONTRACT.build,'196');assert.equal(CONTRACT.version,'4.59');
  assert.equal(SOURCE_QA_JOBS.length,68);assert.equal(new Set(SOURCE_QA_JOBS).size,68);
  const source=readFileSync(new URL('../scripts/qa/ios-signing/intake-source-guard.mjs',import.meta.url),'utf8');
  assert.ok(source.includes("from './source-ci-required-jobs.mjs'"));
  const workflow=readFileSync(new URL('../.github/workflows/ios196-459-private-intake-only-20261111.yml',import.meta.url),'utf8');
  assert.ok(!workflow.includes('fixtures/ios194'));
  if(JSON.stringify(INTAKE_BINDINGS).includes('PENDING'))assert.throws(()=>requireBoundIntakePins(),/PENDING/);
});
