import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(process.env.EVENT_NOTE_DELETE_TEST_APP || new URL("../src/app.mjs", import.meta.url), "utf8");
const start = source.indexOf("function handleDialogKeydown(event) {");
const end = source.indexOf("\nfunction handleFriendsHubTabKeyboardNavigation", start);
assert(start >= 0 && end > start, "read the actual application keyboard handler");

// The note editor precedes its confirmation in DOM order. Falling back to the
// first modal therefore selects the editor, even though the user is in the alert.
function navigate(active, shiftKey = false) {
  const moves = [];
  const make = name => ({
    offsetParent: {},
    inert: false,
    focus() { document.activeElement = this; moves.push(name); }
  });
  const cancel = make("cancel"), confirm = make("confirm");
  const backgroundFirst = make("background-first"), backgroundLast = make("background-last");
  const outside = make("outside");
  const document = { activeElement: active === "cancel" ? cancel : confirm };
  const foreground = { closest: () => null, querySelectorAll: () => [cancel, confirm] };
  const background = { closest: () => null, querySelectorAll: () => [backgroundFirst, backgroundLast] };
  let prevented = false;
  const event = {
    key: "Tab", shiftKey,
    target: {
      closest: selector => selector.split(/\s*,\s*/).includes('.event-note-delete-confirmation[role="alertdialog"]') ? foreground : null
    },
    preventDefault() { prevented = true; }
  };
  runInNewContext(source.slice(start, end) + "\nhandleDialogKeydown(event)", {
    event, document,
    app: { querySelector: () => background },
    expenseDatePickerOwnsEscape: () => false,
    handleRadioGroupKeyboardNavigation: () => false,
    handleFriendsHubTabKeyboardNavigation: () => false,
    handleInputKeyboardShortcut: () => false,
    handleEventSettingsPhotoKeydown: () => false,
    closeOpenTransientMenus: () => false,
    settlementCloseConfirmation: null
  });
  if (!prevented) (active === "cancel" && !shiftKey ? confirm : outside).focus();
  return {
    active: document.activeElement === cancel ? "cancel" : document.activeElement === confirm ? "confirm" : "outside",
    moves, prevented
  };
}

test("note deletion foreground preserves normal Cancel to Confirm Tab", () => {
  assert.deepEqual(navigate("cancel"), { active: "confirm", moves: ["confirm"], prevented: false });
});

test("note deletion foreground wraps Confirm Tab to Cancel rather than the background note editor", () => {
  assert.deepEqual(navigate("confirm"), { active: "cancel", moves: ["cancel"], prevented: true });
});

test("note deletion foreground wraps Cancel ShiftTab to Confirm rather than escaping the alert", () => {
  assert.deepEqual(navigate("cancel", true), { active: "confirm", moves: ["confirm"], prevented: true });
});
