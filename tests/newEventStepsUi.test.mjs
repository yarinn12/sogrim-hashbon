import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function sourceBetween(source, start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

test("new event creation separates type, management, and details", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const typeStep = sourceBetween(
    app,
    "function renderNewEventType()",
    "function renderNewEventManagement()"
  );
  const managementStep = sourceBetween(
    app,
    "function renderNewEventManagement()",
    "function renderNewEvent()"
  );
  const detailsStep = sourceBetween(app, "function renderNewEvent()", "function renderJoinEvent()");

  assert.match(typeStep, /data-event-creation-step="type"/);
  assert.match(typeStep, /data-action="new-event-type"/);
  assert.match(typeStep, /renderForwardChevron\(\)/);
  assert.doesNotMatch(typeStep, /data-action="new-event-name"/);
  assert.doesNotMatch(typeStep, /data-action="new-event-group"/);
  assert.doesNotMatch(typeStep, /data-action="create-event"/);

  assert.match(managementStep, /data-event-creation-step="management"/);
  assert.match(managementStep, /action: "new-event-management-mode"/);
  assert.match(app, /action === "new-event-management-mode"/);
  assert.match(app, /class="event-choice-forward" aria-hidden="true"/);
  assert.match(app, /<path d="m15 18-6-6 6-6"/);
  assert.match(managementStep, /מי יעדכן את ההוצאות/);
  assert.doesNotMatch(managementStep, /data-action="new-event-name"/);
  assert.doesNotMatch(managementStep, /data-action="create-event"/);

  assert.match(detailsStep, /data-event-creation-step="details"/);
  assert.match(detailsStep, /data-action="new-event-name"/);
  assert.match(detailsStep, /data-action="new-event-group"/);
  assert.match(detailsStep, /availableGroups\.length/);
  assert.match(detailsStep, /data-action="create-event"/);
  assert.doesNotMatch(detailsStep, /data-action="new-event-type"/);
  assert.doesNotMatch(detailsStep, /action: "new-event-management-mode"/);
});

test("event creation chooses between centralized and collaborative management", async () => {
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

test("event creation shows a clear three-step progress indicator", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const typeStep = sourceBetween(
    app,
    "function renderNewEventType()",
    "function renderNewEventManagement()"
  );
  const managementStep = sourceBetween(
    app,
    "function renderNewEventManagement()",
    "function renderNewEvent()"
  );
  const detailsStep = sourceBetween(app, "function renderNewEvent()", "function renderEventCreationProgress");
  const progress = sourceBetween(app, "function renderEventCreationProgress", "function renderJoinEvent()");

  assert.match(typeStep, /renderEventCreationProgress\("type"\)/);
  assert.match(managementStep, /renderEventCreationProgress\("management"\)/);
  assert.match(detailsStep, /renderEventCreationProgress\("details"\)/);
  assert.match(progress, /event-creation-progress/);
  assert.match(progress, /aria-current="step"/);
  assert.match(progress, /label: "סוג"/);
  assert.match(progress, /label: "ניהול"/);
  assert.match(progress, /פרטים/);
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
  assert.match(app, /createButton\.disabled = count === 0/);
  assert.match(app, /keepParticipantsOpen/);
  assert.match(app, /participantDetails\.open = true/);
});

test("event creation back navigation follows type, management, and details", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const backLayer = await readFile("src/publicBackNavigationLayer.mjs", "utf8");

  assert.match(app, /screen = \{ name: "new-event-type" \};\s+newEventDraft = null/);
  assert.match(
    app,
    /newEventDraft\.eventType = selectedEventType;[\s\S]*?newEventDraft\.managementMode =[\s\S]*?screen = \{ name: "new-event-management" \}/
  );
  assert.match(
    app,
    /if \(action === "new-event-management-mode"\)[\s\S]*?screen = \{ name: "new-event" \}/
  );
  assert.match(app, /querySelector\('\[data-action="new-event-name"\]'\)\?\.focus/);
  assert.match(app, /screen\.name === "new-event" && newEventDraft/);
  assert.match(app, /screen = \{ name: "new-event-management" \};\s+renderHistoryFallback\(\)/);
  assert.match(app, /screen\.name === "new-event-management" && newEventDraft/);
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
