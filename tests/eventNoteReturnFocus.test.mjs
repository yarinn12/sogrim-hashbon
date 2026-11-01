import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(process.env.EVENT_NOTE_RETURN_FOCUS_TEST_APP || new URL("../src/app.mjs", import.meta.url), "utf8").replaceAll("\r\n", "\n");
function extract(name, next) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`\nfunction ${next}(`, start);
  assert(start >= 0 && end > start, `read the actual ${name} application function`);
  return source.slice(start, end);
}

function harness() {
  class HTMLElement {
    constructor(noteId, eventId = "event-notes") {
      this.dataset = { action: "open-event-note", eventId, noteId };
      this.isConnected = true;
    }
  }
  const first = new HTMLElement("first-note");
  const target = new HTMLElement("second-note");
  const otherEvent = new HTMLElement("second-note", "different-event");
  const opener = new HTMLElement("second-note");
  const context = {
    HTMLElement,
    dialogReturnContext: () => "same-account-and-notes-workspace",
    app: { querySelectorAll: () => [otherEvent, first, target] }
  };
  runInNewContext(
    extract("createActionFocusDescriptor", "restoreActionFocus") + "\n" +
    extract("findActionReturnTarget", "dialogReturnContext") +
    "\nthis.capture = createActionFocusDescriptor; this.find = findActionReturnTarget;",
    context
  );
  return { context, first, target, opener };
}

test("note opener focus descriptor preserves the note identity across a list rerender", () => {
  const { context, opener } = harness();
  const descriptor = context.capture(opener);
  assert.equal(descriptor.noteId, "second-note");
  assert.equal(descriptor.eventId, "event-notes");
});

test("closing a rerendered second note returns to that row rather than the first note", () => {
  const { context, opener, target } = harness();
  const descriptor = context.capture(opener);
  opener.isConnected = false;
  assert.equal(context.find(descriptor), target);
});

test("an absent note opener does not redirect focus to an unrelated note", () => {
  const { context, opener, first } = harness();
  const descriptor = context.capture(opener);
  opener.isConnected = false;
  context.app.querySelectorAll = () => [first];
  assert.equal(context.find(descriptor), undefined);
});

test("a still-connected note opener remains the preferred return target", () => {
  const { context, opener } = harness();
  assert.equal(context.find(context.capture(opener)), opener);
});

test("legacy return descriptors without note identity preserve their existing fallback", () => {
  const { context, first } = harness();
  assert.equal(context.find({ action: "open-event-note", eventId: "event-notes" }), first);
});
