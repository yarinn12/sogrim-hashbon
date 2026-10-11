import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAdminAnalyticsViewModel } from "../src/domain/adminAnalytics.mjs";

const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/publicLedgerWorkspaceLayer.mjs", import.meta.url), "utf8");

function section(start, end) {
  return app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start)));
}

test("the creator stays in the selected roster without an inert check mark", () => {
  const creator = section("function renderNewEventSelectedParticipant(participant)", "  return `\r\n    <label");
  assert.match(creator, /is-current-participant/);
  assert.doesNotMatch(creator, /new-event-selected-participant-check/);
  assert.doesNotMatch(creator, /data-action="toggle-new-event-participant"/);
});

test("shared notes have one create action and no empty-state announcement", () => {
  const notes = section("function renderEventNotes(event)", "function renderEventNotesSection");
  assert.match(notes, /פתקים משותפים/);
  assert.match(notes, /data-action="new-event-note"/);
  assert.doesNotMatch(notes, /renderEventNotesEmptyState\(\)/);
  assert.doesNotMatch(app, /עוד אין פתקים משותפים/);
});

test("participant onboarding explains manual names and account invites", () => {
  const participants = section("function renderNewEventParticipants()", "function renderEventShareFriends");
  assert.match(participants, /שם ידני/);
  assert.match(participants, /קישור/);
  assert.match(participants, /חשבון/);
});

test("selected friend stays visible and focused after moving to the top", () => {
  const handler = section('if (["toggle-new-event-participant", "new-event-participant"].includes(action))', 'if (action === "focus-event-offline-name")');
  assert.match(handler, /focusNewEventParticipantAfterSelection\(participantId, searchQuery\)/);
  assert.match(app, /scrollIntoView\(\{ block: "center", behavior:/);
  assert.match(app, /prefers-reduced-motion: reduce/);
});

test("new event currency picker keeps its existing choice route and offers name and code search", () => {
  const details = section("function renderNewEvent()", "function syncNewEventParticipantControls()");
  assert.match(details, /action: "new-event-currency-choice"/);
  assert.match(details, /searchable: true/);
  assert.match(app, /data-action="new-event-currency-search"/);
  assert.match(app, /option\.hidden = !String\(option\.dataset\.searchText/);
});

test("admin additions expose only aggregates already returned by the overview API", () => {
  const model = buildAdminAnalyticsViewModel({
    push: { disabledDevices: 4 },
    feedback: { resolved: 7 },
    telemetry: { clientErrorsDuringWindow: 3 }
  }, "en-US");
  const items = model.detailGroups.flatMap((group) => group.items);
  assert.ok(items.some((item) => item.label === "מכשירי Push כבויים" && item.value === "4"));
  assert.ok(items.some((item) => item.label === "פניות שנפתרו" && item.value === "7"));
  assert.ok(items.some((item) => item.label === "דיווחי שגיאת לקוח בתקופה" && item.value === "3"));
});

test("missing admin aggregates remain unavailable while actual zero is shown as zero", () => {
  const missing = buildAdminAnalyticsViewModel({ push: {}, feedback: {}, telemetry: {} }, "en-US");
  const absent = missing.detailGroups.flatMap((group) => group.items);
  for (const label of ["מכשירי Push כבויים", "פניות שנפתרו", "דיווחי שגיאת לקוח בתקופה"]) {
    const item = absent.find((entry) => entry.label === label);
    assert.equal(item?.value, "—");
    assert.equal(item?.detail, "נתון לא זמין");
  }
  const zero = buildAdminAnalyticsViewModel({
    push: { disabledDevices: 0 }, feedback: { resolved: 0 },
    telemetry: { clientErrorsDuringWindow: 0 }
  }, "en-US");
  for (const label of ["מכשירי Push כבויים", "פניות שנפתרו", "דיווחי שגיאת לקוח בתקופה"]) {
    assert.equal(zero.detailGroups.flatMap((group) => group.items).find((item) => item.label === label)?.value, "0");
  }
});

test("the home creation control and roster action center their icon and label", () => {
  assert.match(styles, /\.home-create-event-action[^\{]*\{[^}]*gap: 2px !important/);
  assert.match(styles, /\.event-participant-primary-actions \{[^}]*grid-template-columns: minmax\(0, 1fr\) !important/);
  assert.match(app, /event-participant-add-launch[\s\S]*?iconSvg\("user-plus"\)/);
});
