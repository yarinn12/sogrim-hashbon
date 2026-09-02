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

test("account-owned cloud saves preserve the signed-in participant identity", () => {
  const sharedState = toSharedState(state, {
    preserveCurrentParticipantId: true
  });

  assert.equal(sharedState.currentParticipantId, "avi");
});

test("shared state comparison ignores the browser-local current identity", () => {
  assert.equal(
    hasSharedStateChanged(state, { ...state, currentParticipantId: "yarin" }),
    false
  );
});

test("shared state comparison ignores JSON object key order", () => {
  const reordered = {
    events: [],
    groups: [],
    participants: state.participants.map((participant) => ({
      kind: participant.kind,
      displayName: participant.displayName,
      id: participant.id
    })),
    currentParticipantId: "yarin"
  };

  assert.equal(hasSharedStateChanged(state, reordered), false);
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

test("localStore keeps device identity local and account identity in its own cloud workspace", async () => {
  const localStore = await readFile("src/data/localStore.mjs", "utf8");

  assert.match(localStore, /LOCAL_PARTICIPANT_KEY/);
  assert.match(localStore, /applyLocalParticipantId/);
  assert.match(localStore, /JSON\.stringify\(toSharedState\(cleanState\)\)/);
  assert.match(localStore, /function toCloudState\(config, state\)/);
  assert.match(localStore, /toCloudState\(runtimeConfig, localState\)/);
  assert.match(localStore, /preserveCurrentParticipantId/);
});

test("localStore keeps local-mode saves on the current device", async () => {
  const localStore = await readFile("src/data/localStore.mjs", "utf8");

  assert.match(localStore, /const localSaved = saveState\(cleanState\)/);
  assert.match(
    localStore,
    /return localSaved\s*\?\s*\{ ok: true, mode: "local" \}/
  );
  assert.match(localStore, /error: new Error\("Local storage is unavailable"\)/);
  assert.doesNotMatch(localStore, /method: "PUT"[\s\S]*\/api\/state/);
});

test("localStore never requests the retired shared state endpoint", async () => {
  const localStore = await readFile("src/data/localStore.mjs", "utf8");
  const loadSharedStateSource = localStore.slice(
    localStore.indexOf("export function loadSharedState"),
    localStore.indexOf("export async function saveSharedState")
  );

  assert.match(loadSharedStateSource, /loadSharedStateOnce\(requestScope\)/);
  assert.match(
    loadSharedStateSource,
    /return sharedStateLoadResult\(localState, true\);/
  );
  assert.doesNotMatch(loadSharedStateSource, /fetch\("\/api\/state"\)/);
});

test("local profile memory survives reload without entering shared event state", () => {
  withLocalStorage(() => {
    const savedProfile = saveLocalProfile({
      participantId: "user-yarin",
      displayName: "  Yarin   Levy  ",
      avatarPreset: "avatar-3",
      authProvider: "google",
      authSubject: "google-sub-1",
      email: "YARIN@example.com"
    });

    assert.deepEqual(savedProfile, {
      participantId: "user-yarin",
      displayName: "Yarin Levy",
      avatarPreset: "avatar-3",
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

test("local profile memory preserves the version used to reject stale devices", () => {
  withLocalStorage(() => {
    const savedProfile = saveLocalProfile({
      participantId: "user-versioned",
      displayName: "Versioned User",
      avatarImage: "https://lh3.googleusercontent.com/current.webp",
      profileUpdatedAt: "2026-08-25T10:15:00.000Z"
    });

    assert.equal(savedProfile.profileUpdatedAt, "2026-08-25T10:15:00.000Z");
    assert.equal(savedProfile.avatarImageUpdatedAt, "2026-08-25T10:15:00.000Z");
    assert.equal(
      loadLocalProfile().profileUpdatedAt,
      "2026-08-25T10:15:00.000Z"
    );
    assert.equal(
      loadLocalProfile().avatarImageUpdatedAt,
      "2026-08-25T10:15:00.000Z"
    );
  });
});

test("profiles on a shared device stay isolated by authenticated account id", () => {
  withLocalStorage(() => {
    setAccountSession("user-dani");
    const daniProfile = saveLocalProfile({
      participantId: "account-user-dani",
      displayName: "דני כהן",
      authProvider: "google",
      authSubject: "user-dani",
      email: "dani@example.com"
    });

    setAccountSession("user-yarin");
    assert.equal(loadLocalProfile(), null);
    const yarinProfile = saveLocalProfile({
      participantId: "account-user-yarin",
      displayName: "ירין יצחק",
      authProvider: "google",
      authSubject: "user-yarin",
      email: "yarin@example.com"
    });

    assert.deepEqual(loadLocalProfile(), yarinProfile);
    setAccountSession("user-dani");
    assert.deepEqual(loadLocalProfile(), daniProfile);
    setAccountSession("user-yarin");
    assert.deepEqual(loadLocalProfile(), yarinProfile);
  });
});

test("a legacy profile from another account is never reused after account switching", () => {
  withLocalStorage(() => {
    window.localStorage.setItem(
      "settle-friends-local-profile",
      JSON.stringify({
        participantId: "account-user-dani",
        displayName: "דני כהן",
        authProvider: "google",
        authSubject: "user-dani",
        email: "dani@example.com"
      })
    );
    setAccountSession("user-yarin");

    assert.equal(loadLocalProfile(), null);
    assert.equal(
      window.localStorage.getItem(
        "settle-friends-local-profile:account:user-yarin"
      ),
      null
    );
  });
});

test("a profile accidentally stored under the wrong account repairs itself", () => {
  withLocalStorage(() => {
    setAccountSession("user-yarin");
    const profileKey = "settle-friends-local-profile:account:user-yarin";
    const participantKey =
      "settle-friends-current-participant:account:user-yarin";
    window.localStorage.setItem(
      profileKey,
      JSON.stringify({
        participantId: "account-user-dani",
        displayName: "דני כהן",
        authProvider: "google",
        authSubject: "user-dani",
        email: "dani@example.com"
      })
    );
    window.localStorage.setItem(participantKey, "account-user-dani");

    assert.equal(loadLocalProfile(), null);
    assert.equal(window.localStorage.getItem(profileKey), null);
    assert.equal(window.localStorage.getItem(participantKey), null);
  });
});

test("an authenticated profile self-heals an obsolete offline participant id", () => {
  withLocalStorage(() => {
    setAccountSession("user-yarin");
    const profileKey = "settle-friends-local-profile:account:user-yarin";
    const participantKey =
      "settle-friends-current-participant:account:user-yarin";
    window.localStorage.setItem(
      profileKey,
      JSON.stringify({
        participantId: "offline-yarin-before-login",
        displayName: "ירין יצחק",
        authProvider: "google",
        authSubject: "user-yarin",
        email: "yarin@example.com"
      })
    );
    window.localStorage.setItem(participantKey, "offline-yarin-before-login");

    const profile = loadLocalProfile();

    assert.equal(profile.participantId, "account-user-yarin");
    assert.equal(
      JSON.parse(window.localStorage.getItem(profileKey)).participantId,
      "account-user-yarin"
    );
    assert.equal(
      window.localStorage.getItem(participantKey),
      "account-user-yarin"
    );
  });
});

test("saving an authenticated profile canonicalizes an offline participant id immediately", () => {
  withLocalStorage(() => {
    setAccountSession("user-yarin");

    const profile = saveLocalProfile({
      participantId: "offline-yarin-before-login",
      displayName: "ירין יצחק",
      authProvider: "google",
      authSubject: "user-yarin",
      email: "yarin@example.com"
    });

    assert.equal(profile.participantId, "account-user-yarin");
    assert.equal(loadLocalProfile().participantId, "account-user-yarin");
    assert.equal(
      window.localStorage.getItem(
        "settle-friends-current-participant:account:user-yarin"
      ),
      "account-user-yarin"
    );
  });
});

test("a stale account save cannot overwrite the active account profile", () => {
  withLocalStorage(() => {
    setAccountSession("user-yarin");
    const current = saveLocalProfile({
      participantId: "account-user-yarin",
      displayName: "ירין יצחק",
      authProvider: "google",
      authSubject: "user-yarin",
      email: "yarin@example.com"
    });

    const staleSave = saveLocalProfile({
      participantId: "account-user-dani",
      displayName: "דני כהן",
      authProvider: "google",
      authSubject: "user-dani",
      email: "dani@example.com"
    });

    assert.equal(staleSave, null);
    assert.deepEqual(loadLocalProfile(), current);
  });
});

test("authenticated state ignores a stale device participant marker", () => {
  withLocalStorage(() => {
    setAccountSession("user-yarin");
    window.localStorage.setItem("settle-friends-cloud-space", "space-yarin");
    window.localStorage.setItem(
      "settle-friends-current-participant:account:user-yarin",
      "offline-yarin-before-login"
    );
    window.localStorage.setItem(
      "settle-friends-state:space-yarin",
      JSON.stringify({
        currentParticipantId: "offline-yarin-before-login",
        participants: [
          { id: "offline-yarin-before-login", displayName: "ירין הישן", kind: "guest" },
          { id: "account-user-yarin", displayName: "ירין יצחק", kind: "user" }
        ],
        groups: [],
        events: []
      })
    );

    assert.equal(loadState().currentParticipantId, "account-user-yarin");
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

test("an authenticated account never imports unclaimed legacy state", () => {
  withLocalStorage(() => {
    setAccountSession("user-yarin");
    window.localStorage.setItem("settle-friends-cloud-space", "space-yarin");
    window.localStorage.setItem(
      "settle-friends-state",
      JSON.stringify({
        currentParticipantId: "account-user-dani",
        participants: [
          { id: "account-user-dani", displayName: "Dani Cohen", kind: "user" }
        ],
        groups: [],
        events: [
          {
            id: "event-dani",
            name: "Dani event",
            participantIds: ["account-user-dani"],
            expenses: [],
            transfers: []
          }
        ]
      })
    );

    const loaded = loadState();

    assert.deepEqual(loaded.events, []);
    assert.equal(
      window.localStorage.getItem("settle-friends-state:space-yarin"),
      null
    );
  });
});

test("an authenticated signup imports only explicitly claimed guest state", () => {
  withLocalStorage(() => {
    setAccountSession("user-yarin");
    window.localStorage.setItem("settle-friends-cloud-space", "space-yarin");
    window.localStorage.setItem(
      "settle-friends-legacy-state-claim:space-yarin",
      "1"
    );
    window.localStorage.setItem(
      "settle-friends-state",
      JSON.stringify({
        currentParticipantId: "guest-yarin",
        participants: [
          { id: "guest-yarin", displayName: "Yarin Izhak", kind: "guest" }
        ],
        groups: [],
        events: [
          {
            id: "event-guest",
            name: "Guest event",
            participantIds: ["guest-yarin"],
            expenses: [],
            transfers: []
          }
        ]
      })
    );

    const loaded = loadState();

    assert.equal(loaded.events[0].id, "event-guest");
    assert.ok(window.localStorage.getItem("settle-friends-state:space-yarin"));
    assert.equal(window.localStorage.getItem("settle-friends-state"), null);
    assert.equal(
      window.localStorage.getItem(
        "settle-friends-legacy-state-claim:space-yarin"
      ),
      null
    );
  });
});

function withLocalStorage(callback) {
  const previousWindow = globalThis.window;
  globalThis.window = {
    localStorage: new MemoryStorage(),
    location: { href: "https://sogrim-hesbon-app.vercel.app/" }
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

function setAccountSession(userId) {
  window.localStorage.setItem(
    "settle-friends-account-session",
    JSON.stringify({
      access_token: `access-${userId}`,
      refresh_token: `refresh-${userId}`,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: userId }
    })
  );
}

class MemoryStorage {
  #items = new Map();

  getItem(key) {
    return this.#items.has(key) ? this.#items.get(key) : null;
  }

  setItem(key, value) {
    this.#items.set(key, String(value));
  }

  removeItem(key) {
    this.#items.delete(key);
  }
}
