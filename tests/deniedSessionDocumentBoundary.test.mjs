import test from "node:test";
import assert from "node:assert/strict";
import { createDeniedSessionDocumentBoundary } from "../e2e/helpers/denied-session-document.mjs";

test("an interrupted signed-in load still permits a distinct post-denial document", () => {
  const boundary = createDeniedSessionDocumentBoundary();
  boundary.response(); boundary.commit(); // Signed-in document, no load event.
  boundary.deny("signed-in-document");
  boundary.response(); boundary.commit(); boundary.load();
  boundary.observe("signed-out-document");
  assert.equal(boundary.receipt().loads, 1);
  assert.equal(boundary.hasPostDenialDocument(), true);
});

test("a gate in the denied document cannot stand in for a reload", () => {
  const boundary = createDeniedSessionDocumentBoundary();
  boundary.deny("signed-in-document");
  boundary.observe("signed-in-document");
  assert.equal(boundary.hasPostDenialDocument(), false);
});

test("a same-document History API navigation cannot stand in for a reload", () => {
  const boundary = createDeniedSessionDocumentBoundary();
  boundary.deny("signed-in-document");
  boundary.response(); boundary.commit();
  boundary.observe("signed-in-document");
  assert.equal(boundary.hasPostDenialDocument(), false);
});

test("a response without a newly initialized document cannot stand in for a reload", () => {
  const boundary = createDeniedSessionDocumentBoundary();
  boundary.deny("signed-in-document");
  boundary.response();
  assert.equal(boundary.hasPostDenialDocument(), false);
});

test("the denied document identity is required", () => {
  const boundary = createDeniedSessionDocumentBoundary();
  assert.throws(() => boundary.deny(""), /no identity/);
  boundary.observe("signed-out-document");
  assert.equal(boundary.hasPostDenialDocument(), false);
});
