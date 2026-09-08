import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { mergeSharedEventIntoState } from "../src/data/sharedEventStore.mjs";
import { ensureNamedParticipant } from "../src/domain/userProfile.mjs";
import { rememberPendingEventJoin, forgetPendingEventJoin, loadPendingEventJoins } from "../src/data/pendingEventJoins.mjs";

const source = readFileSync(new URL("../src/publicJoinEventLayer.mjs", import.meta.url), "utf8");
const flow = source.slice(source.indexOf("async function joinExistingEventFromPublicPanel()"), source.indexOf("function parseEventId(value)"));
const owner = "00000000-0000-4000-8000-000000000072";
const participantId = `account-${owner}`, eventId = "public-session-join";

function harness({ restartAt, readFails = false } = {}) {
  let generation = 0;
  const input = { value: "https://example.invalid/i/public-session-join/t/synthetic-invite" }, error = {};
  const button = { disabled: false, isConnected: true, setAttribute() {}, removeAttribute() {} };
  const current = { currentParticipantId: participantId, groups: [], participants: [{ id: participantId, kind: "user", displayName: "Member" }], events: [] };
  const remote = { ...structuredClone(current), events: [{ id: eventId, name: "Invited trip", participantIds: [participantId], adminIds: [participantId], expenses: [], transfers: [] }] };
  const config = { storage: { mode: "supabase", account: { userId: owner } } };
  const writes = [], cloudWrites = [], messages = [], wakeUps = [];
  const values = new Map();
  const storage = {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const restart = phase => { if (restartAt === phase) generation++; };
  const ctx = vm.createContext({ publicJoinBusy: false,
    document: { querySelectorAll: () => [button], querySelector: selector => selector.includes("-link") ? input : error,
      dispatchEvent: event=>wakeUps.push(event.type) }, Event,
    window: { localStorage: storage, location: { href: "https://example.invalid/" } },
    rememberPendingEventJoin: entry=>rememberPendingEventJoin(entry,storage),
    forgetPendingEventJoin: entry=>forgetPendingEventJoin(entry,storage),
    versionedReadCacheSessionGeneration: () => generation,
    loadStoredAccountSession: () => ({ user: { id: owner } }),
    parseEventId: () => eventId, setJoinError: (_error, message) => { if(message) messages.push(message); },
    loadRuntimeConfig: async () => { restart("config"); return config; },
    resolveEventInviteCredentials: async () => { restart("redeem"); return { id: "public-session-space", key: "public_session_synthetic_key_0001" }; },
    readSharedEventState: async () => { restart("read"); if(readFails) throw new Error("offline"); return remote; },
    mergeSharedEventIntoState, ensureNamedParticipant, loadState: () => structuredClone(current),
    saveState: state => writes.push(structuredClone(state)), findEvent: (state,id) => state.events.find(event=>event.id===id),
    loadLocalProfile: () => ({ participantId, displayName: "Member" }),
    saveSharedState: async (state, options) => {
      assert.deepEqual(Array.from(options.forceSharedEventIds), [eventId]);
      cloudWrites.push(structuredClone(state)); restart("save"); return {ok:true};
    },
    buildEventInviteUrl: () => "https://example.invalid/i/public-session-join"
  });
  vm.runInContext(flow,ctx);
  return { ctx, writes, cloudWrites, messages, wakeUps, pending:()=>loadPendingEventJoins(storage,owner), run: () => ctx.joinExistingEventFromPublicPanel() };
}

test("public invite joining persists the verified event and navigates in its original session", async () => {
  const h = harness(); await h.run();
  assert.equal(h.cloudWrites.length,1);
  assert.equal(h.cloudWrites[0].events[0].id,eventId);
  assert.equal(h.ctx.window.location.href,"https://example.invalid/i/public-session-join");
  assert.deepEqual(h.messages,[]);
  assert.deepEqual(h.pending(),[]);
});

for (const restartAt of ["config","redeem","read"]) {
  test(`public invite joining cannot write after same-account reauthentication during ${restartAt}`, async () => {
    const h=harness({restartAt}); await h.run();
    assert.equal(h.writes.length,0); assert.equal(h.cloudWrites.length,0);
    assert.equal(h.ctx.window.location.href,"https://example.invalid/"); assert.deepEqual(h.messages,[]);
  });
}

test("a late public join save cannot redirect the new session", async () => {
  const h=harness({restartAt:"save"}); await h.run();
  assert.equal(h.cloudWrites.length,1);
  assert.equal(h.ctx.window.location.href,"https://example.invalid/");
});

test("a failed public invite read cannot show an old error in the new session", async () => {
  const h=harness({restartAt:"read",readFails:true}); await h.run();
  assert.equal(h.writes.length,0); assert.deepEqual(h.messages,[]);
});

test("an interrupted public invite retains its redeemed membership for automatic recovery", async () => {
  const h=harness({readFails:true}); await h.run();
  assert.equal(h.writes.length,0);
  assert.equal(h.pending().length,1);
  assert.equal(h.pending()[0].eventId,eventId);
  assert.equal(h.pending()[0].ownerUserId,owner);
});

test("an interrupted public invite wakes automatic recovery without another connectivity event",async()=>{
  const h=harness({readFails:true});await h.run();
  assert.deepEqual(h.wakeUps,['settle-friends:pending-join']);
  assert.equal(h.pending().length,1);
});
