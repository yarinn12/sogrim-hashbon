import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { ensureNamedParticipant, normalizeProfileName, normalizeProfileUpdatedAt, isFullProfileName } from "../src/domain/userProfile.mjs";

const source = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
function functionSource(name, optional = false) {
  const start = new RegExp(`(?:async )?function ${name}\\(`).exec(source)?.index;
  if (start === undefined) { assert.ok(optional, name); return ""; }
  const rest = source.slice(start + 1);
  const end = /\n(?:async )?function /.exec(rest)?.index;
  return source.slice(start, end === undefined ? undefined : start + 1 + end);
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { resolve, reject, promise };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const VERSION = "2026-09-07T10:00:00.000Z";
function harness() {
  const writes = [], accountWrites = [], usernameWrites = [], renders = [], frames = [], markers = new Map();
  let now = Date.parse(VERSION);
  const ctx = vm.createContext({
    state: { currentParticipantId: "account-a", participants: [{ id: "account-a", displayName: "Original Name", kind: "user", profileUpdatedAt: VERSION }],
      events: [{ id: "event-a", participantIds: ["account-a"], sharedSpaceId: "space-a", sharedSpaceKey: "key-a" }], groups: [], friendContacts: [] },
    localProfile: { participantId: "account-a", displayName: "Original Name", authSubject: "a", authProvider: "google", email: "a@example.invalid" },
    session: { user: { id: "a" } }, sessionGeneration: 0,
    profileNameDraft: "Saved Name", profileUsernameDraft: "original", profileAvatarDraft: "avatar-1", profileAvatarImageDraft: "image-a",
    profileAvatarPendingPreview: "", profileAvatarRequest: null, profileAvatarRevision: 0,
    profileError: "", profileUsernameError: "", profileNameEditing: true, profileUsernameEditing: true,
    friendNetwork: { status: "ready" }, friendCodeDraft: "", screen: { name: "profile" }, notice: "", appHistoryDepth: 2, lastNavigationViewKey: "before",
    runtimeConfig: { storage: { account: { userId: "a" } } },
    loadRuntimeConfig: async () => ctx.runtimeConfig,
    loadStoredAccountSession: () => ctx.session, versionedReadCacheSessionGeneration: () => ctx.sessionGeneration,
    normalizeProfileName, normalizeProfileUpdatedAt, isFullProfileName, ensureNamedParticipant, normalizeUsername: value => String(value ?? "").trim(),
    normalizeAvatarImage: value => String(value ?? ""), normalizeAvatarPreset: value => value,
    AVATAR_PRESETS: [{ id: "avatar-1" }], currentFriendUsername: () => "original", usernameValidationMessage: () => "Invalid username",
    profileUsernameErrorMessage: () => "Old username error", parseInviteEventId: () => null, makeId: () => "guest-a", getEvent: () => null,
    participantName: () => "Saved Name", refreshFriendNetwork: async () => { ctx.refreshes++; }, refreshes: 0,
    persistLocalProfile: profile => { ctx.localProfile = { ...profile }; },
    saveSharedState: (state, options) => { const gate = deferred(); writes.push({ state: structuredClone(state), options, ...gate }); return gate.promise; },
    SogrimAccountProfile: { updateProfile: payload => { accountWrites.push(payload); return Promise.resolve(true); } },
    setFriendUsername: (config, username) => { usernameWrites.push({ config, username }); return Promise.resolve(true); },
    loadOwnFriendProfile: async config => ({ user_id: config.storage.account.userId, updated_at: VERSION }),
    friendNetworkAvailable: () => false, syncFriendProfile: async () => true,
    requestImageCrop: async () => "canvas", compressProfileAvatarImage: () => "cropped-image",
    PROFILE_SHARED_PUBLICATION_STORAGE_KEY_PREFIX: "published-",
    window: { localStorage: { getItem: key => markers.get(key) ?? null, setItem: (key, value) => markers.set(key, value) },
      location: { href: "http://localhost/" }, requestAnimationFrame: callback => frames.push(callback) },
    app: { querySelector: () => null }, document: { querySelector: () => null },
    requestAnimationFrame: callback => frames.push(callback), render: () => renders.push(ctx.screen), console: { warn() {} },
    canRestoreActionFocus: () => false, dialogReturnContext: () => JSON.stringify([ctx.state.currentParticipantId, ctx.screen]),
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [++now])); } }
  });
  for (const name of ["profileSaveOwnerScope", "focusProfileIdentityInput", "finishProfileAvatarSave", "freshProfileEditTimestamp"])
    vm.runInContext(functionSource(name, true), ctx);
  for (const name of ["saveProfileAvatarImage", "persistProfileAvatarDraft", "publishCurrentProfileToSharedEventsOnce", "rememberPublishedSharedProfile", "saveProfileFromDraft"])
    vm.runInContext(functionSource(name), ctx);
  return { ctx, writes, accountWrites, usernameWrites, renders, frames, markers,
    switchAccount() {
      ctx.session = { user: { id: "b" } }; ctx.sessionGeneration++;
      ctx.state = { ...ctx.state, currentParticipantId: "account-b", participants: [{ id: "account-b", displayName: "Other User", profileUpdatedAt: VERSION }] };
      ctx.localProfile = { participantId: "account-b", displayName: "Other User", authSubject: "b" };
      ctx.profileNameDraft = "Other User"; ctx.notice = "Account B notice";
    }
  };
}

