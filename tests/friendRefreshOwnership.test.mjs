import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { normalizeProfileName, isFullProfileName, normalizeProfileUpdatedAt } from "../src/domain/userProfile.mjs";
import { normalizeAvatarImage, normalizeAvatarPreset } from "../src/domain/avatarPresets.mjs";
import { resolveProfileAvatar } from "../src/domain/profileAvatarSync.mjs";
import { syncNetworkFriendContacts } from "../src/domain/friendContacts.mjs";
import { emptyFriendNetwork } from "../src/data/friendsStore.mjs";

const source = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
function extract(name, optional = false) {
  const start = new RegExp(`(?:async )?function ${name}\\(`).exec(source)?.index;
  if (start === undefined) { assert.ok(optional, name); return ""; }
  const end = /\n(?:async )?function /.exec(source.slice(start + 1))?.index;
  return source.slice(start, end === undefined ? undefined : start + 1 + end);
}
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const tick = () => new Promise(resolve => setImmediate(resolve));
const plain = value => JSON.parse(JSON.stringify(value));
const TIME = "2026-09-07T10:00:00.000Z";
const profile = id => ({ user_id: id, display_name: `User ${id}`, username: `user_${id}`, avatar_preset: "avatar-1", updated_at: TIME });
const network = (id = "a", friend = "friend-a") => ({ status: "ready", userId: id, friendCode: "code", blockedUsers: [],
  profiles: [profile(id), profile(friend)], friendships: [{ id: `relation-${friend}`, requester_id: id, addressee_id: friend, status: "accepted" }] });
const config = id => ({ storage: { mode: "supabase", account: { userId: id } } });
function harness() {
  const reads = [], writes = [], patches = [], renders = [], frames = [], logs = [];
  const ctx = vm.createContext({
    state: { currentParticipantId: "account-a", participants: [{ id: "account-a", displayName: "User a", avatarPreset: "avatar-1", profileUpdatedAt: TIME }], friendContacts: [], events: [], groups: [] },
    localProfile: { participantId: "account-a", displayName: "User a", avatarPreset: "avatar-1", profileUpdatedAt: TIME },
    session: { user: { id: "a" } }, generation: 0, runtimeConfig: config("a"), friendNetwork: network(),
    friendNetworkRefreshRevision: 0, friendNetworkPollScope: "", friendNetworkPollRequest: null, friendNetworkBusyAction: "", friendNetworkActionRequest: null,
    screen: { name: "groups", tab: "people" }, eventDialog: null, profileUsernameDraft: "user_a", appBootHydrated: true, notice: "Initial notice",
    window: { localStorage: {} }, document: { visibilityState: "visible", activeElement: null }, app: { querySelector: () => null },
    loadStoredAccountSession: () => ctx.session, versionedReadCacheSessionGeneration: () => ctx.generation,
    normalizeProfileName, isFullProfileName, normalizeProfileUpdatedAt, normalizeAvatarImage, normalizeAvatarPreset, resolveProfileAvatar,
    syncNetworkFriendContacts, emptyFriendNetwork, OWN_PROFILE_STARTUP_WAIT_MS: 100,
    loadRuntimeConfig: async () => ctx.runtimeConfig,
    friendNetworkAvailable: cfg => Boolean(cfg?.storage?.account?.userId),
    loadFriendNetwork: cfg => { const gate = deferred(); reads.push({ config: cfg, ...gate }); return gate.promise; },
    loadOwnFriendProfile: cfg => { const gate = deferred(); reads.push({ config: cfg, ...gate }); return gate.promise; },
    syncFriendProfile: async (cfg, data) => { patches.push({ config: cfg, data: plain(data) }); return profile(cfg.storage.account.userId); },
    saveSharedState: async state => { writes.push(plain(state)); return { ok: true }; },
    persistLocalProfile: data => { ctx.localProfile = data; }, syncLocalProfile: state => ({ ...state, localProfileName: ctx.localProfile.displayName }),
    currentFriendUsername: () => ctx.friendNetwork.profiles?.find(p => p.user_id === ctx.friendNetwork.userId)?.username ?? "",
    publicProfileUsername: p => p.username, render: () => renders.push(true), requestAnimationFrame: callback => frames.push(callback),
    publishNotificationNavigationState: () => { ctx.published++; }, published: 0,
    emitOperationDeferred: () => logs.push(true), console: { warn: () => logs.push(true) }, CSS: { escape: value => value }
  });
  for (const name of ["captureFriendAccountContext", "resetObsoleteFriendNetworkAction"]) vm.runInContext(extract(name, true), ctx);
  for (const name of ["friendNetworkRenderKey", "applyFriendNetworkToState", "refreshFriendNetwork", "hydrateOwnPublicAvatarBeforeFirstRender", "requestVisibleFriendNetworkSync"])
    vm.runInContext(extract(name), ctx);
  return { ctx, reads, writes, patches, renders, frames, logs,
    switchAccount() {
      ctx.session = { user: { id: "b" } }; ctx.generation++;
      ctx.state = { ...ctx.state, currentParticipantId: "account-b", participants: [{ id: "account-b", displayName: "User b", profileUpdatedAt: TIME }] };
      ctx.localProfile = { participantId: "account-b", displayName: "User b", profileUpdatedAt: TIME };
      ctx.runtimeConfig = config("b"); ctx.friendNetwork = network("b", "friend-b"); ctx.notice = "Account B notice";
    }
  };
}

