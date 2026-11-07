import test from "node:test";
import assert from "node:assert/strict";
import { createAccountPinMigrationQueue } from "../src/data/accountPinMigrationQueue.mjs";

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test("a delayed account A migration does not block B or apply A's late receipt", async () => {
  let activeOwner = "account-a";
  const waitingA = deferred();
  const applied = [];
  const queue = createAccountPinMigrationQueue(() => activeOwner);
  let aSaves = 0;
  const a = queue("account-a", () => { aSaves++; return waitingA.promise; }, result => applied.push(result));
  const duplicateA = queue("account-a", () => { aSaves++; }, () => {});
  assert.equal(duplicateA, a);
  activeOwner = "account-b";
  const b = queue("account-b", async () => "B confirmed", result => applied.push(result));
  await b;
  assert.deepEqual(applied, ["B confirmed"]);
  waitingA.resolve("A confirmed");
  await a;
  assert.deepEqual(applied, ["B confirmed"]);
  assert.equal(aSaves, 1);
  activeOwner = "account-a";
  await queue("account-a", async () => "A retried", result => applied.push(result));
  assert.deepEqual(applied, ["B confirmed", "A retried"]);
});
