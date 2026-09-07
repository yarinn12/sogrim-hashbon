import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { appendEventActivity } from "../src/domain/eventActivityLog.mjs";
import { saveFailureMessage } from "../src/domain/userNoticePolicy.mjs";

const source = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
const start = source.indexOf("async function createEventFromDraft()");
const end = source.indexOf("function syncNewEventDraftFromRenderedDetails", start);
const tick = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

test("the restored creation form renders its save failure notice", () => {
  const from = source.indexOf("function renderNewEventSettlement()");
  const to = source.indexOf("function renderNewEventInlinePicker", from);
  const ctx = vm.createContext({
    ensureNewEventDraft() {}, newEventDraft: {}, renderAppBackButton: () => "",
    renderNotice: () => '<div role="status">creation rejected</div>',
    renderEventCreationProgress: () => "", renderNewEventInlinePicker: () => ""
  });
  vm.runInContext(source.slice(from, to), ctx);
  assert.match(ctx.renderNewEventSettlement(), /role="status">creation rejected/);
});

function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function harness({ save, invite, share } = {}) {
  const saves = [], invitations = [], pending = [], renders = [];
  let nextId = 0;
  const ctx = vm.createContext({
    structuredClone, appendEventActivity, saveFailureMessage,
    state: { currentParticipantId: "account-a", participants: [
      { id: "account-a", displayName: "Owner" }, { id: "account-b", displayName: "Peer" }
    ], events: [{ id: "existing-event", name: "Existing" }], groups: [] },
    newEventDraft: { name: "New event", participantIds: ["account-a", "account-b"], eventType: "standard", currency: "ILS", managementMode: "all" },
    screen: { name: "new-event-participants" }, createEventBusy: false, createEventRequest: null,
    joinEventDraft: null, expenseDraft: null, eventDialog: null, notice: "", appHistoryDepth: 1, lastNavigationViewKey: "old", generation: 0,
    ensureCurrentParticipantInNewEventDraft() {}, normalizeEventType: value => value,
    normalizeCurrency: value => value, managementModeRequiresAdmin: () => false,
    initializeParticipantMembership: ids => Object.fromEntries(ids.map(id => [id, "now"])),
    accountUserIdFromParticipantId: id => id.startsWith("account-") ? id.slice(8) : "",
    ensureEventShareCredentials: event => { event.sharedSpaceId = "shared-event"; event.sharedSpaceKey = "synthetic-key"; },
    makeId: prefix => `${prefix}-${++nextId}`,
    persistState: options => { saves.push({ options, state: structuredClone(ctx.state) }); return save ? save(ctx, options) : Promise.resolve({ ok: true, mode: "cloud" }); },
    saveState: () => {}, render: () => renders.push(ctx.screen.name), emitProductMetric() {}, emitOperationDeferred() {},
    app: { querySelector: () => null }, requestAnimationFrame: callback => callback(),
    rememberPendingEventMembershipInvitation: (eventId, participantId) => pending.push({ eventId, participantId }),
    forgetPendingEventMembershipInvitation: (eventId, participantId) => { const index = pending.findIndex(item => item.eventId === eventId && item.participantId === participantId); if (index >= 0) pending.splice(index, 1); },
    publishEventInvitation: (id, participant) => { invitations.push({ id, participant }); return invite ? invite() : Promise.resolve({ ok: true }); },
    schedulePendingMutationRecovery() {},
    completedSaveResult: request => Promise.resolve(request).then(result => result?.completion ?? result),
    openPreparedEventShare: () => share ? share() : Promise.resolve(),
    getEvent: id => ctx.state.events.find(event => event.id === id),
    captureFriendAccountContext: () => {
      const participantId = ctx.state.currentParticipantId, generation = ctx.generation;
      return { isCurrent: () => ctx.state.currentParticipantId === participantId && ctx.generation === generation };
    }
  });
  vm.runInContext(source.slice(start, end), ctx);
  return { ctx, saves, invitations, pending, renders };
}

test("connected event creation uses the durable UI budget while forcing canonical publication", async () => {
  const h = harness(); await h.ctx.createEventFromDraft();
  assert.notEqual(h.saves[0].options.awaitCloud, true);
  assert.equal(h.saves[0].state.events[0].sharedSpaceId, "shared-event");
  assert.deepEqual(Array.from(h.saves[0].options.forceSharedEventIds), [h.saves[0].state.events[0].id]);
});

test("slow invitations do not retain the create-event busy lock", async () => {
  const gate = deferred(); const h = harness({ invite: () => gate.promise }); let settled = false;
  const request = h.ctx.createEventFromDraft().then(() => { settled = true; }); await tick();
  const observed = { settled, busy: h.ctx.createEventBusy, screen: h.ctx.screen.name };
  gate.resolve({ ok: true }); await request;
  assert.deepEqual(observed, { settled: true, busy: false, screen: "event" });
});

