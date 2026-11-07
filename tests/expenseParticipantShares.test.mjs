import test from "node:test";
import assert from "node:assert/strict";
import {buildExpenseParticipantShares, buildParticipantSettlementBreakdown, calculateSettlement} from "../src/domain/settlement.mjs";

const people = [{id:"one"}, {id:"two"}, {id:"three"}];
const expense = (total, sharedByParticipantIds = people.map(p => p.id)) => ({id:"dinner",total,payers:[{participantId:"one",amount:total}],sharedByParticipantIds});

for (const [total, expected] of [[24000,[8000,8000,8000]], [10000,[3334,3333,3333]], [1,[1,0,0]]]) {
 test(`saved-expense shares use exact accepted ledger allocation for ${total} minor units`, () => {
  const item=expense(total), {shares,issues}=buildExpenseParticipantShares(people,item);
  assert.deepEqual(issues,[]);
  assert.deepEqual(people.map(p=>shares[p.id]),expected);
  assert.equal(Object.values(shares).reduce((sum,n)=>sum+n,0),total);
  for (const person of people) assert.equal(shares[person.id],buildParticipantSettlementBreakdown(people,[item],person.id).shareTotal);
 });
}

test("saved-expense shares preserve participant order/subsets and do not confuse payment with share", () => {
 const item=expense(10001,["three","two","three"]);
 item.payers=[{participantId:"one",amount:6000},{participantId:"two",amount:4001}];
 const {shares,issues}=buildExpenseParticipantShares(people,item);
 assert.deepEqual(issues,[]);
 assert.deepEqual(shares,{three:5001,two:5000});
 assert.equal(shares.one,undefined);
});

test("invalid expenses expose no misleading zero shares and retain the existing ledger issue", () => {
 for (const item of [expense(0),expense(20,["missing"]),{...expense(20),payers:[{participantId:"one",amount:19}]}]) {
  const result=buildExpenseParticipantShares(people,item);
  assert.deepEqual(result.shares,{});
  assert.deepEqual(result.issues,calculateSettlement(people,[item]).issues);
  assert.equal(result.issues.length,1);
 }
});

test("reading saved-expense shares does not mutate expense, participants or settlement", () => {
 const item=expense(10001), before=structuredClone({item,people}), settlement=calculateSettlement(people,[item]);
 Object.freeze(item.payers[0]);Object.freeze(item.payers);Object.freeze(item.sharedByParticipantIds);Object.freeze(item);
 const result=buildExpenseParticipantShares(people,item);
 result.shares.one=999;
 assert.deepEqual({item,people},before);
 assert.deepEqual(calculateSettlement(people,[item]),settlement);
 assert.equal(buildExpenseParticipantShares(people,item).shares.one,3334);
});
