import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cli=process.env.ANDROID_QA_VERDICT_TEST_CLI||fileURLToPath(new URL('../scripts/qa/android-native-isolated/matrix-verdict.mjs',import.meta.url));
const rows=()=>Array.from({length:6},(_,index)=>({index,checks:[{name:'Visible essential text exists and scales',ok:true}]}));
function run(results){return spawnSync(process.execPath,[cli],{input:JSON.stringify({results}),encoding:'utf8',windowsHide:true}).status;}
test('native matrix CLI exits nonzero when any recorded geometry check fails',()=>{const results=rows();results[3].checks[0].ok=false;assert.equal(run(results),1);});
test('native matrix CLI exits nonzero for missing cases, missing checks and runtime errors',()=>{assert.equal(run(rows().slice(0,5)),1);const noChecks=rows();delete noChecks[1].checks;assert.equal(run(noChecks),1);const errored=rows();errored[0].error='WebView unavailable';assert.equal(run(errored),1);});
test('native matrix CLI exits zero only after all six cases and their checks pass',()=>{assert.equal(run(rows()),0);});
