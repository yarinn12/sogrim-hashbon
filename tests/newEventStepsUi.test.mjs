import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function sourceBetween(source, start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

test("new event creation separates type and details", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const typeStep = sourceBetween(
    app,
    "function renderNewEventType()",
    "function renderNewEventManagement()"
  );
  const detailsStep = sourceBetween(app, "function renderNewEvent()", "function renderJoinEvent()");
  const typeSelection = sourceBetween(
    app,
    'if (action === "new-event-type")',
    'if (action === "join-event-screen")'
  );

  assert.match(typeStep, /data-event-creation-step="type"/);
  assert.match(typeStep, /data-action="new-event-type"/);
  assert.match(typeStep, /eventCreationTypeOptions\(\)/);
  assert.match(typeStep, /renderForwardChevron\(\)/);
  assert.doesNotMatch(typeStep, /data-action="new-event-name"/);
  assert.doesNotMatch(typeStep, /data-action="new-event-group"/);
  assert.doesNotMatch(typeStep, /data-action="create-event"/);

  assert.match(detailsStep, /data-event-creation-step="details"/);
  assert.match(detailsStep, /data-action="new-event-name"/);
  assert.match(detailsStep, /data-action="new-event-group"/);
  assert.match(detailsStep, /availableGroups\.length/);
  assert.match(detailsStep, /data-action="create-event"/);
  assert.doesNotMatch(detailsStep, /data-action="new-event-type"/);
  assert.doesNotMatch(detailsStep, /action: "new-event-management-mode"/);
  assert.match(typeSelection, /screen = \{ name: "new-event" \}/);
  assert.doesNotMatch(typeSelection, /screen = \{ name: "new-event-management" \}/);
});

test("event creation defaults to collaborative management and settings keep the choice", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /EVENT_MANAGEMENT_CENTRALIZED = "centralized"/);
  assert.match(app, /EVENT_MANAGEMENT_COLLABORATIVE = "collaborative"/);
  assert.match(app, /אני מנהל עבור כולם/);
  assert.match(app, /כולם מעדכנים יחד/);
  assert.match(app, /adminsCanEditOnly: managementModeRequiresAdmin\(newEventDraft\.managementMode\)/);
  assert.match(app, /action: "set-event-management-mode"/);
  assert.match(app, /data-action="\$\{action\}"/);
  assert.match(app, /מי יעדכן את ההוצאות/);
});

test("new event types default to collaborative editing without another setup screen", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const typeSelection = sourceBetween(
    app,
    'if (action === "new-event-type")',
    'if (action === "join-event-screen")'
  );

  assert.match(
    typeSelection,
    /newEventDraft\.managementMode = EVENT_MANAGEMENT_COLLABORATIVE/
  );
  assert.doesNotMatch(
    typeSelection,
    /selectedEventType === EVENT_TYPE_TRIP[\s\S]*EVENT_MANAGEMENT_CENTRALIZED/
  );
  assert.match(typeSelection, /screen = \{ name: "new-event" \}/);
  assert.match(typeSelection, /querySelector\('\[data-action="new-event-name"\]'\)/);
});

test("event name is clearly optional because a default is generated", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const detailsStep = sourceBetween(app, "function renderNewEvent()", "function renderEventCreationProgress");

  assert.match(detailsStep, /שם האירוע \(לא חובה\)/);
  assert.match(detailsStep, /לקבל שם אוטומטי/);
  assert.match(app, /newEventDraft\.name\.trim\(\) \|\|\s*uniqueDefaultEventName/);
});

test("event creation shows a clear two-step progress indicator", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const typeStep = sourceBetween(
    app,
    "function renderNewEventType()",
    "function renderNewEventManagement()"
  );
  const detailsStep = sourceBetween(app, "function renderNewEvent()", "function renderEventCreationProgress");
  const progress = sourceBetween(app, "function renderEventCreationProgress", "function renderJoinEvent()");

  assert.match(typeStep, /renderEventCreationProgress\("type"\)/);
  assert.match(detailsStep, /renderEventCreationProgress\("details"\)/);
  assert.match(progress, /event-creation-progress/);
  assert.match(progress, /aria-current="step"/);
  assert.match(progress, /label: "סוג"/);
  assert.match(progress, /פרטים/);
  assert.doesNotMatch(progress, /label: "ניהול"/);
});

