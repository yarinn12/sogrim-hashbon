import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layer = readFileSync("src/publicLedgerWorkspaceLayer.mjs", "utf8");

test("template chips keep the horizontal scroll contract", () => {
  const rule = layer.slice(
    layer.indexOf("html.ledger-workspace-v1 .expense-template-grid {")
  );
  const block = rule.slice(0, rule.indexOf("}"));
  assert.match(block, /flex-wrap: nowrap !important/);
  assert.match(block, /overflow-x: auto !important/);
  assert.match(block, /scroll-snap-type: inline proximity !important/);
});

test("template chips expose a scroll affordance without changing layout", () => {
  const rule = layer.slice(
    layer.indexOf("html.ledger-workspace-v1 .expense-template-grid {")
  );
  const block = rule.slice(0, rule.indexOf("}"));
  assert.match(block, /mask-image: linear-gradient\(/);
  assert.match(block, /-webkit-mask-image: linear-gradient\(/);
  assert.match(block, /to left/, "fade sits on the RTL overflow edge");
  assert.doesNotMatch(block, /position: relative/, "no new positioning context");
  assert.doesNotMatch(block, /margin/, "layout box is untouched");
});

test("chips stay compact while meeting the 44px touch floor", () => {
  const rule = layer.slice(
    layer.indexOf("html.ledger-workspace-v1 .expense-template-grid .secondary-button {")
  );
  const block = rule.slice(0, rule.indexOf("}"));
  assert.match(block, /min-height: 44px !important/);
});

test("destructive and confirm actions meet the 48dp Android floor", () => {
  const start = layer.indexOf('[data-action="delete-expense"]');
  assert.ok(start > -1, "destructive touch-target rule exists");
  const block = layer.slice(start, layer.indexOf("}", start));
  for (const action of [
    "delete-expense",
    "delete-event",
    "leave-event",
    "remove-participant",
    "remove-event-from-list",
    "confirm-important-action",
    "cancel-important-action"
  ]) {
    assert.match(block, new RegExp(`\\[data-action="${action}"\\]`));
  }
  assert.match(layer.slice(start, layer.indexOf("}", start) + 40), /min-height: 48px !important/);
});

test("reduced motion block still neutralises transitions", () => {
  assert.match(layer, /@media \(prefers-reduced-motion: reduce\)/);
});
