import test from "node:test";
import assert from "node:assert/strict";
import { jsonValuesEqual } from "../src/domain/stateIdentity.mjs";
import { mergeAccountEventPins } from "../src/domain/personalEventPinMerge.mjs";
import * as identityAdapter from "../src/data/localIdentity.mjs";
import * as pinAdapter from "../src/data/personalEventPins.mjs";

test("legacy data APIs expose the same pure functions rather than divergent copies", () => {
  assert.equal(identityAdapter.jsonValuesEqual, jsonValuesEqual);
  assert.equal(pinAdapter.mergeAccountEventPins, mergeAccountEventPins);
});

test("pure reconciliation retains unpin intent, account isolation and input records without storage", () => {
  const old = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("Domain must not access storage"); } });
  try {
    const remote=Object.freeze({currentParticipantId:"account-a",personalEventPinPreferences:{ownerParticipantId:"account-a",updates:{event1:{pinned:true,updatedAt:"2026-10-01T00:00:00Z",mutationId:"first"}}}});
    const local=Object.freeze({currentParticipantId:"account-a",personalEventPinPreferences:{ownerParticipantId:"account-a",updates:{event1:{pinned:false,updatedAt:"2026-09-01T00:00:00Z",mutationId:"second",ancestors:["first"]}}}});
    const before=JSON.stringify([remote,local]);
    assert.equal(mergeAccountEventPins(remote,local).updates.event1.pinned,false);
    assert.equal(mergeAccountEventPins(remote,{...local,currentParticipantId:"account-b"}),null);
    assert.equal(JSON.stringify([remote,local]),before);
    assert.equal(jsonValuesEqual({value:[1,2]},{value:[1,2]}),true);
    assert.equal(jsonValuesEqual({value:[1,2]},{value:[2,1]}),false);
  } finally { if(old)Object.defineProperty(globalThis,"localStorage",old);else delete globalThis.localStorage; }
});