test("profile publication cannot mark a newer unsent version as synchronized", async () => {
  const h = harness(); const request = h.ctx.publishCurrentProfileToSharedEventsOnce();
  h.ctx.state.participants[0].profileUpdatedAt = "2026-09-07T11:00:00.000Z";
  h.writes[0].resolve({ ok: true }); await request;
  assert.equal(h.markers.has("published-account-a"), false);
});

test("an old publication finishing last cannot roll back the newer publication marker", async () => {
  const h = harness(); const first = h.ctx.publishCurrentProfileToSharedEventsOnce();
  h.ctx.state.participants[0].profileUpdatedAt = "2026-09-07T11:00:00.000Z";
  const second = h.ctx.publishCurrentProfileToSharedEventsOnce();
  h.writes[1].resolve({ ok: true }); await second;
  h.writes[0].resolve({ ok: true }); await first;
  assert.equal(h.markers.get("published-account-a"), "2026-09-07T11:00:00.000Z");
});

test("pending publication is not acknowledged and remains retryable", async () => {
  const h = harness(); const request = h.ctx.publishCurrentProfileToSharedEventsOnce();
  h.writes[0].resolve({ ok: true, pending: true });
  assert.equal(await request, false); assert.equal(h.markers.size, 0);
});

test("optional publication marker storage failure cannot turn a successful write into a failure", async () => {
  const h = harness(); h.ctx.window.localStorage.setItem = () => { throw new Error("Storage denied"); };
  const request = h.ctx.publishCurrentProfileToSharedEventsOnce(); h.writes[0].resolve({ ok: true });
  assert.equal(await request, true);
});

test("publication marker read failure does not prevent synchronizing the profile", async () => {
  const h = harness(); h.ctx.window.localStorage.getItem = () => { throw new Error("Storage denied"); };
  const request = h.ctx.publishCurrentProfileToSharedEventsOnce();
  request.catch(() => {}); await tick();
  h.writes[0]?.resolve({ ok: true }); assert.equal(await request, true);
});

test("avatar completion cannot acknowledge another account or replace its notice", async () => {
  const h = harness(); const request = h.ctx.persistProfileAvatarDraft(); h.switchAccount();
  h.writes[0].resolve({ ok: true }); await request;
  assert.equal(h.ctx.notice, "Account B notice"); assert.equal(h.markers.size, 0);
});

test("old avatar success cannot replace a newer pending-sync notice or acknowledge its version", async () => {
  const h = harness(); const first = h.ctx.persistProfileAvatarDraft();
  h.ctx.profileAvatarImageDraft = "image-b"; const second = h.ctx.persistProfileAvatarDraft();
  h.writes[1].resolve({ ok: true, pending: true }); await second;
  const notice = h.ctx.notice;
  h.writes[0].resolve({ ok: true }); await first;
  assert.equal(h.ctx.notice, notice); assert.equal(h.markers.size, 0);
  assert.equal(h.ctx.localProfile.avatarImage, "image-b");
});

test("avatar completion does not change the notice after navigation", async () => {
  const h = harness(); const request = h.ctx.persistProfileAvatarDraft();
  h.ctx.screen = { name: "home" }; h.ctx.notice = "New screen notice";
  h.writes[0].resolve({ ok: true }); await request;
  assert.equal(h.ctx.notice, "New screen notice");
});

