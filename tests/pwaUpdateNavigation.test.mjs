import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { hasUpdateSensitiveWork } from "../src/domain/updateSafety.mjs";

const workerSource = await readFile(new URL("../sw.js", import.meta.url), "utf8");
const bootstrapSource = await readFile(new URL("../src/pwaBootstrap.mjs", import.meta.url), "utf8");
const appSource = await readFile(new URL("../src/app.mjs", import.meta.url), "utf8");
const storeSource = await readFile(new URL("../src/data/localStore.mjs", import.meta.url), "utf8");
// Execute the production bootstrap body with its real safety function. The VM
// supplies browser objects; the platform-compatibility import is outside this test.
const bootstrapForVm = bootstrapSource.replace(/^import [^\r\n]+;\r?\n/gmu, "");
const draftMarkers = {
  note: { selector: "#app .event-note-editor", markup: /class="event-note-editor"/u },
  expense: { selector: "#app [role='dialog']", markup: /expense-step-modal" role="dialog"/u },
  "group-create": { selector: "#app [data-screen-kind='group-create']", markup: /data-screen-kind="group-create"/u },
  "group-edit": { selector: "#app [data-screen-kind='group-edit']", markup: /data-screen-kind="group-edit"/u },
};

function createPageWithDraft(kind, { activeController = true } = {}) {
  const serviceWorkerListeners = new Map();
  const documentListeners = new Map();
  const windowListeners = new Map();
  const pendingSync = new Map();
  const replies = [];
  const draft = kind ? { kind, text: `Unsaved synthetic ${kind} draft`, open: true } : null;
  let reloadCalls = 0;
  const document = {
    documentElement: { classList: { toggle() {} }, dataset: {} },
    visibilityState: "visible",
    activeElement: null,
    querySelector(selector) {
      return draft?.open && selector.includes(draftMarkers[kind].selector) ? draft : null;
    },
    querySelectorAll: () => [],
    addEventListener(type, listener) { documentListeners.set(type, listener); },
  };
  const storage = {
    get length() { return pendingSync.size; },
    key(index) { return [...pendingSync.keys()][index] ?? null; },
    getItem(key) { return pendingSync.get(key) ?? null; },
  };
  const window = {
    location: {
      protocol: "https:", hostname: "pwa-qa.example.test",
      reload() { reloadCalls += 1; },
    },
    localStorage: storage,
    addEventListener(type, listener) { windowListeners.set(type, listener); },
  };
  const registration = { waiting: null, addEventListener() {}, update: async () => {} };
  const navigator = {
    standalone: false,
    serviceWorker: {
      controller: activeController ? {} : null,
      addEventListener(type, listener) { serviceWorkerListeners.set(type, listener); },
      register: async () => registration,
    },
  };
  runInNewContext(bootstrapForVm, { window, document, navigator, hasUpdateSensitiveWork });
  return {
    draft, replies,
    get reloadCalls() { return reloadCalls; },
    async ready() {
      await new Promise(setImmediate);
      assert.ok(serviceWorkerListeners.has("message"), "PWA page did not register its update reply");
      if (activeController) assert.ok(documentListeners.has("settle-friends:screen-rendered"));
    },
    controllerChange() { serviceWorkerListeners.get("controllerchange")?.(); },
    updateCheck(message, port) {
      serviceWorkerListeners.get("message")?.({ data: message, ports: [{
        postMessage(value) { replies.push(value?.safe === true); port.postMessage(value); }
      }] });
    },
    rejectedSave() {
      documentListeners.get("settle-friends:screen-rendered")?.();
      windowListeners.get("sogrim:sync-status")?.();
    },
    finishDraft(outcome) {
      assert.ok(draft?.open, "Expected an open draft");
      draft.open = false;
      if (outcome === "save") pendingSync.set("settle-friends-pending-sync:synthetic-account", "queued");
      else assert.equal(outcome, "cancel");
      documentListeners.get("settle-friends:screen-rendered")?.();
    },
    acknowledgeSave() {
      pendingSync.clear();
      windowListeners.get("sogrim:sync-status")?.();
    },
    focus() { windowListeners.get("focus")?.(); },
  };
}

async function activateUpdatedWorker({ oldPageReloads, reportsClientId = true, page = null }) {
  const listeners = new Map();
  const responses = [];
  const navigationCalls = [];
  const client = {
    id: "existing-window",
    url: "https://pwa-qa.example.test/",
    navigate(url) {
      navigationCalls.push(url);
      return Promise.resolve(client);
    }
  };
  if (page) client.postMessage = (message, [port]) => page.updateCheck(message, port);
  const self = {
    location: { origin: "https://pwa-qa.example.test" },
    addEventListener(type, listener) { listeners.set(type, listener); },
    clients: {
      async claim() {
        page?.controllerChange();
        if (!oldPageReloads) return;
        listeners.get("fetch")({
          replacesClientId: reportsClientId ? client.id : "",
          request: {
            method: "GET", mode: "navigate", url: client.url,
            headers: { has: () => false }
          },
          respondWith(response) { responses.push(Promise.resolve(response)); }
        });
      },
      async matchAll() { return [client]; },
      async get(id) { return id === client.id ? client : undefined; }
    }
  };
  const caches = {
    async keys() { return ["settle-friends-live-v510", "settle-friends-live-v515"]; },
    async delete() { return true; },
    async match() { return null; },
    async open() { return { put: async () => {} }; }
  };
  runInNewContext(workerSource, {
    self, caches, URL, Response, AbortController, MessageChannel, setTimeout, clearTimeout,
    fetch: async () => new Response("<html></html>", {
      status: 200, headers: { "content-type": "text/html" }
    })
  });
  let activation;
  listeners.get("activate")({ waitUntil(promise) { activation = promise; } });
  await activation;
  await Promise.all(responses);
  return navigationCalls;
}

test("an updating worker does not navigate a page already reloading on controllerchange", async () => {
  assert.deepEqual(await activateUpdatedWorker({ oldPageReloads: true }), []);
});

test("an updating worker leaves an unresponsive older page open", async () => {
  assert.deepEqual(await activateUpdatedWorker({ oldPageReloads: false }), []);
});

test("an updating worker navigates an older clean page after its real safety reply", async () => {
  const page = createPageWithDraft(null, { activeController: false });
  await page.ready();
  assert.deepEqual(await activateUpdatedWorker({ oldPageReloads: false, page }), [
    "https://pwa-qa.example.test/"
  ]);
  assert.deepEqual(page.replies, [true]);
  assert.equal(page.reloadCalls, 0);
});

test("a single reloading page is not navigated twice when the browser omits its client id", async () => {
  assert.deepEqual(await activateUpdatedWorker({
    oldPageReloads: true, reportsClientId: false
  }), []);
});

test("PWA draft fixtures match the current note, expense and group markup", () => {
  for (const [kind, marker] of Object.entries(draftMarkers)) {
    assert.match(appSource, marker.markup, kind);
  }
  assert.match(appSource, /document\.dispatchEvent\(new CustomEvent\("settle-friends:screen-rendered"\)\)/u);
  assert.match(storeSource, /window\.dispatchEvent\(new EventConstructor\(SYNC_STATUS_EVENT, \{ detail \}\)\)/u);
});

for (const kind of Object.keys(draftMarkers)) {
  for (const outcome of ["save", "cancel"]) {
    test(`${kind} draft defers both update navigation paths until ${outcome} completes`, async () => {
      const page = createPageWithDraft(kind);
      await page.ready();
      assert.deepEqual(await activateUpdatedWorker({ oldPageReloads: false, page }), [],
        "The worker must not navigate an open draft");
      assert.deepEqual(page.replies, [false], "The page must explicitly report the draft as unsafe");
      assert.equal(page.reloadCalls, 0, "controllerchange must not reload an open draft");
      assert.equal(page.draft.text, `Unsaved synthetic ${kind} draft`);
      assert.equal(page.draft.open, true);

      if (outcome === "save") {
        page.rejectedSave();
        assert.equal(page.reloadCalls, 0, "A rejected save must leave the draft and update wait intact");
        assert.equal(page.draft.open, true);
        assert.equal(page.draft.text, `Unsaved synthetic ${kind} draft`);
      }
      page.finishDraft(outcome);
      if (outcome === "save") {
        assert.equal(page.reloadCalls, 0, "A queued save must remain open until acknowledgment");
        page.acknowledgeSave();
      }
      assert.equal(page.reloadCalls, 1, "The completed update should reload once it is safe");
      page.focus();
      assert.equal(page.reloadCalls, 1, "Repeated lifecycle events must not reload twice");
    });
  }
}
