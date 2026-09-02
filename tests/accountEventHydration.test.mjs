import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  ACCOUNT_EVENT_HYDRATION_LOADING,
  ACCOUNT_EVENT_HYDRATION_READY,
  ACCOUNT_EVENT_HYDRATION_UNAVAILABLE,
  accountEventHydrationStatus,
  canRenderConfirmedEmptyAccount
} from "../src/domain/accountEventHydration.mjs";

test("an authenticated empty cache stays in loading until cloud history is authoritative", () => {
  assert.equal(
    accountEventHydrationStatus({
      authenticated: true,
      authoritative: false,
      cachedEventCount: 0,
      refreshPending: true
    }),
    ACCOUNT_EVENT_HYDRATION_LOADING
  );
  assert.equal(canRenderConfirmedEmptyAccount(ACCOUNT_EVENT_HYDRATION_LOADING), false);
});

test("a failed first cloud read never masquerades as a genuinely empty account", () => {
  assert.equal(
    accountEventHydrationStatus({
      authenticated: true,
      authoritative: false,
      cachedEventCount: 0,
      refreshPending: false
    }),
    ACCOUNT_EVENT_HYDRATION_UNAVAILABLE
  );
  assert.equal(canRenderConfirmedEmptyAccount(ACCOUNT_EVENT_HYDRATION_UNAVAILABLE), false);
});

test("only authoritative cloud state may confirm a new authenticated account is empty", () => {
  assert.equal(
    accountEventHydrationStatus({
      authenticated: true,
      authoritative: true,
      cachedEventCount: 0,
      refreshPending: false
    }),
    ACCOUNT_EVENT_HYDRATION_READY
  );
  assert.equal(canRenderConfirmedEmptyAccount(ACCOUNT_EVENT_HYDRATION_READY), true);
});

test("cached events remain usable while a background cloud refresh is pending", () => {
  assert.equal(
    accountEventHydrationStatus({
      authenticated: true,
      authoritative: false,
      cachedEventCount: 4,
      refreshPending: true
    }),
    ACCOUNT_EVENT_HYDRATION_READY
  );
});

test("startup recognizes the stored account before runtime config finishes hydrating", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const helper = app.slice(
    app.indexOf("function hasAuthenticatedAccountContext"),
    app.indexOf("function rememberPendingIncomingEventJoin")
  );
  assert.match(
    helper,
    /runtimeConfig\.storage\?\.account\?\.userId \|\|[\s\S]*?loadStoredAccountSession\(window\.localStorage\)\?\.user\?\.id/
  );
  assert.equal(
    (app.match(/authenticated: hasAuthenticatedAccountContext\(\)/g) ?? []).length,
    2,
    "both normal bootstrap and local fallback must avoid a false empty account"
  );
});