for (const outcome of ["success", "failure"]) {
  test(`late friend roster ${outcome} cannot alter the next account`, async () => {
    const h = harness(); const request = h.ctx.refreshFriendNetwork({ preserveNotice: true }); await tick(); h.switchAccount();
    const expected = plain({ state: h.ctx.state, localProfile: h.ctx.localProfile, network: h.ctx.friendNetwork });
    outcome === "success" ? h.reads[0].resolve(network()) : h.reads[0].reject(new Error("Offline")); await request;
    assert.deepEqual(plain({ state: h.ctx.state, localProfile: h.ctx.localProfile, network: h.ctx.friendNetwork }), expected);
    assert.equal(h.ctx.notice, "Account B notice"); assert.equal(h.writes.length, 0); assert.equal(h.renders.length, 0);
  });
}

test("obsolete config cannot replace the active account config or issue a roster read", async () => {
  const h = harness(); const gate = deferred(); h.ctx.loadRuntimeConfig = () => gate.promise;
  const request = h.ctx.refreshFriendNetwork(); h.switchAccount(); gate.resolve(config("a")); await tick();
  h.reads.forEach(read => read.resolve(network())); await request;
  assert.equal(h.reads.length, 0); assert.equal(h.ctx.runtimeConfig.storage.account.userId, "b");
});

test("same-account re-login invalidates a prior roster response", async () => {
  const h = harness(); const request = h.ctx.refreshFriendNetwork(); await tick(); h.ctx.generation++;
  h.reads[0].resolve(network()); await request; assert.equal(h.writes.length, 0);
});

test("an account transition with an old participant does not read friends", async () => {
  const h = harness(); h.ctx.session = { user: { id: "b" } }; h.ctx.runtimeConfig = config("b");
  const request = h.ctx.refreshFriendNetwork(); await tick(); h.reads.forEach(read => read.resolve(network("b"))); await request;
  assert.equal(h.reads.length, 0);
});

for (const outcome of ["success", "failure"]) {
  test(`older roster ${outcome} cannot supersede a more recent refresh`, async () => {
    const h = harness(); const first = h.ctx.refreshFriendNetwork(); await tick(); const second = h.ctx.refreshFriendNetwork(); await tick();
    h.reads[1].resolve(network("a", "new-friend")); await second;
    const expected = plain(h.ctx.friendNetwork);
    outcome === "success" ? h.reads[0].resolve(network("a", "old-friend")) : h.reads[0].reject(new Error("Offline")); await first;
    assert.deepEqual(plain(h.ctx.friendNetwork), expected); assert.equal(h.writes.length, 1);
  });
}

