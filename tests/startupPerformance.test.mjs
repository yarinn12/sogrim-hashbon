import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { markStartupMilestone, startupMilestoneSnapshot } from "../src/data/startupMetrics.mjs";
import { runAfterFirstInteractiveScreen } from "../src/data/startupScheduler.mjs";

test("secondary startup work waits for auth, the first screen, and browser idle time", () => {
  const events = new EventTarget();
  let authPending = true;
  let screenReady = false;
  let idleCallback = null;
  let runs = 0;
  const documentRef = Object.assign(events, {
    documentElement: {
      classList: { contains: () => authPending }
    },
    querySelector: () => (screenReady ? {} : null)
  });
  const windowRef = {
    requestIdleCallback(callback) {
      idleCallback = callback;
      return 7;
    },
    cancelIdleCallback() {}
  };

  runAfterFirstInteractiveScreen(() => {
    runs += 1;
  }, { documentRef, windowRef });

  screenReady = true;
  documentRef.dispatchEvent(new Event("settle-friends:screen-rendered"));
  assert.equal(idleCallback, null);
  authPending = false;
  documentRef.dispatchEvent(new Event("account-auth-ready"));
  assert.equal(typeof idleCallback, "function");
  assert.equal(runs, 0);
  idleCallback();
  assert.equal(runs, 1);
  documentRef.dispatchEvent(new Event("settle-friends:screen-rendered"));
  assert.equal(runs, 1);
});

test("startup milestones are idempotent and expose navigation-relative timing", () => {
  const marks = [];
  const performanceImpl = {
    mark(name) {
      marks.push({ name, startTime: 123.6 });
    },
    getEntriesByName(name) {
      return marks.filter((entry) => entry.name === name);
    },
    getEntriesByType(type) {
      return type === "mark" ? marks : [];
    }
  };

  assert.equal(markStartupMilestone("auth-ready", performanceImpl), true);
  assert.equal(markStartupMilestone("auth-ready", performanceImpl), false);
  assert.deepEqual(startupMilestoneSnapshot(performanceImpl), {
    "auth-ready": 124
  });
});

test("noncritical native services initialize only after the first interactive screen", async () => {
  const [referrals, premium, ads, notifications, smoke, benchmark, serviceWorker] =
    await Promise.all([
      readFile("src/publicReferralRewardsLayer.mjs", "utf8"),
      readFile("src/publicPremiumBillingLayer.mjs", "utf8"),
      readFile("src/publicAdLayer.mjs", "utf8"),
      readFile("src/publicNotificationLayer.mjs", "utf8"),
      readFile("scripts/verify-android-native-smoke.mjs", "utf8"),
      readFile("scripts/benchmark-android-startup.mjs", "utf8"),
      readFile("sw.js", "utf8")
    ]);

  for (const layer of [referrals, premium, ads, notifications]) {
    assert.match(layer, /runAfterFirstInteractiveScreen/);
  }
  for (const layer of [referrals, premium, ads]) {
    assert.doesNotMatch(layer, /addEventListener\("account-auth-ready"/);
  }
  assert.match(notifications, /runAfterFirstInteractiveScreen\(\(\) => \{\s*startupReady = true;\s*document\.addEventListener\("account-auth-ready", requestNotificationInitialization\)/);
  assert.doesNotMatch(notifications.slice(0, notifications.indexOf("runAfterFirstInteractiveScreen(() =>")), /addEventListener\("account-auth-ready"/);
  assert.doesNotMatch(referrals, /queueMicrotask/);
  assert.doesNotMatch(premium, /queueMicrotask/);
  assert.doesNotMatch(ads, /queueMicrotask\(scheduleAdSync\)/);
  assert.doesNotMatch(notifications, /queueMicrotask/);
  assert.match(smoke, /startupMarks/);
  assert.match(benchmark, /webMilestones/);
  assert.match(serviceWorker, /startupMetrics\.mjs/);
  assert.match(serviceWorker, /startupScheduler\.mjs/);
});

test("the current public avatar is reconciled before the first interactive render", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const avatarBudget = Number(
    app.match(/const OWN_PROFILE_STARTUP_WAIT_MS = ([\d_]+);/)?.[1]?.replaceAll("_", "")
  );
  const hydration = app.slice(
    app.indexOf("async function hydrateAppForActiveAccount()"),
    app.indexOf("async function setEventRepaymentMode")
  );
  const avatarHydration = hydration.indexOf(
    "await hydrateOwnPublicAvatarBeforeFirstRender()"
  );
  const firstRender = hydration.indexOf("appBootHydrated = true");

  assert.ok(avatarHydration >= 0);
  assert.ok(firstRender > avatarHydration);
  assert.ok(avatarBudget > 0 && avatarBudget <= 500);
  assert.match(
    hydration,
    /const startupRefreshRequest = refreshStartupSharedState\(startupState\.refresh\);[\s\S]*?const profilePublicationReady = startupState\.refresh[\s\S]*?startupRefreshRequest[\s\S]*?publishCurrentProfileToSharedEventsOnce/
  );
});
