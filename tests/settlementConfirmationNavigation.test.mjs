import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
}
const render = section("function render() {", "function replaceScreenAroundPersistentIdentity(");
const history = section("function currentHistoryView()", "function effectiveScreenForHistory()");
const popstate = section("function handleBrowserHistoryBack(event)", "function hasIndependentHistoryDialog()");

// Execute the application's render and history lifecycle. Rendering/DOM adapters
// are synthetic here; the mobile suite exercises real markup and pointer input.
function harness() {
  const classes = new Set(["app-dialog-open"]);
  const historyWrites = [], activations = [];
  const domainState = {
    currentParticipantId: "owner",
    events: ["event-a", "event-b"].map(id => ({
      id, locked: false, expenses: [{ id: `${id}-expense`, total: 12000 }],
      transfers: [{ from: "friend", to: "owner", amount: 6000, status: "pending" }]
    }))
  };
  let backgroundInert = true;
  let renderedConfirmation = false;
  const ctx = vm.createContext({
    state: domainState, localProfile: { participantId: "owner" },
    screen: { name: "settlement", eventId: "event-a" },
    settlementCloseConfirmation: { eventId: "event-a" },
    newEventDraft: null, joinEventDraft: null, expenseDraft: null,
    eventDialog: null, groupDraft: null, editingGroupDraft: null,
    mergeParticipantsDraft: null, importantActionDialog: null,
    importantActionReturnFocus: null, pendingImportantActionReturnFocus: null,
    eventStatusMenu: null, settlementCelebration: null,
    pendingConfirmedEventDialog: null, pendingDialogHistoryRewind: null,
    dialogReturnFocus: null, pendingDialogReturnFocus: null,
    dialogReturnScrollY: 0, pendingDialogReturnScrollY: 0,
    pendingSettingsReturnFocusSection: "", restoringBrowserHistory: false,
    appHistoryDepth: 3, homeBackNavigationPending: false,
    APP_HISTORY_STATE_KEY: "qa-history", NEW_EVENT_FLOW_SCREENS: new Set(),
    cloneNavigationValue: value => value == null ? null : structuredClone(value),
    effectiveScreenForHistory: () => structuredClone(ctx.screen),
    rememberExpenseDraft() {}, rememberEventNoteDraft() {},
    syncNewEventDraftFromRenderedDetails() {}, ensureRenderableScreen() {},
    getEvent: id => domainState.events.find(event => event.id === id),
    syncBrowserHistory() {
      if (!ctx.restoringBrowserHistory) historyWrites.push(ctx.currentHistoryView());
    },
    clearDialogBackgroundInert() { backgroundInert = false; },
    document: { body: { classList: {
      add: name => classes.add(name), remove: name => classes.delete(name)
    } } },
    renderHome: () => "home", renderGroups: () => "groups",
    renderNotificationInbox: () => "notifications", renderProfileSetup: () => "profile",
    renderEvent: () => "event", renderEventNotes: () => "event-notes",
    renderSettlement: () => ctx.settlementCloseConfirmation ? "confirmation" : "settlement",
    commitRenderedScreen(markup) { renderedConfirmation = markup === "confirmation"; },
    hasIndependentHistoryDialog: () => false,
    activateDialog(selector) {
      activations.push({ selector, visible: renderedConfirmation });
      classes.add("app-dialog-open");
      if (renderedConfirmation) backgroundInert = true;
    },
    scheduleDialogReturnScroll() {}, restorePendingDialogReturnFocus() {},
    window: { history: {}, setTimeout() {} }
  });
  vm.runInContext(render + history + popstate, ctx);
  return {
    ctx, domainState, historyWrites, activations,
    locked: () => classes.has("app-dialog-open"), inert: () => backgroundInert,
    pop(view, depth) {
      ctx.handleBrowserHistoryBack({ state: { "qa-history": true, depth, view: structuredClone(view) } });
    }
  };
}

for (const destination of [
  { name: "home" }, { name: "groups", tab: "people" },
  { name: "notifications" }, { name: "profile" },
  { name: "event", eventId: "event-a" },
  { name: "event-notes", eventId: "event-a" },
  { name: "settlement", eventId: "event-b" }
]) {
  test(`leaving close confirmation for ${destination.name}:${destination.eventId ?? ""} releases navigation without closing an event`, () => {
    const h = harness();
    const before = structuredClone(h.domainState);
    h.ctx.screen = destination;
    h.ctx.render();
    assert.equal(h.ctx.settlementCloseConfirmation, null, "an invisible confirmation must not survive its route");
    assert.equal(h.locked(), false);
    assert.equal(h.inert(), false);
    assert.equal(h.historyWrites.at(-1).settlementCloseConfirmation, null,
      "the destination history entry must not retain an invisible confirmation");
    assert.deepEqual(h.domainState, before, "navigation must not close an event or change expenses/payments");
  });
}

test("a same-event refresh keeps the visible close confirmation and its background protection", () => {
  const h = harness();
  h.domainState.events[0].note = "Synthetic incoming update";
  const afterIncomingUpdate = structuredClone(h.domainState);
  h.ctx.render();
  assert.equal(h.ctx.settlementCloseConfirmation.eventId, "event-a");
  assert.equal(h.locked(), true);
  assert.equal(h.inert(), true);
  assert.equal(h.historyWrites.at(-1).settlementCloseConfirmation.eventId, "event-a");
  assert.deepEqual(h.domainState, afterIncomingUpdate);
});

test("Back restores a protected confirmation, Forward releases it, and stale history cannot lock another event", () => {
  const h = harness();
  const before = structuredClone(h.domainState);
  const confirmationView = h.ctx.currentHistoryView();
  h.ctx.screen = { name: "home" };
  h.ctx.render();
  const homeView = h.ctx.currentHistoryView();
  h.pop(confirmationView, 2);
  assert.equal(h.ctx.settlementCloseConfirmation.eventId, "event-a");
  assert.equal(h.locked(), true);
  assert.equal(h.inert(), true);
  assert.deepEqual(h.activations.at(-1), { selector: ".settlement-close-confirmation", visible: true });
  h.pop(homeView, 3);
  assert.equal(h.ctx.settlementCloseConfirmation, null);
  assert.equal(h.locked(), false);
  assert.equal(h.inert(), false);
  // A history entry recorded by the old client can contain stale UI state.
  const stale = structuredClone(confirmationView);
  stale.screen = { name: "settlement", eventId: "event-b" };
  h.pop(stale, 4);
  assert.equal(h.ctx.settlementCloseConfirmation, null);
  assert.equal(h.locked(), false);
  assert.equal(h.inert(), false);
  assert.equal(h.activations.length, 1, "history must never activate an absent confirmation");
  assert.deepEqual(h.domainState, before);
});
