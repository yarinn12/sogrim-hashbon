import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(process.env.TWO_CLIENT_CLEANUP_SOURCE || new URL('../e2e-sync/two-client.spec.mjs',import.meta.url),'utf8');
const start=source.indexOf('  const close = async () => {');
const end=source.indexOf('\n  try {',start);
assert.ok(start>=0&&end>start,'the real two-client fixture cleanup must be exercised');

function harness({contextFailure,browserFailure}={}){
 const events=[],closed=[false,false];
 const contexts=closed.map((_,i)=>({async close(){events.push('context-'+i);closed[i]=true;if(i===0&&contextFailure)throw contextFailure;}}));
 const browsers=closed.map((_,i)=>({async close(){events.push('browser-'+i);assert.ok(closed.every(Boolean),'owned contexts must close before terminating their browsers');if(i===0&&browserFailure)throw browserFailure;}}));
 const hold={release(){events.push('release');}};
 const scope={contexts,browsers,barrier:hold,membershipReadHolds:new Map([['held',hold]]),accountLinkWriteHolds:new Map(),noteReceiptHolds:new Map(),expenseReceiptHolds:new Map(),transferReceiptHolds:new Map(),inviteHolds:new Map(),networkDiagnostics:[],console};
 const close=vm.runInNewContext(source.slice(start,end)+'\nclose;',scope);
 return{close,events};
}

test('two-client cleanup releases fixture holds and closes contexts before browsers',async()=>{
 const h=harness();await h.close();
 assert.deepEqual(h.events,['release','release','context-0','context-1','browser-0','browser-1']);
});

test('a context close failure still cleans every owned browser and remains a failure',async()=>{
 const failure=new Error('context close failed'),h=harness({contextFailure:failure});
 await assert.rejects(h.close(),error=>error.errors?.includes(failure)===true);
 assert.deepEqual(h.events.slice(-2),['browser-0','browser-1']);
});

test('a browser close failure is retained rather than swallowed',async()=>{
 const failure=new Error('browser close failed'),h=harness({browserFailure:failure});
 await assert.rejects(h.close(),error=>error.errors?.includes(failure)===true);
 assert.deepEqual(h.events.slice(-2),['browser-0','browser-1']);
});
