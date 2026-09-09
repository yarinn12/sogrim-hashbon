import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { deleteEvent } from "../src/domain/appActions.mjs";

const source = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
function section(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
}
function fixture() {
  const original = {currentParticipantId: "account-removal", events: ["a", "b", "c"].map(id => ({id, name: id})), deletedEvents: []};
  let revision = 0;
  const saves = [];
  const ctx = vm.createContext({state: original, screen: {name: "home"}, eventDialog: null, expenseDraft: null,
    importantActionDialog: null, eventStatusMenu: null, notice: "", deleteEvent, render() {},
    getEvent: id => ctx.state.events.find(event => event.id === id), canCurrentParticipantManage: event => Boolean(event),
    sharedStateSaveRevision: () => revision,
    saveSharedState(state, options) {
      revision++;
      return new Promise(resolve => saves.push({state: structuredClone(state), options, resolve}));
    }});
  vm.runInContext(section("function stateSaveCheckpoint(", "function recordEventActivity(") +
    section("async function deleteCurrentEvent(", "function beginTransferStatusRequest("), ctx);
  return {ctx, saves, original, remove: id => ctx.deleteCurrentEvent(id)};
}

test("a failed deletion restores its event without leaving the next confirmation's home screen", async () => {
  const h = fixture(), running = h.remove("a");
  const home = h.ctx.screen, nextDialog = {kind: "delete-event", payload: {eventId: "b"}};
  h.ctx.importantActionDialog = nextDialog;
  h.saves[0].resolve({ok: false, pending: false}); await running;
  assert.equal(h.ctx.screen, home, "failure must not navigate to the previous event");
  assert.equal(h.ctx.importantActionDialog, nextDialog);
  assert.deepEqual(h.ctx.state.events.map(event => event.id), ["a", "b", "c"]);
  assert.match(h.ctx.notice, /לא הצלחנו/);
});

test("a rejected event deletion does not replace later profile navigation", async () => {
  const h = fixture(), running = h.remove("a");
  const profile = {name: "profile"}; h.ctx.screen = profile;
  h.saves[0].resolve({ok: false}); await running;
  assert.equal(h.ctx.screen, profile);
  assert.ok(h.ctx.state.events.some(event => event.id === "a"));
});

test("an older successful deletion does not announce success over the next pending deletion", async () => {
  const h = fixture(), first = h.remove("a"), second = h.remove("b");
  const secondNotice = h.ctx.notice;
  h.saves[0].resolve({ok: true}); await first;
  assert.equal(h.ctx.notice, secondNotice, "feedback must still describe the latest deletion");
  assert.deepEqual(h.ctx.state.events.map(event => event.id), ["c"]);
  h.saves[1].resolve({ok: true}); await second;
  assert.match(h.ctx.notice, /"b" נמחק/);
  assert.deepEqual(h.saves[1].state.deletedEvents.map(event => event.id).sort(), ["a", "b"]);
  assert.equal(h.saves[1].options.awaitCloud, true);
});

for (const ok of [true, false]) {
  test(`late deletion ${ok ? "success" : "failure"} cannot change another account's view or notice`, async () => {
    const h = fixture(), running = h.remove("a");
    const replacement = {currentParticipantId: "account-other", events: []};
    const screen = {name: "profile"};
    h.ctx.state = replacement; h.ctx.screen = screen; h.ctx.notice = "Other account notice";
    h.saves[0].resolve({ok}); await running;
    assert.equal(h.ctx.state, replacement);
    assert.equal(h.ctx.screen, screen);
    assert.equal(h.ctx.notice, "Other account notice");
  });
}
