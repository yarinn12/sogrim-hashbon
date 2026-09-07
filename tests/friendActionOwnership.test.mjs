import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
function extract(name, optional = false) {
  const start = new RegExp(`(?:async )?function ${name}\\(`).exec(source)?.index;
  if (start === undefined) { assert.ok(optional, name); return ""; }
  const end = /\n(?:async )?function /.exec(source.slice(start + 1))?.index;
  return source.slice(start, end === undefined ? undefined : start + 1 + end);
}
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const configFor = id => ({ storage: { account: { userId: id } } });
const handlers = {
  sendFriendRequest: [], sendEventFriendRequest: ["event-a", "account-friend"], sendParticipantReport: [],
  performConnectedUserBlock: [{ targetUserId: "friend", participantId: "account-friend", eventId: "event-a" }],
  performConnectedUserUnblock: ["friend", "event-a"], performFriendshipAction: ["relationship-a", "accept"]
};
function harness(handler) {
  const rpcs = [], renders = [], refreshes = [], frames = [], navigation = [];
  const ctx = vm.createContext({
    state: { currentParticipantId: "account-a", participants: [{ id: "account-a", displayName: "User A" }, { id: "account-friend", displayName: "Friend Name" }] },
    session: { user: { id: "a" } }, generation: 0, runtimeConfig: configFor("a"),
    window: { localStorage: {}, history: { back: () => navigation.push(true) } },
    loadStoredAccountSession: () => ctx.session, versionedReadCacheSessionGeneration: () => ctx.generation,
    loadRuntimeConfig: async () => ctx.runtimeConfig,
    friendNetworkBusyAction: "", friendNetworkActionRequest: null, friendNetworkRefreshRevision: 0,
    friendCodeDraft: "@friend", screen: { name: "friend-add" }, notice: "",
    eventDialog: { kind: handler === "sendParticipantReport" ? "participant-report" : "participant-profile", eventId: "event-a", participantId: "account-friend", historyBaseDepth: 0, reportCategory: "spam", reportDetails: "Synthetic report" },
    appHistoryDepth: 0, lastNavigationViewKey: "", EVENT_SPACE_ID_FIELD: "sharedSpaceId",
    friendRequestTargetFromDraft: () => ({ type: "username", value: ctx.friendCodeDraft }),
    getEvent: () => ({ id: "event-a", sharedSpaceId: "space-a", participantIds: ["account-a", "account-friend"] }),
    accountUserIdFromParticipantId: id => String(id).replace(/^account-/, ""), isEventParticipantInactive: () => false,
    refreshFriendNetwork: async () => { refreshes.push(ctx.state.currentParticipantId); },
    friendRequestErrorMessage: () => "Old request error", reportSubmissionErrorMessage: () => "Old report error", userSafetyErrorMessage: () => "Old safety error",
    render: () => renders.push(true), renderReplacingBrowserHistory: () => renders.push(true), reactivateDialogAfterRender() {},
    rememberConfirmedEventDialog() {}, navigationViewKey: () => "key", requestAnimationFrame: callback => frames.push(callback), app: { querySelector: () => null }
  });
  for (const name of ["requestFriendshipByUsername", "requestFriendship", "requestFriendshipFromEvent", "submitUserReport", "blockConnectedUser", "unblockConnectedUser", "manageFriendship"]) {
    ctx[name] = (config, ...args) => { const gate = deferred(); rpcs.push({ config, args, ...gate }); return gate.promise; };
  }
  for (const name of ["captureFriendAccountContext", "beginFriendNetworkAction", "finishFriendNetworkAction", "loadFriendActionConfig", "resetObsoleteFriendNetworkAction"])
    vm.runInContext(extract(name, true), ctx);
  vm.runInContext(extract(handler), ctx);
  return { ctx, rpcs, renders, refreshes, navigation, run: () => ctx[handler](...handlers[handler]),
    switchAccount() {
      ctx.session = { user: { id: "b" } }; ctx.generation++;
      ctx.state = { ...ctx.state, currentParticipantId: "account-b" }; ctx.runtimeConfig = configFor("b");
      ctx.screen = { name: "home" }; ctx.eventDialog = { kind: "new-dialog", eventId: "event-b", message: "New dialog" };
      ctx.notice = "Account B notice"; ctx.friendCodeDraft = "new draft";
    }
  };
}

