import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [homeLayer, coherenceLayer, dynamicTypeLayer] = await Promise.all([
  readFile("src/publicHomeButtonLayer.mjs", "utf8"),
  readFile("src/publicDesignCoherenceLayer.mjs", "utf8"),
  readFile("src/publicDynamicTypeLayer.mjs", "utf8")
]);

test("mobile participant management hides and inerts global route chrome", () => {
  assert.match(homeLayer, /\[data-event-route-dialog="true"\]/);
  assert.match(homeLayer, /publicParticipantTaskInert/);
  assert.match(homeLayer, /chrome\.inert = true/);
  assert.match(homeLayer, /chrome\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(
    coherenceLayer,
    /\.screen:has\(\.event-participant-route-backdrop\)[\s\S]*?> \.product-app-identity \{[\s\S]*?display: none !important;/
  );
  assert.match(
    coherenceLayer,
    /\.event-participant-route-backdrop \{[\s\S]*?inset: 0 !important;[\s\S]*?height: 100dvh !important;/
  );
});

test("large-text home keeps dedicated clearance above fixed navigation", () => {
  assert.match(
    dynamicTypeLayer,
    /#app[\s\S]*?\.screen\[data-screen-kind="home"\] \{[\s\S]*?padding-bottom: calc\(176px \+ env\(safe-area-inset-bottom\)\) !important;/
  );
});

test("mobile share choices remain separate when text grows", () => {
  assert.match(
    coherenceLayer,
    /\.event-share-modal[\s\S]*?> \.event-modal-body \{[\s\S]*?display: grid !important;[\s\S]*?grid-auto-rows: max-content !important;[\s\S]*?gap: 16px !important;/
  );
  assert.match(
    coherenceLayer,
    /\.event-share-modal[\s\S]*?\.event-share-choice \{[\s\S]*?grid-template-rows: repeat\(2, max-content\) !important;[\s\S]*?align-content: start !important;/
  );
  assert.match(
    coherenceLayer,
    /\.event-share-choice[\s\S]*?> button \{[\s\S]*?position: relative !important;[\s\S]*?grid-row: 2 !important;/
  );
});
