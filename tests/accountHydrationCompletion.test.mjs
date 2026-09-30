import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const app = await readFile(new URL("../src/app.mjs", import.meta.url), "utf8");
const start = app.indexOf("function refreshStartupSharedState(");
const end = app.indexOf("function retryAccountEventHydration(", start);
assert.ok(start >= 0 && end > start);
const source = app.slice(start, end);
const brand = await readFile(new URL("../src/publicBrandLayer.mjs", import.meta.url), "utf8");
const simplifySource = brand.slice(brand.indexOf("function simplifyEmptyHome()"), brand.indexOf("function syncEmptyEventIllustration("));

for (const message of ["טוענים את האירועים שלך…", "האירועים שלך עדיין שמורים"]) {
  test(`branding preserves the account hydration message: ${message}`, () => {
    const label = { textContent: message };
    const empty = { querySelector: () => label };
    const section = {
      classList: { toggle() {} },
      querySelector: selector => selector === ".empty-state" ? empty : null,
      querySelectorAll: () => []
    };
    const screen = {
      classList: { toggle() {} },
      querySelector: selector => {
        if (selector === '[data-action="new-event"]') return {};
        if ([".home-empty-events", ".home-event-hydration"].includes(selector)) return section;
        return null;
      },
      querySelectorAll: () => []
    };
    const context = vm.createContext({
      document: { querySelector: () => screen },
      enhanceScreenHeroArtwork() {}, syncEmptyEventIllustration() {},
      setHidden() {}, setSuppressed() {},
      setTextIfChanged: (element, text) => { if (element) element.textContent = text; }
    });
    vm.runInContext(simplifySource, context);
    context.simplifyEmptyHome();
    assert.equal(label.textContent, message, "a loading/recovery gate is not a confirmed empty account");
  });
}

function harness({ events = [], status = "loading" } = {}) {
  let revision = 1;
  let resolve;
  const refresh = new Promise(done => { resolve = done; });
  const timers = [];
  const context = vm.createContext({
    appBootHydrated: true,
    state: { currentParticipantId: "account-a", events },
    accountEventsHydrationStatus: status,
    ACCOUNT_EVENT_HYDRATION_READY: "ready",
    ACCOUNT_EVENT_HYDRATION_UNAVAILABLE: "unavailable",
    sharedStateSaveRevision: () => revision,
    visibleEventsForParticipant: state => state.events,
    syncLocalProfile: state => state,
    hasSharedStateChanged: (a, b) => JSON.stringify(a) !== JSON.stringify(b),
    render: () => {},
    retryAccountEventHydration: async () => {},
    window: { setTimeout: callback => timers.push(callback) }
  });
  vm.runInContext(source, context);
  return { context, timers, resolve, refresh, edit: () => { revision += 1; } };
}

test("a cloud response invalidated by a newer save cannot confirm an empty account", async () => {
  const h = harness();
  const completion = h.context.refreshStartupSharedState(h.refresh);
  h.edit();
  h.resolve({ authoritative: true, state: { currentParticipantId: "account-a", events: [{ id: "cloud-event" }] } });
  await completion;
  assert.notEqual(h.context.accountEventsHydrationStatus, "ready");
  assert.equal(h.context.state.events.length, 0, "the rejected response cannot replace newer local state");
  assert.equal(h.timers.length, 1, "schedule a fresh read after the current completion settles");
});

test("a late cloud response never overwrites an event edited during hydration", async () => {
  const h = harness({ events: [{ id: "edited-event", name: "new name" }], status: "ready" });
  const completion = h.context.refreshStartupSharedState(h.refresh);
  h.edit();
  h.resolve({ authoritative: true, state: { currentParticipantId: "account-a", events: [{ id: "edited-event", name: "old name" }] } });
  await completion;
  assert.equal(h.context.state.events[0].name, "new name");
  assert.equal(h.timers.length, 0, "visible local events do not need the empty-account recovery path");
});

test("a current cloud response can finish hydration for a genuinely empty account", async () => {
  const h = harness();
  const completion = h.context.refreshStartupSharedState(h.refresh);
  h.resolve({ authoritative: true, state: { currentParticipantId: "account-a", events: [] } });
  await completion;
  assert.equal(h.context.accountEventsHydrationStatus, "ready");
  assert.equal(h.timers.length, 0);
});
