import test from "node:test";
import assert from "node:assert/strict";
import { hasUpdateSensitiveWork } from "../src/domain/updateSafety.mjs";

function storage(items = {}) {
  const entries = Object.entries(items);
  return { length: entries.length, key: index => entries[index]?.[0] ?? null,
    getItem: key => items[key] ?? null };
}

function searchField(action) {
  return {
    value: "Dana", defaultValue: "", disabled: false, readOnly: false,
    closest: () => null,
    matches: selector => selector.split(",").some(part =>
      ["input", `input[type='search'][data-action='${action}']`].includes(part.trim()))
  };
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

test("a filled search filter does not become a draft when focus moves", () => {
  for (const action of ["friends-search", "participant-search", "new-event-currency-search"]) {
    const search = searchField(action);
    const document = {
      querySelector: () => null,
      querySelectorAll: () => [search],
      activeElement: { matches: () => false, closest: () => ({}) }
    };
    assert.equal(hasUpdateSensitiveWork({ document, storage: storage() }), false, action);
    document.activeElement = { ...search, closest: () => ({}) };
    assert.equal(hasUpdateSensitiveWork({ document, storage: storage() }), false, `${action} focused`);
    assert.equal(hasUpdateSensitiveWork({ document, storage: storage(), pending: true }), true);
  }
  const unknownSearch = searchField("expense-merchant-search");
  assert.equal(hasUpdateSensitiveWork({ document: {
    querySelector: () => null, querySelectorAll: () => [unknownSearch], activeElement: null
  }, storage: storage() }), true);
});

test("a changed profile field and an expense editor remain protected with a search filter present", () => {
  const search = searchField("friends-search");
  const profileName = {
    value: "Alex Smith", defaultValue: "", disabled: false, readOnly: false,
    closest: () => null, matches: () => false
  };
  const document = {
    activeElement: { matches: () => false, closest: () => ({}) },
    querySelector: () => null,
    querySelectorAll: () => [search, profileName]
  };
  assert.equal(hasUpdateSensitiveWork({ document, storage: storage() }), true);
  document.querySelectorAll = () => [search];
  document.querySelector = selector => selector.includes(".event-note-editor") ? {} : null;
  assert.equal(hasUpdateSensitiveWork({ document, storage: storage() }), true);
  document.querySelector = () => null;
  assert.equal(hasUpdateSensitiveWork({ document,
    storage: storage({ "settle-friends-pending-sync:account-a": "queued" }), checkOutbox: true }), true);
});
