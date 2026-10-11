import test from "node:test";
import assert from "node:assert/strict";
import { hasUpdateSensitiveWork } from "../src/domain/updateSafety.mjs";

function storage(items = {}) {
  const entries = Object.entries(items);
  return { length: entries.length, key: index => entries[index]?.[0] ?? null,
    getItem: key => items[key] ?? null };
}

test("pending sync and open editors defer update handoff", () => {
  const cleanDocument = { querySelector: () => null, activeElement: null };
  assert.equal(hasUpdateSensitiveWork({ document: cleanDocument, storage: storage() }), false);
  assert.equal(hasUpdateSensitiveWork({ document: cleanDocument, storage: storage(), pending: true }), true);
  assert.equal(hasUpdateSensitiveWork({ document: cleanDocument,
    storage: storage({ "settle-friends-pending-sync:account-a": "queued" }), checkOutbox: true }), true);
  assert.equal(hasUpdateSensitiveWork({ document: { querySelector: () => ({}) }, storage: storage() }), true);
});

test("an unreadable outbox conservatively postpones a PWA reload", () => {
  const unreadable = { get length() { throw new Error("SecurityError"); } };
  assert.equal(hasUpdateSensitiveWork({ document: null, storage: unreadable, checkOutbox: true }), true);
});

test("group creation and editing remain update-sensitive after focus moves to a button", () => {
  for (const kind of ["group-create", "group-edit"]) {
    const document = {
      activeElement: { matches: () => false, closest: () => ({}) },
      querySelector: selector => selector.includes(`[data-screen-kind='${kind}']`) ? {} : null
    };
    assert.equal(hasUpdateSensitiveWork({ document, storage: storage() }), true, kind);
  }
});
