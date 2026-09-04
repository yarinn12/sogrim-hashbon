import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as actions from "../src/domain/appActions.mjs";
import * as permissions from "../src/domain/permissions.mjs";
import * as settings from "../src/domain/settlement.mjs";
import { isEventClosed } from "../src/domain/eventFilters.mjs";
import * as currencies from "../src/domain/currencies.mjs";
import { mergeSharedStates } from "../src/domain/sharedStateMerge.mjs";

const source = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
function functionSource(name) {
  const match = new RegExp(`(?:async )?function ${name}\\(`).exec(source);
  assert.ok(match, `${name} exists`);
  const start = match.index;
  const next = /\n(?:async )?function /.exec(source.slice(start + 1));
  return source.slice(start, next ? start + 1 + next.index : undefined);
}

const baseTime = "2026-01-01T00:00:00.000Z";
function initialState() {
  return {
    currentParticipantId: "account-a", groups: [],
    participants: [{ id: "account-a", displayName: "Account A", kind: "user" }],
    events: [{ id: "settings", name: "Settings", currency: "ILS", participantIds: ["account-a"],
      adminIds: ["account-a"], createdByParticipantId: "account-a", adminsCanEditOnly: false,
      directSettlementTransfers: false, roundSettlementTransfers: true, locked: false,
      settingsUpdatedAt: baseTime, createdAt: baseTime, expenses: [], transfers: [], notes: [] }]
  };
}

function harness() {
  const requests = [];
  const renders = [];
  const context = vm.createContext({
    ...actions, ...permissions, ...settings, ...currencies, isEventClosed,
    currencySelectLabel: (value) => value,
    managementModeRequiresAdmin: (mode) => mode === "centralized",
    state: initialState(), notice: "", expenseDraft: null,
    eventRepaymentModeRequestVersions: new Map(), revision: 0, console, structuredClone,
    sharedStateSaveRevision: () => context.revision,
    getEvent: (id) => context.state.events.find((event) => event.id === id),
    canCurrentParticipantManage: () => true,
    cloneNavigationValue: structuredClone,
    eventSettlementTransfers: (event) => event.transfers ?? [],
    recordEventActivity: () => {}, prepareEventTransfers: () => {},
    render: () => renders.push({ state: structuredClone(context.state), notice: context.notice }),
    reactivateDialogAfterRender: () => {},
    requestAnimationFrame: (callback) => callback(),
    app: { querySelector: () => null },
    window: { setTimeout: (callback) => callback() },
    persistState: () => {
      context.revision += 1;
      return new Promise((resolve) => requests.push({ state: structuredClone(context.state), resolve }));
    }
  });
  for (const name of ["stateSaveCheckpoint", "rejectedStateSaveIsCurrent", "settlementTransferPlanKey", "eventCurrency",
    "updateEventCoverImage", "setEventRepaymentMode", "setEventManagementMode", "toggleEventLock",
    "applyEventCurrencyChange", "setEventRoundingMode"]) {
    vm.runInContext(functionSource(name), context);
  }
  if (source.includes("function stateSaveIsCurrent(")) vm.runInContext(functionSource("stateSaveIsCurrent"), context);
  return { context, requests, renders };
}

test("changing a legacy event cover cannot overwrite newer remote settings", async () => {
  const h = harness();
  const remote = initialState();
  Object.assign(remote.events[0], {
    currency: "USD", adminsCanEditOnly: true, directSettlementTransfers: true,
    settingsUpdatedAt: "2026-02-01T00:00:00.000Z"
  });
  const request = h.context.updateEventCoverImage("settings", "new-cover");
  const merged = mergeSharedStates(remote, h.requests[0].state).events[0];
  h.requests[0].resolve({ ok: true });
  await request;
  assert.equal(merged.coverImage, "new-cover");
  assert.equal(merged.currency, "USD");
  assert.equal(merged.adminsCanEditOnly, true);
  assert.equal(merged.directSettlementTransfers, true);
});