for (const outcome of ["success", "failure"]) {
  test(`an image crop ${outcome} from the old account cannot touch the new account`, async () => {
    const h = harness(); const crop = deferred(); h.ctx.requestImageCrop = () => crop.promise;
    const request = h.ctx.saveProfileAvatarImage({ type: "image/jpeg" }); h.switchAccount();
    h.ctx.profileError = "New account error";
    outcome === "success" ? crop.resolve("canvas") : crop.reject(new Error("Invalid image"));
    await tick(); h.writes.forEach(write => write.resolve({ ok: true })); await request;
    assert.equal(h.writes.length, 0); assert.equal(h.ctx.profileError, "New account error");
    assert.equal(h.ctx.profileAvatarImageDraft, "image-a"); assert.equal(h.frames.length, 0);
  });
}

test("an older image crop cannot undo a newer avatar selection", async () => {
  const h = harness(); const crop = deferred(); h.ctx.requestImageCrop = () => crop.promise;
  const request = h.ctx.saveProfileAvatarImage({ type: "image/jpeg" });
  h.ctx.profileAvatarImageDraft = "new-selection"; const newer = h.ctx.persistProfileAvatarDraft();
  h.writes[0].resolve({ ok: true }); await newer;
  crop.resolve("canvas"); await tick(); h.writes.slice(1).forEach(write => write.resolve({ ok: true })); await request;
  assert.equal(h.ctx.localProfile.avatarImage, "new-selection"); assert.equal(h.writes.length, 1);
});

test("username config from a different account cannot initiate a write", async () => {
  const h = harness(); const config = deferred(); h.ctx.loadRuntimeConfig = () => config.promise;
  h.ctx.profileUsernameDraft = "newname"; const request = h.ctx.saveProfileFromDraft();
  h.switchAccount(); config.resolve({ storage: { account: { userId: "b" } } });
  await tick(); h.writes.forEach(write => write.resolve({ ok: true })); await request;
  assert.equal(h.usernameWrites.length, 0); assert.equal(h.accountWrites.length, 0);
  assert.equal(h.ctx.localProfile.displayName, "Other User");
});

for (const outcome of ["success", "failure"]) {
  test(`old username ${outcome} cannot replace a newer profile draft`, async () => {
    const h = harness(); const username = deferred(); h.ctx.setFriendUsername = () => username.promise;
    h.ctx.profileUsernameDraft = "submitted"; const request = h.ctx.saveProfileFromDraft(); await tick();
    h.ctx.profileUsernameDraft = "newdraft"; h.ctx.profileNameDraft = "Newer Draft"; h.ctx.profileUsernameError = "New error";
    outcome === "success" ? username.resolve(true) : username.reject(new Error("Taken"));
    await tick(); h.writes.forEach(write => write.resolve({ ok: true })); await request;
    assert.equal(h.ctx.profileUsernameDraft, "newdraft"); assert.equal(h.ctx.profileNameDraft, "Newer Draft");
    assert.equal(h.ctx.profileUsernameError, "New error"); assert.equal(h.ctx.screen.name, "profile");
  });
}

test("profile account-save completion cannot save the next account's state", async () => {
  const h = harness(); const account = deferred(); h.ctx.SogrimAccountProfile.updateProfile = () => account.promise;
  const request = h.ctx.saveProfileFromDraft(); h.switchAccount(); account.resolve(false);
  await tick(); h.writes.forEach(write => write.resolve({ ok: true })); await request;
  assert.ok(h.writes.every(write => write.state.currentParticipantId === "account-a"));
  assert.equal(h.ctx.notice, "Account B notice"); assert.equal(h.ctx.refreshes, 0);
});

test("a slow profile save cannot delay starting the shared-state save", async () => {
  const h = harness(); const account = deferred(); h.ctx.SogrimAccountProfile.updateProfile = () => account.promise;
  const request = h.ctx.saveProfileFromDraft(); await tick();
  const started = h.writes.length;
  account.resolve(true); await tick(); h.writes.forEach(write => write.resolve({ ok: true })); await request;
  assert.equal(started, 1);
});

test("a normal profile save preserves account identity and completes navigation", async () => {
  const h = harness(); const request = h.ctx.saveProfileFromDraft(); await tick();
  h.writes[0].resolve({ ok: true }); await request;
  assert.equal(h.ctx.localProfile.authSubject, "a"); assert.equal(h.ctx.localProfile.displayName, "Saved Name");
  assert.equal(h.ctx.screen.name, "home"); assert.equal(h.ctx.appHistoryDepth, 0);
});