test("refresh preserves the latest notice, not a notice captured before newer work", async () => {
  const h = harness(); const request = h.ctx.refreshFriendNetwork({ preserveNotice: true }); await tick();
  h.ctx.notice = "New save pending"; h.reads[0].resolve(network()); await request;
  assert.equal(h.ctx.notice, "New save pending");
});

test("a dismissed notice is not resurrected when refresh completes", async () => {
  const h = harness(); const request = h.ctx.refreshFriendNetwork({ preserveNotice: true }); await tick();
  h.ctx.notice = ""; h.reads[0].resolve(network()); await request; assert.equal(h.ctx.notice, "");
});

test("optional profile synchronization cannot apply the old roster after account switch", async () => {
  const h = harness(); const gate = deferred(); h.ctx.syncFriendProfile = () => gate.promise;
  h.ctx.localProfile.displayName = "Newer Name"; h.ctx.localProfile.profileUpdatedAt = "2026-09-07T11:00:00.000Z";
  const request = h.ctx.refreshFriendNetwork(); await tick(); h.reads[0].resolve(network()); await tick(); h.switchAccount();
  gate.resolve(profile("a")); await request;
  assert.equal(h.ctx.friendNetwork.userId, "b"); assert.equal(h.writes.length, 0); assert.equal(h.ctx.notice, "Account B notice");
});

test("a cache save finishing after account switch cannot publish or render the old refresh", async () => {
  const h = harness(); const gate = deferred(); h.ctx.saveSharedState = () => gate.promise;
  const request = h.ctx.refreshFriendNetwork({ preserveNotice: true }); await tick(); h.reads[0].resolve(network()); await tick(); h.switchAccount();
  gate.resolve({ ok: true }); await request;
  assert.equal(h.ctx.published, 0); assert.equal(h.ctx.notice, "Account B notice"); assert.equal(h.renders.length, 0);
});

test("startup avatar read cannot write an old image into the next account", async () => {
  const h = harness(); const request = h.ctx.hydrateOwnPublicAvatarBeforeFirstRender(); h.switchAccount();
  h.reads[0].resolve({ ...profile("a"), avatar_image: "https://lh3.googleusercontent.com/old.jpg", avatar_image_updated_at: TIME }); await request;
  assert.equal(h.ctx.localProfile.participantId, "account-b"); assert.equal(h.ctx.localProfile.avatarImage, undefined);
});

test("a valid current roster still merges friends and persists the cache", async () => {
  const h = harness(); const request = h.ctx.refreshFriendNetwork(); await tick(); h.reads[0].resolve(network()); await request;
  assert.equal(h.ctx.state.participants.some(p => p.id === "account-friend-a"), true); assert.equal(h.writes.length, 1);
});

test("a current network failure retains cached friends and marks them stale", async () => {
  const h = harness(); const request = h.ctx.refreshFriendNetwork(); await tick(); h.reads[0].reject(new Error("Offline")); await request;
  assert.equal(h.ctx.friendNetwork.stale, true); assert.equal(h.ctx.friendNetwork.friendships.length, 1);
});

test("a new account poll starts without waiting for the previous account's poll", async () => {
  const h = harness(); const first = h.ctx.requestVisibleFriendNetworkSync(); await tick(); h.switchAccount();
  const second = h.ctx.requestVisibleFriendNetworkSync(); await tick(); const count = h.reads.length;
  const secondSlot = h.ctx.friendNetworkPollRequest; h.reads[0].resolve(network()); await first;
  const slotAfterFirst = h.ctx.friendNetworkPollRequest; h.reads[1]?.resolve(network("b")); await second;
  assert.equal(count, 2); assert.equal(slotAfterFirst, secondSlot);
});

test("polls within one account still coalesce into one read", async () => {
  const h = harness(); const first = h.ctx.requestVisibleFriendNetworkSync(); const second = h.ctx.requestVisibleFriendNetworkSync(); await tick();
  assert.equal(h.reads.length, 1); h.reads[0].resolve(network()); await Promise.all([first, second]);
});