test("late repayment failure cannot change another account's copy of the same event", async () => {
  const h = harness();
  const request = h.context.setEventRepaymentMode("settings", "direct");
  const otherAccount = initialState();
  otherAccount.currentParticipantId = "account-b";
  otherAccount.events[0].directSettlementTransfers = true;
  otherAccount.events[0].settingsUpdatedAt = "2026-03-01T00:00:00.000Z";
  h.context.state = otherAccount;
  h.context.notice = "Account B screen";
  h.requests[0].resolve({ ok: false, mode: "stale-account" });
  await request;
  assert.equal(h.context.state, otherAccount);
  assert.equal(h.context.notice, "Account B screen");
});

test("repayment failure does not mint a new setting timestamp for a rejected edit", async () => {
  const h = harness();
  const request = h.context.setEventRepaymentMode("settings", "direct");
  h.context.state.events[0].notes.push({ id: "incoming-note" });
  h.requests[0].resolve({ ok: false });
  await request;
  const event = h.context.state.events[0];
  assert.equal(event.directSettlementTransfers, false);
  assert.equal(event.settingsUpdatedAt, baseTime);
  assert.equal(event.settingsFieldUpdatedAt?.directSettlementTransfers ?? event.settingsUpdatedAt, baseTime);
  assert.equal(event.notes[0].id, "incoming-note");
  const remote = initialState();
  remote.events[0].directSettlementTransfers = true;
  remote.events[0].settingsUpdatedAt = "2026-02-01T00:00:00.000Z";
  assert.equal(mergeSharedStates(remote, h.context.state).events[0].directSettlementTransfers, true,
    "the rejected local edit cannot outrank another device's committed change");
});

test("a newer unrelated save prevents a late repayment failure from undoing its snapshot", async () => {
  const h = harness();
  const request = h.context.setEventRepaymentMode("settings", "direct");
  h.context.revision += 1;
  h.context.state.events[0].notes.push({ id: "newer-note" });
  h.context.notice = "Newer save";
  const newer = h.context.state;
  h.requests[0].resolve({ ok: false });
  await request;
  assert.equal(h.context.state, newer);
  assert.equal(h.context.state.events[0].directSettlementTransfers, true);
  assert.equal(h.context.notice, "Newer save");
});

test("repayment rollback preserves a newer remote revision of the same field", async () => {
  const h = harness();
  const request = h.context.setEventRepaymentMode("settings", "direct");
  const current = structuredClone(h.context.state);
  current.events[0].settingsFieldUpdatedAt.directSettlementTransfers = "2099-01-01T00:00:00.000Z";
  h.context.state = current;
  h.requests[0].resolve({ ok: false });
  await request;
  assert.equal(h.context.state.events[0].directSettlementTransfers, true);
  assert.equal(h.context.state.events[0].settingsFieldUpdatedAt.directSettlementTransfers, "2099-01-01T00:00:00.000Z");
});

for (const [handler, args] of [
  ["setEventRepaymentMode", ["settings", "direct"]],
  ["setEventRoundingMode", ["settings", "exact"]],
  ["setEventManagementMode", ["settings", "centralized"]],
  ["toggleEventLock", ["settings"]],
  ["applyEventCurrencyChange", ["settings", "USD"]],
  ["updateEventCoverImage", ["settings", "new-cover"]]
]) {
  test(`${handler} does not report old-account success on a new account's screen`, async () => {
    const h = harness();
    const request = h.context[handler](...args);
    const otherAccount = initialState();
    otherAccount.currentParticipantId = "account-b";
    h.context.state = otherAccount;
    h.context.notice = "Account B screen";
    const renderCount = h.renders.length;
    h.requests[0].resolve({ ok: true });
    await request;
    assert.equal(h.context.state, otherAccount);
    assert.equal(h.context.notice, "Account B screen");
    assert.equal(h.renders.length, renderCount);
  });
}

for (const [handler, args, field] of [
  ["setEventManagementMode", ["settings", "centralized"], "adminsCanEditOnly"],
  ["toggleEventLock", ["settings"], "locked"]
]) {
  test(`${handler} paints the chosen value and saving feedback before waiting on the server`, async () => {
    const h = harness();
    const request = h.context[handler](...args);
    const pendingRender = h.renders.at(-1);
    h.requests[0].resolve({ ok: true });
    await request;
    assert.ok(pendingRender, "the control must react without waiting for network completion");
    assert.equal(pendingRender.state.events[0][field], true);
    assert.match(pendingRender.notice, /שומר/);
  });
}