test("the latest image crop still persists normally", async () => {
  const h = harness(); const request = h.ctx.saveProfileAvatarImage({ type: "image/jpeg" }); await tick();
  h.writes[0].resolve({ ok: true }); await request;
  assert.equal(h.ctx.localProfile.avatarImage, "cropped-image");
  assert.equal(h.ctx.notice, "תמונת הפרופיל נשמרה."); assert.equal(h.ctx.profileAvatarRequest, null);
});

test("cancelling an image crop leaves the stored avatar unchanged", async () => {
  const h = harness(); h.ctx.requestImageCrop = async () => null;
  await h.ctx.saveProfileAvatarImage({ type: "image/jpeg" });
  assert.equal(h.writes.length, 0); assert.equal(h.ctx.profileAvatarRequest, null);
});

test("a new crop invalidates an older crop even when they finish out of order", async () => {
  const h = harness(); const crops = [deferred(), deferred()]; let index = 0;
  h.ctx.requestImageCrop = () => crops[index++].promise;
  h.ctx.compressProfileAvatarImage = canvas => canvas;
  const old = h.ctx.saveProfileAvatarImage({ type: "image/jpeg" });
  const fresh = h.ctx.saveProfileAvatarImage({ type: "image/jpeg" });
  crops[1].resolve("new-image"); await tick(); h.writes[0].resolve({ ok: true }); await fresh;
  crops[0].resolve("old-image"); await old;
  assert.equal(h.ctx.localProfile.avatarImage, "new-image"); assert.equal(h.writes.length, 1);
});

test("a same-account logout and login invalidates the previous session's avatar completion", async () => {
  const h = harness(); const request = h.ctx.persistProfileAvatarDraft();
  h.ctx.sessionGeneration++; h.ctx.notice = "New session";
  h.writes[0].resolve({ ok: true }); await request;
  assert.equal(h.ctx.notice, "New session"); assert.equal(h.markers.size, 0);
});

test("a failed shared profile write reports pending sync without throwing away the local profile", async () => {
  const h = harness(); const request = h.ctx.saveProfileFromDraft(); await tick();
  h.writes[0].reject(new Error("Temporary outage")); await request;
  assert.match(h.ctx.notice, /השלמת הסנכרון/); assert.equal(h.ctx.localProfile.displayName, "Saved Name");
});

test("late profile failure cannot replace a new screen's notice", async () => {
  const h = harness(); const request = h.ctx.saveProfileFromDraft();
  h.ctx.screen = { name: "groups" }; h.ctx.notice = "Group notice";
  h.writes[0].resolve({ ok: false }); await request;
  assert.equal(h.ctx.notice, "Group notice"); assert.equal(h.ctx.appHistoryDepth, 2);
});

for (const action of ["persistProfileAvatarDraft", "saveProfileFromDraft"]) {
  test(`a fresh ${action} advances past every known own-profile clock`, async () => {
    const h = harness();
    h.ctx.state.participants[0].profileUpdatedAt = "2026-09-07T12:00:00.000Z";
    h.ctx.state.participants[0].avatarImageUpdatedAt = "2026-09-07T13:00:00.000Z";
    h.ctx.localProfile.profileUpdatedAt = "2026-09-07T14:00:00.000Z";
    h.ctx.friendNetwork.profiles = [
      { user_id: "a", updated_at: "2026-09-07T15:00:00.000Z", avatar_image_updated_at: "2026-09-07T16:00:00.000Z" },
      { user_id: "b", updated_at: "2099-01-01T00:00:00.000Z" }
    ];
    const request = h.ctx[action](); await tick();
    h.writes[0].resolve({ ok: true }); await request;
    assert.equal(h.ctx.localProfile.profileUpdatedAt, "2026-09-07T16:00:00.001Z");
    assert.equal(h.ctx.localProfile.avatarImageUpdatedAt, h.ctx.localProfile.profileUpdatedAt);
  });
}

test("successive fresh avatar edits remain ordered behind a faster device clock", async () => {
  const h = harness(); h.ctx.localProfile.avatarImageUpdatedAt = "2026-09-07T16:00:00.000Z";
  const first = h.ctx.persistProfileAvatarDraft();
  const firstVersion = h.ctx.localProfile.profileUpdatedAt;
  h.ctx.profileAvatarImageDraft = "new-image";
  const second = h.ctx.persistProfileAvatarDraft();
  const secondVersion = h.ctx.localProfile.profileUpdatedAt;
  h.writes[1].resolve({ ok: true }); await second;
  h.writes[0].resolve({ ok: true }); await first;
  assert.equal(firstVersion, "2026-09-07T16:00:00.001Z");
  assert.equal(secondVersion, "2026-09-07T16:00:00.002Z");
  assert.equal(h.writes[0].state.participants[0].profileUpdatedAt, firstVersion,
    "a queued old intent must not be re-stamped as a fresh edit");
});

