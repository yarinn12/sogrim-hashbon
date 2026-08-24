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
  const detailsStep = sourceBetween(app, "function renderNewEvent()", "function syncNewEventParticipantControls()");
  const participantsStep = sourceBetween(
    app,
    "function renderNewEventParticipantAction",
    "function renderEventShareFriends"
  );
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
  assert.match(detailsStep, /data-action="open-new-event-settlement"/);
  assert.doesNotMatch(detailsStep, /data-action="create-event"/);
  assert.match(participantsStep, /data-action="new-event-group"/);
  assert.match(participantsStep, /availableGroups\.length/);
  assert.match(participantsStep, /data-event-creation-step="participants"/);
  assert.match(participantsStep, /data-action="create-event"/);
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

test("event creation shows a clear four-step progress indicator", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const ledgerStyles = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");
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
  assert.match(progress, /label: "אירוע"/);
  assert.match(progress, /פרטים/);
  assert.match(progress, /label: "הגדרות חשבון"/);
  assert.match(progress, /label: "משתתפים"/);
  assert.doesNotMatch(progress, /label: "ניהול"/);
  assert.match(ledgerStyles, /\.event-creation-progress\s*\{[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\) !important;/);
});

test("event details open settlement before participant management", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const detailsStep = sourceBetween(app, "function renderNewEvent()", "function syncNewEventParticipantControls()");
  const participantsStep = sourceBetween(
    app,
    "function renderNewEventParticipantAction",
    "function renderEventShareFriends"
  );

  assert.match(detailsStep, /data-action="open-new-event-settlement"/);
  assert.match(detailsStep, />הבא</);
  assert.doesNotMatch(detailsStep, /data-new-event-participant-count/);
  assert.doesNotMatch(detailsStep, /new-event-participants-body/);
  assert.ok(
    detailsStep.indexOf('data-action="new-event-name"') <
      detailsStep.indexOf('data-action="open-new-event-settlement"')
  );
  assert.match(participantsStep, /function renderNewEventParticipants\(\)/);
  assert.match(participantsStep, /data-action="create-event"/);
  assert.match(participantsStep, /data-action="cancel-new-event-participants"/);
  assert.match(participantsStep, /autocomplete="off"/);
  assert.match(app, /function syncNewEventParticipantControls\(\)/);
  assert.match(app, /function newEventParticipantSelectionLabel\(participantIds\)/);
  assert.match(app, /return "רק אתה כרגע"/);
  assert.match(
    app,
    /countNode\.textContent = newEventParticipantSelectionLabel\(\s*newEventDraft\.participantIds\s*\)/
  );
  assert.match(app, /createButton\.disabled = count === 0/);
  assert.match(app, /screen = \{ name: "new-event-participants" \}/);
  assert.match(app, /function syncNewEventDraftFromRenderedDetails\(\)/);
  assert.match(
    app,
    /if \(action === "open-new-event-settlement"\) \{[\s\S]*?syncNewEventDraftFromRenderedDetails\(\)/
  );
});

