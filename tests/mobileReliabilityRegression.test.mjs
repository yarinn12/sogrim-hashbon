import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
const localStore = readFileSync(
  new URL("../src/data/localStore.mjs", import.meta.url),
  "utf8"
);
const googleAuth = readFileSync(
  new URL("../src/publicGoogleAuthLayer.mjs", import.meta.url),
  "utf8"
);
const nativeBridge = readFileSync(
  new URL("../src/publicNativeBridgeLayer.mjs", import.meta.url),
  "utf8"
);

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return source.slice(start, end);
}

test("public Google sign-in is single-flight and bounded", () => {
  const credentialHandler = sourceBetween(
    googleAuth,
    "async function handleGoogleCredential(response)",
    "async function handleGoogleCredentialOnce(response)"
  );
  const verification = sourceBetween(
    googleAuth,
    "async function verifyGoogleCredential(credential)",
    "function loadGoogleScript()"
  );
  const scriptLoader = sourceBetween(
    googleAuth,
    "function loadGoogleScript()",
    "function setGoogleBusy"
  );

  assert.match(googleAuth, /import \{ fetchWithTimeout \} from "\.\/data\/fetchTimeout\.mjs"/);
  assert.match(credentialHandler, /if \(googleCredentialRequest\) return googleCredentialRequest/);
  assert.match(verification, /fetchWithTimeout\(/);
  assert.match(verification, /GOOGLE_AUTH_TIMEOUT_MS/);
  assert.match(scriptLoader, /GOOGLE_SCRIPT_TIMEOUT_MS/);
  assert.match(scriptLoader, /googleScriptPromise = null/);
});

test("native image reads and fallback reset requests cannot hang indefinitely", () => {
  assert.match(
    nativeBridge,
    /fetchWithTimeout\(\s*globalThis\.fetch,\s*webPath,\s*\{\},\s*10_000\s*\)/
  );
  assert.match(
    localStore,
    /fetchWithTimeout\(\s*globalThis\.fetch,\s*"\/api\/reset",\s*\{ method: "POST" \},\s*RUNTIME_CONFIG_TIMEOUT_MS\s*\)/
  );
});

test("quick expense batches wait for a durable result and emit one bounded activity", () => {
  const quickSave = sourceBetween(
    app,
    "async function saveQuickExpenses(eventId)",
    "async function deleteExpense"
  );

  assert.match(quickSave, /if \(!expenseDraft \|\| expenseSaveInProgress\) return/);
  assert.match(quickSave, /const saveResult = await persistState\(\{[\s\S]*?awaitCloud: true/);
  assert.match(quickSave, /if \(!saveResult\?\.ok\)/);
  assert.match(quickSave, /state = previousState/);
  assert.match(quickSave, /publishReferralActivityAfterSave\(/);
  assert.match(quickSave, /const firstExpense = result\.expenses\[0\]/);
  assert.match(quickSave, /publishEventActivityAfterSave\(/);
  assert.ok(
    quickSave.indexOf("const saveResult = await persistState(") <
      quickSave.indexOf("expenseDraft = null"),
    "the modal closes only after the save result"
  );
  assert.match(app, /await saveQuickExpenses\(target\.dataset\.eventId\)/);
});

test("deferred foreground saves retain their real cloud completion", () => {
  const budget = sourceBetween(
    localStore,
    "async function settleSaveWithinUiBudget",
    "function publishSyncStatus"
  );
  assert.match(budget, /completion: saveRequest/);
  assert.match(app, /function completedSaveResult\(saveRequest\)/);
  assert.match(app, /result\?\.completion \? result\.completion : result/);

  const referral = sourceBetween(
    app,
    "function publishReferralActivityAfterSave",
    "function publishEventActivityAfterSave"
  );
  const activity = sourceBetween(
    app,
    "function publishEventActivityAfterSave",
    "function completedSaveResult"
  );
  assert.match(referral, /completedSaveResult\(saveRequest\)/);
  assert.match(activity, /completedSaveResult\(saveRequest\)/);
});

test("legacy permission and participant alias actions await cloud persistence", () => {
  const alias = sourceBetween(
    app,
    "async function saveParticipantAlias",
    "function requestExpenseDeletion"
  );
  const permission = sourceBetween(
    app,
    "async function toggleAdminEditMode",
    "async function leaveCurrentEvent"
  );

  assert.match(alias, /const result = await persistState\(\{[\s\S]*?awaitCloud: true/);
  assert.match(alias, /event\.participantAliases = previousAliases/);
  assert.match(app, /await saveParticipantAlias\(/);
  assert.match(permission, /return setEventManagementMode\(/);
  assert.match(app, /await toggleAdminEditMode\(target\.dataset\.eventId\)/);
});

test("event participant mutations await persistence and recover after failure", () => {
  const addGuest = sourceBetween(
    app,
    "async function addGuestToEvent",
    "function expenseParticipantAddRewindSteps"
  );
  const separateDuplicates = sourceBetween(
    app,
    "async function keepDuplicateParticipantsSeparate",
    "async function saveOfflineParticipantName"
  );
  const renameOffline = sourceBetween(
    app,
    "async function saveOfflineParticipantName",
    "async function saveParticipantAlias"
  );

  assert.match(
    addGuest,
    /const saveRequest = persistState\(\{[\s\S]*?awaitCloud: true,[\s\S]*?forceSharedEventIds: \[eventId\]/
  );
  assert.match(addGuest, /const previousState = cloneNavigationValue\(state\)/);
  assert.match(addGuest, /const result = await completedSaveResult\(saveRequest\)/);
  assert.match(addGuest, /state = previousState/);
  assert.match(addGuest, /return result/);
  assert.match(app, /await addGuestToEvent\(target\.dataset\.eventId\)/);
  assert.match(separateDuplicates, /const result = await persistState\(\{[\s\S]*?awaitCloud: true/);
  assert.match(renameOffline, /const result = await persistState\(\{[\s\S]*?awaitCloud: true/);
  assert.match(app, /await keepDuplicateParticipantsSeparate\(/);
  assert.match(app, /await saveOfflineParticipantName\(/);
});

test("membership and settlement mutations wait for canonical cloud persistence", () => {
  for (const [startMarker, endMarker] of [
    ["async function leaveCurrentEvent", "async function deleteCurrentEvent"],
    ["async function markTransferPaid", "async function markTransferPending"],
    ["async function markTransfersPending", "async function sendTransferReminder"],
    ["async function removeEventParticipant", "function requestNewEventParticipantRemoval"],
    ["async function restoreEventParticipant", "async function toggleEventParticipant"],
    ["async function toggleEventParticipant", "function updateParticipantInvitationMessage"]
  ]) {
    const action = sourceBetween(app, startMarker, endMarker);
    assert.match(action, /awaitCloud: true/);
    assert.match(action, /forceSharedEventIds: \[event(?:\.id|Id)\]/);
  }

  const leave = sourceBetween(
    app,
    "async function leaveCurrentEvent",
    "async function deleteCurrentEvent"
  );
  assert.ok(
    leave.indexOf("מסיים את העזיבה") < leave.indexOf("await persistState"),
    "leaving shows progress before waiting for the canonical save"
  );
  assert.ok(
    leave.lastIndexOf('עזבת את') > leave.indexOf("await persistState"),
    "success is announced only after the canonical save result"
  );
});

test("inline expense participants cannot silently diverge from the shared event", () => {
  const payerGuest = sourceBetween(
    app,
    "async function addInlinePayerGuest",
    "async function addInlineQuickItemGuest"
  );
  const quickGuest = sourceBetween(
    app,
    "async function addInlineQuickItemGuest",
    "function prepareEventShare"
  );

  assert.match(app, /await addInlinePayerGuest\(/);
  assert.match(app, /await addInlineQuickItemGuest\(/);
  for (const mutation of [payerGuest, quickGuest]) {
    assert.match(mutation, /const previousState = cloneNavigationValue\(state\)/);
    assert.match(mutation, /await completedSaveResult\(/);
    assert.match(mutation, /state = previousState/);
  }
});
