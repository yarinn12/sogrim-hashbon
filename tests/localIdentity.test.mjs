import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  applyLocalParticipantId,
  hasSharedStateChanged,
  toSharedState
} from "../src/data/localIdentity.mjs";
import {
  loadState,
  loadLocalProfile,
  saveState,
  saveLocalProfile
} from "../src/data/localStore.mjs";

const state = {
  currentParticipantId: "avi",
  participants: [
    { id: "yarin", displayName: "Yarin", kind: "user" },
    { id: "avi", displayName: "Avi", kind: "user" }
  ],
  groups: [],
  events: []
};

test("applyLocalParticipantId keeps the local browser identity when it exists", () => {
  const nextState = applyLocalParticipantId(state, "yarin");

  assert.equal(nextState.currentParticipantId, "yarin");
});

test("applyLocalParticipantId falls back safely when the local identity is missing", () => {
  const nextState = applyLocalParticipantId(state, "missing");

  assert.equal(nextState.currentParticipantId, "avi");
});

test("toSharedState removes the current browser identity from shared saves", () => {
  const sharedState = toSharedState(state);

  assert.equal(sharedState.currentParticipantId, "yarin");
});

test("shared state comparison ignores the browser-local current identity", () => {
  assert.equal(
    hasSharedStateChanged(state, { ...state, currentParticipantId: "yarin" }),
    false
  );
});

test("shared state comparison detects event and participant changes", () => {
  assert.equal(
    hasSharedStateChanged(state, {
      ...state,
      events: [{ id: "event-new", name: "Dinner", participantIds: [], expenses: [] }]
    }),
    true
  );
  assert.equal(
    hasSharedStateChanged(state, {
      ...state,
      participants: [
        ...state.participants,
        { id: "guest", displayName: "Guest User", kind: "user" }
      ]
    }),
    true
  );
});

test("localStore stores identity separately from shared event data", async () => {
  const localStore = await readFile("src/data/localStore.mjs", "utf8");

  assert.match(localStore, /LOCAL_PARTICIPANT_KEY/);
  assert.match(localStore, /applyLocalParticipantId/);
  assert.match(localStore, /toSharedState\(state\)/);
  assert.match(localStore, /loadCloudState\(runtimeConfig, toSharedState\(localState\)\)/);
});

test("localStore keeps local-mode saves on the current device", async () => {
  const localStore = await readFile("src/data/localStore.mjs", "utf8");

  assert.match(localStore, /return \{ ok: true, mode: "local" \};/);
  assert.doesNotMatch(localStore, /method: "PUT"[\s\S]*\/api\/state/);
});

test("localStore never requests the retired shared state endpoint", async () => {
  const localStore = await readFile("src/data/localStore.mjs", "utf8");
  const loadSharedStateSource = localStore.slice(
    localStore.indexOf("export async function loadSharedState"),
    localStore.indexOf("export async function saveSharedState")
  );

  assert.match(loadSharedStateSource, /return localState;/);
  assert.doesNotMatch(loadSharedStateSource, /fetch\("\/api\/state"\)/);
});

test("local profile memory survives reload without entering shared event state", () => {
  withLocalStorage(() => {
    const savedProfile = saveLocalProfile({
      participantId: "user-yarin",
      displayName: "  Yarin   Levy  ",
      authProvider: "google",
      authSubject: "google-sub-1",
      email: "YARIN@example.com"
    });

    assert.deepEqual(savedProfile, {
      participantId: "user-yarin",
      displayName: "Yarin Levy",
      authProvider: "google",
      authSubject: "google-sub-1",
      email: "yarin@example.com"
    });
    assert.deepEqual(loadLocalProfile(), savedProfile);
    assert.equal(
      window.localStorage.getItem("settle-friends-current-participant"),
      "user-yarin"
    );
    assert.equal(window.localStorage.getItem("settle-friends-state"), null);
  });
});

test("local shared state migrates into a remembered cloud space", () => {
  withLocalStorage(() => {
    const localState = {
      currentParticipantId: "user-yarin",
      participants: [{ id: "user-yarin", displayName: "Yarin Levy", kind: "user" }],
      groups: [],
      events: [{ id: "event-1", name: "Dinner", participantIds: ["user-yarin"], expenses: [], transfers: [] }]
    };

    window.localStorage.setItem("settle-friends-cloud-space", "space-private");
    window.localStorage.setItem("settle-friends-state", JSON.stringify(localState));

    const loaded = loadState();
    saveState(loaded);

    assert.equal(loaded.events[0].id, "event-1");
    assert.ok(window.localStorage.getItem("settle-friends-state:space-private"));
  });
});

function withLocalStorage(callback) {
  const previousWindow = globalThis.window;
  globalThis.window = {
    localStorage: new MemoryStorage(),
    location: { href: "https://sogrim-hashbon.vercel.app/" }
  };

  try {
    callback();
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
}

class MemoryStorage {
  #items = new Map();

  getItem(key) {
    return this.#items.has(key) ? this.#items.get(key) : null;
  }

  setItem(key, value) {
    this.#items.set(key, String(value));
  }
}