test("event details keep participant management optional until the user needs it", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const detailsStep = sourceBetween(app, "function renderNewEvent()", "function renderEventCreationProgress");

  assert.match(detailsStep, /<details class="new-event-participants">/);
  assert.match(detailsStep, /data-new-event-participant-count/);
  assert.match(detailsStep, /new-event-participants-body/);
  assert.match(detailsStep, /autocomplete="off"/);
  assert.ok(
    detailsStep.indexOf('data-action="new-event-name"') <
      detailsStep.indexOf('data-action="new-event-participant"')
  );
  assert.match(app, /function syncNewEventParticipantControls\(\)/);
  assert.match(app, /function newEventParticipantSelectionLabel\(participantIds\)/);
  assert.match(app, /return "רק אתה כרגע"/);
  assert.match(
    app,
    /countNode\.textContent = newEventParticipantSelectionLabel\(\s*newEventDraft\.participantIds\s*\)/
  );
  assert.match(app, /createButton\.disabled = count === 0/);
  assert.match(app, /keepParticipantsOpen/);
  assert.match(app, /participantDetails\.open = true/);
});

test("new events start without silently selecting a saved group", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const draftSetup = sourceBetween(
    app,
    "function ensureNewEventDraft()",
    "function renderNewEventType()"
  );

  assert.match(draftSetup, /groupId: ""/);
  assert.match(
    draftSetup,
    /participantIds: state\.currentParticipantId \? \[state\.currentParticipantId\] : \[\]/
  );
  assert.doesNotMatch(draftSetup, /visibleGroupsForParticipant/);
  assert.doesNotMatch(draftSetup, /defaultGroup/);
});

test("new event participant choices clearly show selected and unselected states", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const styles = await readFile("styles.css", "utf8");
  const ledgerStyles = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");
  const participantPill = sourceBetween(
    app,
    "function renderParticipantPill(",
    "function renderParticipantIdentityGroup("
  );

  assert.match(participantPill, /action === "new-event-participant"/);
  assert.match(participantPill, /renderParticipantMembershipStatus\(selected\)/);
  assert.match(app, /data-membership-state="\$\{selected \? "active" : "inactive"\}"/);
  assert.match(app, /selected \? "באירוע" : "לא באירוע"/);
  assert.match(styles, /\.participant-membership-status\[data-membership-state="active"\]/);
  assert.match(
    ledgerStyles,
    /\.new-event-participant-picker \.participant-pill:has\(input:checked\)/
  );
});

test("event creation back navigation follows type and details", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const backLayer = await readFile("src/publicBackNavigationLayer.mjs", "utf8");

  assert.match(app, /screen = \{ name: "new-event-type" \};\s+newEventDraft = null/);
  assert.match(
    app,
    /newEventDraft\.eventType = selectedEventType;[\s\S]*?newEventDraft\.managementMode =[\s\S]*?screen = \{ name: "new-event" \}/
  );
  assert.match(app, /screen\.name === "new-event" && newEventDraft/);
  assert.match(app, /screen = \{ name: "new-event-type" \};\s+renderHistoryFallback\(\)/);
  assert.match(backLayer, /button\.closest\('\[data-event-creation-step\]'\)/);
});

test("all event creation steps keep the premium new-event screen identity", async () => {
  const files = await Promise.all([
    readFile("src/publicBrandLayer.mjs", "utf8"),
    readFile("src/publicPremiumVisualLayer.mjs", "utf8"),
    readFile("src/publicProductV1Layer.mjs", "utf8")
  ]);

  for (const source of files) {
    assert.match(source, /data-screen-kind="new-event"/);
  }
});
