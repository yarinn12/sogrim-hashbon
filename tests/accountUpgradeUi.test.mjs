import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAdminAnalyticsViewModel } from "../src/domain/adminAnalytics.mjs";

const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/publicLedgerWorkspaceLayer.mjs", import.meta.url), "utf8");

function section(start, end, source = app) {
  const normalized = source.replaceAll("\r\n", "\n");
  const startIndex = normalized.indexOf(start);
  assert.notEqual(startIndex, -1, `Source section start is missing: ${start}`);
  const endIndex = normalized.indexOf(end, startIndex);
  assert.ok(endIndex > startIndex, `Source section end is missing: ${end}`);
  return normalized.slice(startIndex, endIndex);
}

test("the creator stays in the selected roster without an inert check mark", () => {
  const creator = section("function renderNewEventSelectedParticipant(participant)", "  return `\n    <label");
  assert.match(creator, /is-current-participant/);
  assert.doesNotMatch(creator, /new-event-selected-participant-check/);
  assert.doesNotMatch(creator, /data-action="toggle-new-event-participant"/);
});

test("creator UI assertions isolate the same branch in LF and CRLF checkouts", () => {
  const start = "function renderNewEventSelectedParticipant(participant)";
  const end = "  return `\n    <label";
  const lf = app.replaceAll("\r\n", "\n");
  const expected = section(start, end, lf);
  for (const source of [lf, lf.replaceAll("\n", "\r\n")]) {
    const creator = section(start, end, source);
    assert.equal(creator, expected);
    assert.match(creator, /is-current-participant/);
    assert.doesNotMatch(creator, /new-event-selected-participant-check/);
    assert.doesNotMatch(creator, /data-action="toggle-new-event-participant"/);
    // The ordinary participant still has a real, removable selection control.
    const friendStart = source.replaceAll("\r\n", "\n").indexOf(end);
    const friend = section(end, "function renderNewEventSelectedParticipants", source);
    assert.ok(friendStart > 0);
    assert.match(friend, /new-event-selected-participant-check/);
    assert.match(friend, /data-action="toggle-new-event-participant"/);
    assert.match(friend, /type="checkbox"/);
  }
});

test("source UI checks fail closed when either section boundary is missing", () => {
  assert.throws(() => section("missing", "end", "start end"), /start is missing/);
  assert.throws(() => section("start", "missing", "start end"), /end is missing/);
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

test("selected friend stays visible and focused after moving to the top without an animated scroll", () => {
  const handler = section('if (["toggle-new-event-participant", "new-event-participant"].includes(action))', 'if (action === "focus-event-offline-name")');
  const focus = section("function focusNewEventParticipantAfterSelection", "function renderEventCreationProgress");
  assert.match(handler, /focusNewEventParticipantAfterSelection\(participantId, searchQuery\)/);
  assert.match(focus, /input\.focus\(\{ preventScroll: true \}\)/);
  assert.match(focus, /document\.activeElement !== input/);
  assert.match(focus, /scrollIntoView\(\{ block: "center", behavior: "instant" \}\)/);
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

test("the home creation control centers a compact icon-label group without an oversized decorative icon", () => {
  assert.match(styles, /\.home-create-event-action\.is-primary[^\{]*\{[^}]*gap: 8px !important;[^}]*padding-inline: 20px !important/);
  assert.match(styles, /\.home-create-event-action\.is-primary \.home-quick-action-icon[^\{]*\{[^}]*width: 22px !important;[^}]*min-width: 22px !important;[^}]*height: 22px !important;[^}]*min-height: 22px !important;[^}]*flex: 0 0 22px !important/);
  assert.match(styles, /\.event-participant-primary-actions \{[^}]*grid-template-columns: minmax\(0, 1fr\) !important/);
  assert.match(app, /event-participant-add-launch[\s\S]*?iconSvg\("user-plus"\)/);
});