for (const canonical of [null, { display_name: "Original Name", avatar_preset: "avatar-1", avatar_image: "old-image" }]) {
  test(`an avatar PATCH returning ${canonical ? "unchanged content" : "no row"} is not confirmed as synchronized`, async () => {
    const h = harness(); h.ctx.friendNetworkAvailable = () => true;
    h.ctx.syncFriendProfile = async () => canonical;
    const request = h.ctx.persistProfileAvatarDraft();
    h.writes[0].resolve({ ok: true });
    assert.equal(await request, false);
    assert.match(h.ctx.notice, /השלמת הסנכרון/);
    assert.equal(h.ctx.localProfile.avatarImage, "image-a");
  });
}

for (const avatarImage of ["image-a", ""]) {
  test(`an acknowledged avatar ${avatarImage ? "save" : "removal"} remains successful`, async () => {
    const h = harness(); h.ctx.profileAvatarImageDraft = avatarImage;
    h.ctx.friendNetworkAvailable = () => true;
    h.ctx.syncFriendProfile = async (_config, profile) => ({
      display_name: profile.displayName, avatar_preset: profile.avatarPreset,
      avatar_image: profile.avatarImage || null
    });
    const request = h.ctx.persistProfileAvatarDraft(); h.writes[0].resolve({ ok: true });
    assert.equal(await request, true);
    assert.equal(h.ctx.notice, "תמונת הפרופיל נשמרה.");
  });
}

test("changing username observes the server clock before stamping the new profile intent", async () => {
  const h = harness(); h.ctx.profileUsernameDraft = "newname";
  const reads = [];
  h.ctx.loadOwnFriendProfile = async config => {
    reads.push(config.storage.account.userId);
    assert.equal(h.usernameWrites.length, 1);
    return { user_id: "a", updated_at: "2026-09-07T16:00:00.123456Z" };
  };
  const request = h.ctx.saveProfileFromDraft(); await tick();
  h.writes[0].resolve({ ok: true }); await request;
  assert.deepEqual(reads, ["a"]);
  assert.equal(h.ctx.localProfile.profileUpdatedAt, "2026-09-07T16:00:00.124Z");
  assert.equal(h.ctx.localProfile.displayName, "Saved Name");
});

for (const outcome of ["account-changed", "draft-changed", "missing-row", "wrong-owner", "read-failed"]) {
  test(`post-username profile observation preserves the draft boundary: ${outcome}`, async () => {
    const h = harness(); h.ctx.profileUsernameDraft = "newname";
    const observation = deferred(); h.ctx.loadOwnFriendProfile = () => observation.promise;
    const request = h.ctx.saveProfileFromDraft(); await tick();
    if (outcome === "account-changed") h.switchAccount();
    if (outcome === "draft-changed") h.ctx.profileNameDraft = "Newer Draft";
    if (outcome === "read-failed") observation.reject(new Error("Offline"));
    else observation.resolve(outcome === "missing-row" ? null : {
      user_id: outcome === "wrong-owner" ? "b" : "a", updated_at: "2026-09-07T16:00:00.000Z"
    });
    await request;
    assert.equal(h.writes.length, 0); assert.equal(h.accountWrites.length, 0);
    if (outcome === "account-changed") assert.equal(h.ctx.notice, "Account B notice");
    else assert.equal(h.ctx.profileNameDraft, outcome === "draft-changed" ? "Newer Draft" : "Saved Name");
  });
}

test("saving without a username change never adds an own-profile network read", async () => {
  const h = harness(); let reads = 0;
  h.ctx.loadOwnFriendProfile = async () => { reads++; return null; };
  const request = h.ctx.saveProfileFromDraft(); await tick();
  h.writes[0].resolve({ ok: true }); await request;
  assert.equal(reads, 0); assert.equal(h.ctx.localProfile.displayName, "Saved Name");
});

