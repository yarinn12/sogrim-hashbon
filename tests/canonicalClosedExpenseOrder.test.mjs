import assert from 'node:assert/strict';
import test from 'node:test';
import { preserveCanonicalClosedExpenseOrder as preserve } from '../src/domain/canonicalClosedExpenseOrder.mjs';

function fixture() {
 const canonical={id:'closed',locked:true,expenses:['a','b'].map(id=>({id,name:id,total:100,
  payers:[{participantId:'p1',amount:40},{participantId:'p2',amount:60}],sharedByParticipantIds:['p1','p2'],
  updatedAt:'2026-08-20T10:00:00Z',receiptImage:'data:image/png;base64,synthetic'})),
  deletedExpenses:['c','d'].map(id=>({id,deletedAt:'2026-08-19T10:00:00Z'}))};
 const candidate=structuredClone(canonical);candidate.expenses.reverse();candidate.deletedExpenses.reverse();
 return {canonical,candidate};
}

test('closed unchanged expense and tombstone ordering retains canonical bytes without mutating queued intent',()=>{
 const {canonical,candidate}=fixture(),before=structuredClone(candidate),old=structuredClone(canonical);
 const result=preserve(candidate,canonical);assert.deepEqual(result,canonical);
 result.expenses[0].name='independent';assert.deepEqual(canonical,old);assert.deepEqual(candidate,before);
});
test('payer and participant ordering retains every field and the canonical representation',()=>{
 const {canonical,candidate}=fixture();for(const e of candidate.expenses){e.payers.reverse();e.sharedByParticipantIds.reverse()}
 assert.deepEqual(preserve(candidate,canonical),canonical);
});
test('an absent legacy creator introduced as undefined is only a wire-format difference',()=>{
 const {canonical,candidate}=fixture();for(const e of candidate.expenses)e.createdByParticipantId=undefined;
 assert.deepEqual(preserve(candidate,canonical),canonical);
 canonical.expenses[0].createdByParticipantId='p1';
 assert.deepEqual(preserve(candidate,canonical).expenses,candidate.expenses,'an actual canonical creator must not be silently restored over a pending removal');
});
for(const [label,edit] of [
 ['amount',e=>{e.total++;e.payers[0].amount++}],
 ['name',e=>{e.name='real pending name'}],
 ['receipt',e=>{e.receiptImage='data:image/png;base64,pending'}],
 ['timestamp',e=>{e.updatedAt='2026-08-21T10:00:00Z'}],
 ['unknown metadata',e=>{e.userMemo='keep this edit'}]
])test(`a genuine pending ${label} change is never replaced by the canonical record`,()=>{
 const {canonical,candidate}=fixture();edit(candidate.expenses[0]);const before=structuredClone(candidate);
 assert.deepEqual(preserve(candidate,canonical).expenses,before.expenses);assert.deepEqual(candidate,before);
});
test('a pending addition or deletion is retained for normal server authorization',()=>{
 for(const edit of [e=>e.expenses.push({...e.expenses[0],id:'new'}),e=>e.expenses.pop(),e=>e.deletedExpenses.push({id:'new',deletedAt:'2026-08-20T10:00:00Z'})]){
  const {canonical,candidate}=fixture();edit(candidate);const before=structuredClone(candidate),result=preserve(candidate,canonical);
  if(before.expenses.length!==canonical.expenses.length)assert.deepEqual(result.expenses,before.expenses);
  else assert.deepEqual(result.deletedExpenses,before.deletedExpenses);
 }
});
test('duplicate ids, duplicate payers and a changed tombstone are not treated as ordering',()=>{
 for(const edit of [e=>e.expenses[0].id=e.expenses[1].id,e=>e.expenses[0].payers[0].participantId='p2',e=>e.deletedExpenses[0].deletedAt='2026-08-22T10:00:00Z']){
  const {canonical,candidate}=fixture();edit(candidate);const before=structuredClone(candidate),result=preserve(candidate,canonical);
  if(before.deletedExpenses[0].deletedAt!==canonical.deletedExpenses[1].deletedAt)assert.deepEqual(result.deletedExpenses,before.deletedExpenses);
  else assert.deepEqual(result.expenses,before.expenses);
 }
});
test('an open or different event retains the candidate and a new pending payment',()=>{
 const {canonical,candidate}=fixture();candidate.transfers=[{id:'payment',status:'paid'}];
 assert.equal(preserve(candidate,{...canonical,locked:false}),candidate);
 assert.equal(preserve(candidate,{...canonical,id:'other'}),candidate);
 assert.deepEqual(preserve(candidate,canonical).transfers,candidate.transfers);
});
