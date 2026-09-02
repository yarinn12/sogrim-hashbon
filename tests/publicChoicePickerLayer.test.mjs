import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [index, layer, nativeBridge, profileOverlay, serviceWorker] = await Promise.all([
  readFile("index.html", "utf8"),
  readFile("src/publicChoicePickerLayer.mjs", "utf8"),
  readFile("src/publicNativeBridgeLayer.mjs", "utf8"),
  readFile("src/publicProfileOverlay.mjs", "utf8"),
  readFile("sw.js", "utf8")
]);

test("all single-choice selects use the in-app picker instead of the native popup", () => {
  assert.match(layer, /querySelectorAll\("#app select:not\(\[multiple\]\)"\)/);
  assert.match(layer, /select\.classList\.add\(ENHANCED_CLASS\)/);
  assert.match(layer, /select\.hidden = true/);
  assert.match(layer, /select\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(layer, /pointer-events: none !important/);
  assert.doesNotMatch(layer, /brand-mark|logo|<img/i);
});

test("the in-app picker preserves the existing select change contracts", () => {
  assert.match(layer, /const currentSelect = findChoiceSelect\(focusDescriptor\)/);
  assert.match(layer, /originalSelect\.isConnected \? originalSelect : null/);
  assert.doesNotMatch(layer, /if \(!select\?\.isConnected\)/);
  assert.match(layer, /currentSelect\.value = nextValue/);
  assert.match(
    layer,
    /currentSelect\.dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\)/
  );
  assert.ok(
    layer.indexOf("await closeChoicePicker({ restoreFocus: false })") <
      layer.indexOf("currentSelect.value = nextValue"),
    "the picker should close its history entry before applying the selected value"
  );
  assert.match(layer, /expense-payer-id/);
  assert.match(layer, /quick-expense-payer/);
  assert.match(layer, /quick-item-shared-by/);
  assert.match(layer, /merge-source/);
  assert.match(layer, /merge-target/);
});

test("the picker is accessible and closes with mobile app back", () => {
  assert.match(layer, /setAttribute\("role", "dialog"\)/);
  assert.match(layer, /setAttribute\("aria-modal", "true"\)/);
  assert.match(layer, /appRoot\.inert = true/);
  assert.match(layer, /appRoot\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(layer, /restoreChoicePickerBackground\(\)/);
  assert.match(profileOverlay, /\.app-choice-picker-backdrop/);
  assert.match(layer, /setAttribute\("role", "listbox"\)/);
  assert.match(layer, /setAttribute\("role", "option"\)/);
  assert.match(layer, /event\.key === "Escape"/);
  assert.match(layer, /addEventListener\("keydown", handleChoiceKeydown, true\)/);
  assert.match(layer, /addEventListener\("popstate", handleChoiceHistoryBack, true\)/);
  assert.match(layer, /event\.stopImmediatePropagation\(\)/);
  assert.match(layer, /window\.history\.pushState/);
  assert.match(layer, /window\.history\.back\(\)/);
  assert.match(layer, /let pickerClosing = false/);
  assert.match(layer, /if \(pickerClosing\)/);
  assert.match(layer, /pendingHistoryClose\?\.promise/);
  assert.match(layer, /event\.key === "Tab"/);
  assert.match(layer, /\.app-choice-option:focus-visible \{[\s\S]*?outline: 3px solid/);
  assert.match(layer, /align-content: start/);
  assert.match(layer, /modal-back-button app-choice-picker-close/);
  assert.match(
    nativeBridge,
    /\.app-choice-picker \.app-choice-picker-close/
  );
  assert.match(nativeBridge, /new CustomEvent\(NATIVE_BACK_EVENT/);
});

test("currency pickers can be searched by currency, country, or code", () => {
  assert.match(layer, /SEARCHABLE_CHOICE_ACTIONS/);
  assert.match(layer, /new-event-currency/);
  assert.match(layer, /event-currency/);
  assert.match(layer, /חיפוש לפי מטבע, מדינה או קוד/);
  assert.match(layer, /option\.dataset\.choiceSearch/);
  assert.match(layer, /normalizedText} \$\{option\.value/);
  assert.match(layer, /filterChoiceOptions\(list, emptyState, input\.value\)/);
  assert.match(layer, /לא נמצא מטבע מתאים/);
  assert.match(layer, /app-choice-option:not\(:disabled\):not\(\[hidden\]\)/);
});

test("a stale close cannot steal focus from a newly opened picker", () => {
  assert.match(layer, /const closingPickerSequence = pickerSequence/);
  assert.match(
    layer,
    /if \(activePicker \|\| pickerSequence !== closingPickerSequence\) return;/
  );
});

test("rapid option taps cannot dispatch the same choice more than once", () => {
  const chooseOption = layer.slice(
    layer.indexOf("async function chooseOption"),
    layer.indexOf("function choiceSelectDescriptor")
  );
  assert.match(layer, /let choiceSelectionPending = false/);
  assert.match(chooseOption, /if \(choiceSelectionPending\) return/);
  assert.match(chooseOption, /choiceSelectionPending = true/);
  assert.match(chooseOption, /finally \{\s*choiceSelectionPending = false/);
  assert.ok(
    chooseOption.indexOf("if (choiceSelectionPending) return") <
      chooseOption.indexOf('dispatchEvent(new Event("change"'),
    "the single-flight guard must run before the change event is dispatched"
  );
});

test("opening a searchable picker leaves no delayed focus task behind", () => {
  const openPicker = layer.slice(
    layer.indexOf("function openChoicePicker"),
    layer.indexOf("function renderChoiceOption")
  );
  assert.match(openPicker, /\(selectedOption \?\? firstOption \?\? closeButton\)\.focus/);
  assert.doesNotMatch(openPicker, /requestAnimationFrame/);
});

test("the choice picker ships in the public and offline app shells", () => {
  assert.match(index, /publicChoicePickerLayer\.mjs/);
  assert.match(serviceWorker, /"\/src\/publicChoicePickerLayer\.mjs"/);
  assert.match(serviceWorker, /settle-friends-live-v\d+/);
});
