import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { renderPrimaryNavigation } from "../src/primaryNavigation.mjs";

const app = await readFile("src/app.mjs", "utf8");
const referrals = await readFile("src/publicReferralRewardsLayer.mjs", "utf8");
const home = app.slice(app.indexOf("function renderHome()"), app.indexOf("function renderHomeCreateEventAction()"));

function attachedReferralContexts(kind) {
  const contexts = [];
  const panel = { querySelector: () => null, insertAdjacentHTML() {} };
  const screen = {
    matches(selector) {
      if (selector === '[data-screen-kind="home"]') return kind === "home";
      if (selector === ".profile-edit-screen") return kind === "profile";
      if (selector === ".groups-overview-screen.friends-hub-screen") return kind === "friends";
      return false;
    },
    querySelector(selector) {
      if (kind === "home" && [":scope > .section", ":scope > .home-benefit-actions"].includes(selector)) return panel;
      if (kind === "friends" && selector === ".friends-hub-panel") return panel;
      if (kind === "profile" && selector === ".profile-setup-panel") return panel;
      return null;
    }
  };
  const start = referrals.indexOf("function enhanceReferralEntryPoints()");
  const end = referrals.indexOf("function syncReferralRewardCard", start);
  assert.ok(start >= 0 && end > start);
  vm.runInNewContext(`${referrals.slice(start, end)}; enhanceReferralEntryPoints();`, {
    document: { querySelector: () => screen },
    syncReferralRewardCard(_screen, context, insert) { contexts.push(context); insert(); },
    referralRewardCard: context => `<button>${context}</button>`
  });
  return contexts;
}

test("approved navigation gives friends its own destination instead of a second home entry", () => {
  const markup = renderPrimaryNavigation();
  assert.deepEqual([...markup.matchAll(/data-nav-destination="([^"]+)"/g)].map(match => match[1]),
    ["home", "friends", "notifications", "profile"]);
  assert.match(markup, /data-action="groups" data-nav-destination="friends" data-tab="people"/);
});

test("approved home no longer exposes the friends and promotional shortcut row", () => {
  assert.doesNotMatch(home, /home-benefit-actions|home-friends-action/);
  assert.match(home, /renderHomeCreateEventAction/);
  assert.match(home, /renderEventStatusFilter/);
});

test("approved referral entry attaches to friends while home remains task focused", () => {
  assert.deepEqual(attachedReferralContexts("home"), []);
  assert.deepEqual(attachedReferralContexts("friends"), ["friends"]);
  assert.deepEqual(attachedReferralContexts("friend-profile"), []);
});

test("moving the home referral entry preserves profile entitlement access", () => {
  assert.deepEqual(attachedReferralContexts("profile"), ["profile"]);
});


test("friends and event routes keep the correct primary destination highlighted", async () => {
  const { primaryNavigationDestinationForScreen: destination } = await import("../src/ui/primaryNavigationState.mjs");
  for (const kind of ["groups", "group-workflow", "friend-invite"]) assert.equal(destination(kind), "friends");
  for (const kind of ["home", "event", "event-notes", "settlement", "join-event", "new-event"]) assert.equal(destination(kind), "home");
  assert.equal(destination("notifications"), "notifications");
  for (const kind of ["profile", "admin"]) assert.equal(destination(kind), "profile");
  assert.equal(destination("sign-in"), "");
});