test("optional share failure never rolls back an already saved event", async () => {
  const h = harness({ share: async () => { throw new Error("Share unavailable"); } });
  h.ctx.newEventDraft.inviteAfterCreate = true;
  await h.ctx.createEventFromDraft(); await tick();
  assert.equal(h.ctx.state.events.length, 2); assert.equal(h.ctx.screen.name, "event");
});

test("a synchronous save exception releases the busy flag and preserves the draft", async () => {
  const h = harness({ save: () => { throw new Error("Storage unavailable"); } });
  await assert.doesNotReject(h.ctx.createEventFromDraft());
  assert.equal(h.ctx.createEventBusy, false); assert.equal(h.ctx.newEventDraft.name, "New event");
  assert.equal(h.ctx.state.events.length, 1);
});

test("late save completion cannot navigate or overwrite another account", async () => {
  const gate = deferred(); const h = harness({ save: () => gate.promise });
  const request = h.ctx.createEventFromDraft();
  h.ctx.generation++; h.ctx.state = { currentParticipantId: "account-c", participants: [], events: [{ id: "c-event" }] };
  h.ctx.screen = { name: "profile" }; h.ctx.newEventDraft = { name: "Other draft" };
  gate.resolve({ ok: false }); await request;
  assert.equal(h.ctx.state.currentParticipantId, "account-c");
  assert.equal(h.ctx.screen.name, "profile"); assert.equal(h.ctx.newEventDraft.name, "Other draft");
});

test("creation rejection removes only its event, preserving concurrent changes", async () => {
  const gate = deferred(); const h = harness({ save: () => gate.promise });
  const request = h.ctx.createEventFromDraft();
  h.ctx.state.events.find(event => event.id === "existing-event").name = "Peer edit";
  gate.resolve({ ok: false }); await request;
  assert.equal(h.ctx.state.events[0].name, "Peer edit");
  assert.equal(h.ctx.state.events.length, 1);
});

test("navigating away during save is respected", async () => {
  const gate = deferred(); const h = harness({ save: () => gate.promise });
  const request = h.ctx.createEventFromDraft(); h.ctx.screen = { name: "home" };
  gate.resolve({ ok: true, mode: "cloud" }); await request;
  assert.equal(h.ctx.screen.name, "home");
});

test("pending creation remembers invitations before cloud completion and sends only afterward", async () => {
  const gate = deferred();
  const h = harness({ save: async () => ({ ok: true, mode: "queued", pending: true, completion: gate.promise }) });
  await h.ctx.createEventFromDraft();
  assert.equal(h.pending.length, 1); assert.equal(h.invitations.length, 0);
  assert.equal(h.ctx.screen.name, "event");
  gate.resolve({ ok: true, mode: "cloud" }); await tick();
  assert.equal(h.invitations.length, 1);
});

test("repeated submit while saving creates only one event and one save", async () => {
  const gate = deferred(); const h = harness({ save: () => gate.promise });
  const request = h.ctx.createEventFromDraft();
  await h.ctx.createEventFromDraft();
  assert.equal(h.saves.length, 1); assert.equal(h.ctx.state.events.length, 2);
  gate.resolve({ ok: true, mode: "cloud" }); await request;
  assert.equal(h.ctx.createEventBusy, false);
});

test("a queued creation never invites after cloud rejects it", async () => {
  const gate = deferred();
  const h = harness({ save: async () => ({ ok: true, pending: true, mode: "queued", completion: gate.promise }) });
  await h.ctx.createEventFromDraft();
  gate.resolve({ ok: false, mode: "cloud", reverted: true }); await tick();
  assert.equal(h.invitations.length, 0); assert.equal(h.ctx.createEventBusy, false);
});

test("an account change after queued creation prevents its invitation follow-up", async () => {
  const gate = deferred();
  const h = harness({ save: async () => ({ ok: true, pending: true, mode: "queued", completion: gate.promise }) });
  await h.ctx.createEventFromDraft(); h.ctx.generation++;
  gate.resolve({ ok: true, mode: "cloud" }); await tick();
  assert.equal(h.invitations.length, 0);
});

test("the old account save cannot unlock a new account creation", async () => {
  const oldSave = deferred(), newSave = deferred(); let count = 0;
  const h = harness({ save: () => ++count === 1 ? oldSave.promise : newSave.promise });
  const oldRequest = h.ctx.createEventFromDraft();
  h.ctx.generation++;
  h.ctx.newEventDraft = structuredClone(h.ctx.newEventDraft);
  h.ctx.screen = { name: "new-event-participants" };
  const newRequest = h.ctx.createEventFromDraft();
  oldSave.resolve({ ok: false }); await oldRequest;
  assert.equal(h.ctx.createEventBusy, true);
  newSave.resolve({ ok: true, mode: "cloud" }); await newRequest;
  assert.equal(h.ctx.createEventBusy, false); assert.equal(h.saves.length, 2);
});