for (const previousImage of ["", "old-image"]) {
  test(`legacy preset-only acknowledgement ${previousImage ? "does not confirm image removal" : "still succeeds"}`, async () => {
    const h = harness(); h.ctx.profileAvatarImageDraft = "";
    h.ctx.localProfile.avatarImage = previousImage;
    h.ctx.friendNetworkAvailable = () => true;
    h.ctx.syncFriendProfile = async () => ({ display_name: "Original Name", avatar_preset: "avatar-1" });
    const request = h.ctx.persistProfileAvatarDraft(); h.writes[0].resolve({ ok: true });
    assert.equal(await request, !previousImage);
  });
}

function submitHarness() {
  const calls = [];
  const ctx = vm.createContext({ profileSaveRequest: null, profileSaveRequestOwnerScope: "", ownerScope: "a", action: "save-profile",
    profileSaveOwnerScope: () => ctx.ownerScope,
    saveProfileFromDraft: () => { const gate = deferred(); calls.push(gate); return gate.promise; } });
  const start = source.indexOf('if (action === "save-profile")');
  const body = source.slice(start, source.indexOf('\n  if (action ===', start + 1));
  vm.runInContext(`async function submit() { ${body} }`, ctx);
  return { ctx, calls };
}

test("double-submit in one account issues one profile save", async () => {
  const h = submitHarness(); const first = h.ctx.submit(); const second = h.ctx.submit();
  assert.equal(h.calls.length, 1); h.calls[0].resolve(); await Promise.all([first, second]);
});

test("a slow old account cannot block or clear the next account's profile save", async () => {
  const h = submitHarness(); const first = h.ctx.submit(); h.ctx.ownerScope = "b";
  const second = h.ctx.submit(); const secondSlot = h.ctx.profileSaveRequest;
  assert.equal(h.calls.length, 2);
  h.calls[0].resolve(); await first; assert.equal(h.ctx.profileSaveRequest, secondSlot);
  h.calls[1].resolve(); await second; assert.equal(h.ctx.profileSaveRequest, null);
});

for (const action of ["profile-name", "profile-username"]) {
  for (const synced of [true, false]) {
    test(`avatar completion preserves the live ${action} editor and updates ${synced ? "success" : "pending"} feedback`, async () => {
      const h = harness(); const inserted = []; let removed = 0, lifecycle = 0;
      const editor = { dataset: { action }, value: "New draft", selectionStart: 3, selectionEnd: 5 };
      const profile = {
        contains: node => node === editor,
        querySelector: () => ({ remove: () => { removed++; } }),
        insertAdjacentHTML: (position, html) => inserted.push({ position, html })
      };
      h.ctx.document.activeElement = editor;
      h.ctx.app.querySelector = selector => selector === '[data-screen-kind="profile"]' ? profile : null;
      h.ctx.renderNotice = () => h.ctx.notice;
      h.ctx.syncNoticeLifecycleAfterRender = () => { lifecycle++; };
      h.ctx.lastCommittedScreenMarkup = "old";
      const request = h.ctx.finishProfileAvatarSave();
      h.writes[0].resolve({ ok: true, pending: !synced });
      await request;
      assert.equal(h.renders.length, 0, "do not replace the live input to update a background-save toast");
      assert.equal(h.frames.length, 0, "do not schedule stale avatar focus");
      assert.equal(h.ctx.document.activeElement, editor);
      assert.equal(editor.value, "New draft");
      assert.equal(editor.selectionStart, 3); assert.equal(editor.selectionEnd, 5);
      assert.equal(removed, 1); assert.equal(lifecycle, 1);
      assert.equal(h.ctx.lastCommittedScreenMarkup, "");
      assert.equal(inserted.length, 1);
      assert.match(inserted[0].html, synced ? /תמונת הפרופיל נשמרה/ : /השלמת הסנכרון/);
    });
  }
}

for (const situation of ["normal", "already-focused", "replaced", "different-account", "newer-focus"]) {
  test(`profile edit focus respects ${situation}`, () => {
    const h = harness(); let focused = 0;
    const target = { isConnected: true, focus() { focused++; } };
    h.ctx.app.querySelector = () => target;
    h.ctx.canRestoreActionFocus = () => situation !== "newer-focus";
    h.ctx.focusProfileIdentityInput('[data-action="profile-name"]');
    if (situation === "already-focused") h.ctx.document.activeElement = target;
    if (situation === "replaced") target.isConnected = false;
    if (situation === "different-account") h.switchAccount();
    h.frames.forEach(frame => frame());
    assert.equal(focused, situation === "normal" ? 1 : 0);
  });
}