for (const handler of Object.keys(handlers)) {
  test(`${handler}: account switch during config loading prevents the RPC`, async () => {
    const h = harness(handler); const gate = deferred(); h.ctx.loadRuntimeConfig = () => gate.promise;
    const request = h.run(); h.switchAccount(); gate.resolve(configFor("b")); await tick();
    h.rpcs.forEach(rpc => rpc.resolve({ status: "accepted" })); await request;
    assert.equal(h.rpcs.length, 0); assert.equal(h.ctx.notice, "Account B notice");
    assert.equal(h.ctx.eventDialog.kind, "new-dialog");
  });
  for (const outcome of ["success", "failure"]) {
    test(`${handler}: late ${outcome} does not change the next account's UI or busy state`, async () => {
      const h = harness(handler); const request = h.run(); await tick(); h.switchAccount();
      h.ctx.friendNetworkBusyAction = "new-action"; h.ctx.friendNetworkActionRequest = { scope: "new-scope" };
      outcome === "success" ? h.rpcs[0].resolve({ status: "accepted" }) : h.rpcs[0].reject(new Error("Offline"));
      await request;
      assert.equal(h.ctx.notice, "Account B notice"); assert.equal(h.ctx.eventDialog.kind, "new-dialog");
      assert.equal(h.ctx.friendCodeDraft, "new draft"); assert.equal(h.ctx.friendNetworkBusyAction, "new-action");
      assert.equal(h.refreshes.length, 0); assert.equal(h.navigation.length, 0);
    });
  }
  test(`${handler}: same-account success still completes and releases the action`, async () => {
    const h = harness(handler); const request = h.run(); await tick(); assert.equal(h.rpcs.length, 1);
    h.rpcs[0].resolve({ status: "accepted" }); await request;
    assert.equal(h.ctx.friendNetworkBusyAction, "");
    assert.ok(h.ctx.notice || h.ctx.eventDialog?.message || h.refreshes.length);
  });
  test(`${handler}: missing current-account credentials produce feedback and release controls`, async () => {
    const h = harness(handler); h.ctx.loadRuntimeConfig = async () => ({ storage: {} });
    await h.run();
    assert.equal(h.rpcs.length, 0); assert.equal(h.ctx.friendNetworkBusyAction, "");
    assert.ok(h.ctx.notice || h.ctx.eventDialog?.message || h.ctx.eventDialog?.error);
    assert.ok(h.renders.length >= 1);
  });
}

test("double-submitting a friend request issues one RPC", async () => {
  const h = harness("sendFriendRequest"); const first = h.run(); const second = h.run(); await tick();
  h.rpcs.forEach(rpc => rpc.resolve({ status: "pending" })); await Promise.all([first, second]); assert.equal(h.rpcs.length, 1);
});

test("sending an old friend request does not clear a newer search draft or navigate away", async () => {
  const h = harness("sendFriendRequest"); const request = h.run(); await tick(); h.ctx.friendCodeDraft = "@new_person";
  h.rpcs[0].resolve({ status: "pending" }); await request;
  assert.equal(h.ctx.friendCodeDraft, "@new_person"); assert.equal(h.ctx.screen.name, "friend-add");
});

test("a report finishing after its dialog closes cannot reopen it or change history", async () => {
  const h = harness("sendParticipantReport"); const request = h.run(); await tick();
  h.ctx.eventDialog = null; h.ctx.appHistoryDepth = 3;
  h.rpcs[0].resolve({ ok: true }); await request;
  assert.equal(h.ctx.eventDialog, null); assert.equal(h.ctx.appHistoryDepth, 3); assert.equal(h.navigation.length, 0);
});

test("a new account can start an action while the old account's request is pending", async () => {
  const h = harness("performFriendshipAction"); const first = h.run(); await tick(); h.switchAccount();
  const second = h.run(); await tick(); const count = h.rpcs.length;
  h.rpcs.forEach(rpc => rpc.resolve({ status: "accepted" })); await Promise.all([first, second]);
  assert.equal(count, 2); assert.equal(h.ctx.notice, "בקשת החברות אושרה.");
});