test("new event participants offer friends, offline names, and an invite link or QR", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const ledgerStyles = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");
  const participantsStep = sourceBetween(
    app,
    "function renderNewEventParticipantAction",
    "function renderEventShareFriends"
  );
  const newEventAction = sourceBetween(
    app,
    'if (action === "new-event")',
    'if (action === "new-event-type")'
  );
  const createFlow = sourceBetween(
    app,
    "async function createEventFromDraft()",
    "async function joinExistingEventFromDraft()"
  );
  const inviteToggleAction = sourceBetween(
    app,
    'if (action === "toggle-new-event-invite-after-create")',
    'if (action === "group-add-member")'
  );

  assert.match(participantsStep, /בחר מחברים/);
  assert.match(participantsStep, /renderParticipantChecks\(newEventDraft\.participantIds, "new-event-participant"\)/);
  assert.match(participantsStep, /הוסף שם ידנית/);
  assert.match(participantsStep, /הזמן בקישור/);
  assert.match(participantsStep, /משתתפים שנבחרו/);
  assert.match(participantsStep, /new-event-participant-additions/);
  assert.match(participantsStep, /הוספת משתתפים/);
  assert.ok(
    participantsStep.indexOf("new-event-selected-participants") <
      participantsStep.indexOf("new-event-participant-additions")
  );
  assert.match(participantsStep, /action: "toggle-new-event-invite-after-create"/);
  assert.match(participantsStep, /aria-pressed="\$\{pressed\}"/);
  assert.match(app, /inviteAfterCreate: false/);
  assert.match(newEventAction, /refreshFriendNetwork\(\{ preserveNotice: true \}\)/);
  assert.match(inviteToggleAction, /newEventDraft\.inviteAfterCreate = !newEventDraft\.inviteAfterCreate/);
  assert.doesNotMatch(inviteToggleAction, /participantDetails\.open/);
  assert.match(createFlow, /const inviteAfterCreate = newEventDraft\.inviteAfterCreate === true/);
  assert.match(createFlow, /const saveRequest = persistState\(\)/);
  assert.match(createFlow, /const submittedDraft = structuredClone\(newEventDraft\)/);
  assert.match(createFlow, /const stateBeforeCreate = structuredClone\(state\)/);
  assert.match(createFlow, /const saveResult = await saveRequest/);
  assert.match(createFlow, /if \(!saveResult\?\.ok && !saveResult\?\.pending\)/);
  assert.match(createFlow, /newEventDraft = submittedDraft/);
  assert.match(
    createFlow,
    /state = stateBeforeCreate;\s+saveState\(stateBeforeCreate\);\s+newEventDraft = submittedDraft/
  );
  assert.match(createFlow, /if \(!inviteAfterCreate \|\| saveResult\?\.pending\) return/);
  assert.ok(
    createFlow.indexOf("const saveResult = await saveRequest") <
      createFlow.indexOf('screen = { name: "event", eventId: event.id }')
  );
  assert.match(createFlow, /if \(createEventBusy\) return/);
  assert.match(createFlow, /finally \{[\s\S]*?createEventBusy = false/);
  assert.doesNotMatch(createFlow, /Promise\.resolve\(saveRequest\)\.catch/);
  assert.match(createFlow, /await openPreparedEventShare/);
  assert.match(ledgerStyles, /\.new-event-invite-after-create/);
  assert.match(ledgerStyles, /min-height: 72px/);
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

test("new event participant choices show selection without artificial status badges", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const styles = await readFile("styles.css", "utf8");
  const ledgerStyles = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");
  const participantPill = sourceBetween(
    app,
    "function renderParticipantPill(",
    "function renderExpenseParticipantRow("
  );

  assert.doesNotMatch(participantPill, /renderParticipantMembershipStatus\(selected\)/);
  assert.match(participantPill, /new-event-selection-check app-selection-check/);
  assert.match(app, /isEventCreationGroup = action === "new-event-participant"/);
  assert.match(app, /isEventCreationGroup \? "" : '<span class="participant-identity-group-marker"/);
  assert.match(app, /isEventCreationGroup \? "" : `<span class="participant-identity-group-count/);
  assert.match(styles, /\.participant-membership-status\[data-membership-state="active"\]/);
  assert.match(
    ledgerStyles,
    /\.new-event-participant-picker \.participant-pill:has\(input:checked\)/
  );
  assert.match(
    ledgerStyles,
    /\.new-event-participant-picker \.participant-pill \.avatar\.is-account::after\s*\{[\s\S]*?display: none !important;/
  );
  assert.match(
    ledgerStyles,
    /\.new-event-participant-picker \.participant-pill input:checked ~ \.new-event-selection-check[\s\S]*?background: #08745d !important;/
  );
  assert.match(
    ledgerStyles,
    /\.new-event-participant-picker \.new-event-selection-check\s*\{[\s\S]*?margin-inline-start: auto !important;/
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
  assert.match(app, /screen\.name === "new-event-participants" && newEventDraft/);
  assert.match(app, /screen = \{ name: "new-event" \};\s+renderHistoryFallback\(\)/);
  assert.match(app, /screen = \{ name: "new-event-type" \};\s+renderHistoryFallback\(\)/);
  assert.match(backLayer, /button\.closest\('\[data-event-creation-step\]'\)/);
});

test("removing a selected new-event participant asks for confirmation", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(
    app,
    /\["toggle-new-event-participant", "new-event-participant"\]\.includes\(action\)[\s\S]*?newEventDraft\.participantIds\.includes\(participantId\)[\s\S]*?requestNewEventParticipantRemoval/
  );
  assert.match(app, /data-action="toggle-new-event-participant"/);
  assert.match(app, /kind: "remove-new-event-participant"/);
  assert.match(app, /title: `להסיר את \$\{participant\.displayName\} מהאירוע\?`/);
  assert.match(
    app,
    /action\.kind === "remove-new-event-participant"[\s\S]*?toggleId\(newEventDraft\.participantIds, action\.payload\.participantId, false\)/
  );
});

test("cancelling participant selection returns to settlement through browser history", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const participantActions = sourceBetween(
    app,
    'if (action === "cancel-new-event-participants")',
    'if (action === "set-new-event-participant-view")'
  );

  assert.match(
    participantActions,
    /action === "cancel-new-event-participants"[\s\S]*?screen = \{ name: "new-event-settlement" \};[\s\S]*?renderHistoryFallback\(\)/
  );
  assert.doesNotMatch(participantActions, /screen = \{ name: "new-event-settlement" \};\s+render\(\)/);
});

test("friend and manual participant choices open dedicated full-screen subviews", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const ledgerStyles = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");
  const closeSubview = sourceBetween(
    app,
    'if (action === "close-new-event-participant-view")',
    'if (action === "join-event-screen")'
  );

  assert.match(app, /function renderNewEventParticipantSubview\(availableGroups\)/);
  assert.match(app, /data-new-event-participant-subview=/);
  assert.match(app, /data-action="close-new-event-participant-view"/);
  assert.match(app, /newEventDraft\.participantView = nextView;/);
  assert.match(
    app,
    /newEventParticipantView:[\s\S]*?screen\.name === "new-event-participants"[\s\S]*?newEventDraft\?\.participantView/
  );
  assert.match(closeSubview, /newEventDraft\.participantView = "";[\s\S]*?renderHistoryFallback\(\)/);
  assert.doesNotMatch(closeSubview, /newEventDraft\.participantView = "";\s+render\(\)/);
  assert.match(
    app,
    /screen\.name === "new-event-participants"[\s\S]*?\["friends", "manual"\]\.includes\(newEventDraft\.participantView\)/
  );
  assert.match(ledgerStyles, /\.new-event-participant-subscreen/);
  assert.match(ledgerStyles, /\.new-event-participant-subview-footer/);
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
