import { expect, test } from "@playwright/test";
import { createDeniedSessionDocumentBoundary } from "./helpers/denied-session-document.mjs";

test.use({ serviceWorkers: "block" });

const AUTH_ORIGIN = "https://iphone-google-session.supabase.co";
const USER_ID = "iphone-google-user";
const PARTICIPANT_ID = `account-${USER_ID}`;
const SPACE_ID = "space-iphone-google-user";
const SPACE_KEY = "abcdefghijklmnopqrstuvwxyz_654321";

const accountUser = {
  id: USER_ID,
  email: "iphone-google@example.com",
  app_metadata: { provider: "google" },
  user_metadata: {
    full_name: "משתמש גוגל",
    username: "iphone_google",
    account_space_id: SPACE_ID,
    account_space_key: SPACE_KEY
  }
};

const cloudState = {
  currentParticipantId: PARTICIPANT_ID,
  participants: [{
    id: PARTICIPANT_ID,
    displayName: "משתמש גוגל",
    kind: "user",
    accountLinked: true,
    authProvider: "google",
    authSubject: USER_ID,
    email: accountUser.email
  }],
  friendContacts: [],
  groups: [],
  events: [],
  deletedEvents: [],
  deletedParticipants: []
};

async function verifyGoogleSession({ page }, testInfo, {
  backgroundWorkspaceStatus = 0, backgroundAuthUserCode = "",
  refreshRejectStatus = 401, refreshRejectCode = "",
  holdSignedInDocumentLoad = false
} = {}) {
  const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, apikey, content-type, prefer",
    "access-control-allow-methods": "GET, PATCH, POST, OPTIONS"
  };
  let idTokenRequests = 0;
  let authUserRequests = 0;
  let ensureWorkspaceRequests = 0;
  let successfulEnsureWorkspaceResponses = 0;
  let acknowledgedWorkspaceResponses = 0;
  const denialBoundary = createDeniedSessionDocumentBoundary();
  let markBackgroundWorkspaceRejected;
  const backgroundWorkspaceRejected = new Promise(resolve => {
    markBackgroundWorkspaceRejected = resolve;
  });
  let releaseGoogleScript;
  let markGoogleScriptRequested;
  const googleScriptRelease = new Promise((resolve) => {
    releaseGoogleScript = resolve;
  });
  const googleScriptRequested = new Promise((resolve) => {
    markGoogleScriptRequested = resolve;
  });
  let releaseHeldResource = () => {};
  if (holdSignedInDocumentLoad) {
    let documentResponses = 0;
    const heldResourceRelease = new Promise(resolve => { releaseHeldResource = resolve; });
    await page.route("**/__qa_held_signed_in_image__", async route => {
      await heldResourceRelease;
      // The signed-in document has already been replaced at this point.
      await route.abort();
    });
    await page.route(/^http:\/\/127\.0\.0\.1:\d+\/\?pwa_release=403$/, async route => {
      documentResponses += 1;
      const response = await route.fetch();
      if (documentResponses !== 2) return route.fulfill({ response });
      const body = (await response.text()).replace(
        "</body>", '<img src="/__qa_held_signed_in_image__" alt=""></body>'
      );
      return route.fulfill({ response, body });
    });
  }

  await page.route("**/api/config", (route) => route.fulfill({
    json: {
      publicUrl: "http://127.0.0.1:4182",
      auth: { googleClientId: "google-client.apps.googleusercontent.com" },
      storage: {
        mode: "supabase",
        url: AUTH_ORIGIN,
        anonKey: "anon-key",
        table: "app_snapshots"
      }
    }
  }));
  await page.route("https://accounts.google.com/gsi/client*", async (route) => {
    // Reproduce a slower iPhone connection: the visible placeholder must not
    // consume a tap before Google's real one-click control is ready.
    markGoogleScriptRequested();
    await googleScriptRelease;
    await route.fulfill({
      headers: { "access-control-allow-origin": "*" },
      contentType: "application/javascript",
      body: `
        window.google = { accounts: { id: {
          initialize(options) { window.__googleIdentityOptions = options; },
          renderButton(target) {
            window.__googleButtonRenderCount = (window.__googleButtonRenderCount || 0) + 1;
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = "המשך עם Google";
            button.addEventListener("click", () => {
              window.__googleIdentityOptions.callback({ credential: "google-id-token" });
            });
            target.replaceChildren(button);
          }
        } } };
      `
    });
  });
  await page.route(`${AUTH_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: corsHeaders, body: "" });
    }
    if (url.pathname.endsWith("/auth/v1/settings")) {
      // Provider discovery finishes after the Google control is already
      // usable. Adding Apple must not replace the control under the tap.
      await new Promise((resolve) => setTimeout(resolve, 350));
      return route.fulfill({
        headers: corsHeaders,
        json: { external: { google: true, apple: true } }
      });
    }
    if (
      url.pathname.endsWith("/auth/v1/token") &&
      url.searchParams.get("grant_type") === "id_token"
    ) {
      idTokenRequests += 1;
      return route.fulfill({
        headers: corsHeaders,
        json: {
          access_token: "google-access-token",
          refresh_token: "google-refresh-token",
          expires_in: 3600,
          user: accountUser
        }
      });
    }
    if (url.pathname.endsWith("/auth/v1/token") &&
        url.searchParams.get("grant_type") === "refresh_token" &&
        (backgroundWorkspaceStatus === 401 || backgroundAuthUserCode)) {
      return route.fulfill({
        status: refreshRejectStatus, headers: corsHeaders,
        json: { message: "Invalid refresh token",
          code: refreshRejectCode || backgroundAuthUserCode }
      });
    }
    if (url.pathname.endsWith("/auth/v1/user")) {
      authUserRequests += 1;
      if (backgroundAuthUserCode && authUserRequests === 2) {
        denialBoundary.deny(await page.evaluate(() => window.__qaDocumentIdentity));
        await route.fulfill({
          status: 403, headers: corsHeaders,
          json: { message: "Account is unavailable", code: backgroundAuthUserCode }
        });
        markBackgroundWorkspaceRejected();
        return;
      }
      return route.fulfill({ headers: corsHeaders, json: accountUser });
    }
    if (url.pathname.endsWith("/rest/v1/rpc/ensure_account_workspace")) {
      ensureWorkspaceRequests += 1;
      if (backgroundWorkspaceStatus && ensureWorkspaceRequests === 2) {
        if (backgroundWorkspaceStatus === 401) {
          denialBoundary.deny(await page.evaluate(() => window.__qaDocumentIdentity));
        }
        await route.fulfill({
          status: backgroundWorkspaceStatus, headers: corsHeaders,
          json: { message: backgroundWorkspaceStatus === 401
            ? "Invalid JWT"
            : "Synthetic workspace reconciliation conflict" }
        });
        markBackgroundWorkspaceRejected();
        return;
      }
      await route.fulfill({
        headers: corsHeaders,
        json: { status: "existing", workspaceId: SPACE_ID }
      });
      successfulEnsureWorkspaceResponses += 1;
      return;
    }
    if (url.pathname.includes("/app_snapshots")) {
      return route.fulfill({
        headers: corsHeaders,
        json: request.method() === "GET"
          ? [{ state: cloudState, updated_at: "2026-08-26T00:00:00.000Z" }]
          : []
      });
    }
    if (url.pathname.includes("/rest/v1/rpc/")) {
      return route.fulfill({ headers: corsHeaders, json: {} });
    }
    return route.fulfill({ headers: corsHeaders, json: [] });
  });

  await page.addInitScript(() => {
    window.__qaDocumentIdentity = `${Date.now()}:${Math.random()}`;
  });
  await page.addInitScript(() => {
    if (!localStorage.getItem("iphone-google-test-ready")) {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem("iphone-google-test-ready", "1");
    }
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  });

  const pageLoaded = page.goto("/?pwa_release=403");
  await googleScriptRequested;
  const loadingPlaceholder = page.locator("[data-account-google-placeholder]");
  await expect(loadingPlaceholder).toBeVisible();
  await expect(loadingPlaceholder).toBeDisabled();
  await expect(loadingPlaceholder).not.toHaveAttribute("data-account-action", "google");
  releaseGoogleScript();
  await pageLoaded;
  const googleButton = page.getByRole("button", { name: "המשך עם Google" });
  await expect(googleButton).toBeVisible();
  await expect(loadingPlaceholder).toBeHidden();
  await expect.poll(
    () => page.evaluate(() => Boolean(window.__googleIdentityOptions))
  ).toBe(true);
  expect(await page.evaluate(() => ({
    itpSupport: window.__googleIdentityOptions?.itp_support,
    fedCmButton: window.__googleIdentityOptions?.use_fedcm_for_button,
    autoSelect: window.__googleIdentityOptions?.button_auto_select
  }))).toEqual({
    itpSupport: true,
    fedCmButton: true,
    autoSelect: false
  });
  await expect(page.getByRole("button", { name: "המשך עם Apple" })).toBeVisible();
  expect(await page.evaluate(() => window.__googleButtonRenderCount)).toBe(1);

  const reloadSignals = [];
  let completedDocumentLoads = 0;
  let activeNavigationRequests = 0;
  const record = (kind, detail = {}) => {
    if (reloadSignals.length < 60) reloadSignals.push({ at: new Date().toISOString(), kind, ...detail });
  };
  const pathOf = url => {
    try { return new URL(url).pathname; } catch { return String(url).slice(0, 120); }
  };
  const browser = page.context().browser();
  const listeners = [
    [page, "crash", () => record("page-crash")],
    [page, "close", () => record("page-close")],
    [page, "domcontentloaded", () => record("dom-content-loaded")],
    [page, "load", () => {
      completedDocumentLoads++;
      denialBoundary.load();
      record("document-load");
    }],
    [page, "pageerror", error => record("page-error", { message: String(error.message).slice(0, 300) })],
    [page, "console", message => {
      if (message.type() === "error" || message.type() === "warning") {
        record("page-console", { level: message.type(), message: message.text().slice(0, 300) });
      }
    }],
    [page, "framenavigated", frame => {
      if (frame === page.mainFrame()) {
        denialBoundary.commit();
        record("main-frame-navigation", { path: pathOf(frame.url()) });
      }
    }],
    [page, "request", request => {
      if (request.isNavigationRequest()) {
        activeNavigationRequests++;
        record("navigation-request", { path: pathOf(request.url()), activeNavigationRequests });
      }
    }],
    [page, "requestfinished", request => {
      if (request.isNavigationRequest()) {
        activeNavigationRequests = Math.max(0, activeNavigationRequests - 1);
        record("navigation-finished", { path: pathOf(request.url()), activeNavigationRequests });
      }
    }],
    [page, "requestfailed", request => {
      if (request.isNavigationRequest()) activeNavigationRequests = Math.max(0, activeNavigationRequests - 1);
      if (request.isNavigationRequest() || /\/api\/config|\/auth\/v1\//.test(request.url())) {
        record("request-failed", { path: pathOf(request.url()),
          navigation: request.isNavigationRequest(), activeNavigationRequests,
          error: String(request.failure()?.errorText ?? "").slice(0, 300) });
      }
    }],
    [page, "response", response => {
      if (response.url().includes("/rest/v1/rpc/ensure_account_workspace") &&
          response.status() === 200) acknowledgedWorkspaceResponses += 1;
      if (response.request().isNavigationRequest()) {
        if (response.request().frame() === page.mainFrame() && response.ok()) {
          denialBoundary.response();
        }
        record("navigation-response", { path: pathOf(response.url()), status: response.status() });
      } else if (/\/api\/config|\/auth\/v1\/|\/rest\/v1\/rpc\/ensure_account_workspace/.test(response.url())) {
        record("auth-response", { path: pathOf(response.url()), status: response.status() });
      }
    }]
  ];
  if (browser) listeners.push([browser, "disconnected", () => record("browser-disconnected")]);
  for (const [target, event, handler] of listeners) target.on(event, handler);
  record("google-click-start");
  await googleButton.click();
  record("google-click-returned");
  if (backgroundWorkspaceStatus === 401 || backgroundAuthUserCode) {
    let denialFailure;
    try {
      await backgroundWorkspaceRejected;
      // A newly initialized document proves the scheduled reload. The
      // signed-in document can be interrupted before its load event fires.
      await expect.poll(async () => {
        try {
          denialBoundary.observe(await page.evaluate(() => window.__qaDocumentIdentity));
          return denialBoundary.hasPostDenialDocument();
        } catch (error) {
          if (/Execution context was destroyed|Cannot find context with specified id/.test(String(error))) {
            return false;
          }
          throw error;
        }
      }).toBe(true);
      await expect(page.locator("#public-account-auth-gate")).toBeVisible();
      if (holdSignedInDocumentLoad) {
        await expect.poll(() => completedDocumentLoads).toBeGreaterThanOrEqual(1);
        expect(completedDocumentLoads).toBe(1);
      }
      expect(await page.evaluate(() =>
        localStorage.getItem("settle-friends-account-session")
      )).toBeNull();
      expect(successfulEnsureWorkspaceResponses).toBe(1);
      expect(idTokenRequests).toBe(1);
    } catch (error) {
      denialFailure = error;
      throw error;
    } finally {
      releaseHeldResource();
      for (const [target, event, handler] of listeners) target.off(event, handler);
      const evidence = { project: testInfo.project.name, retry: testInfo.retry,
        boundary: denialBoundary.receipt(), signals: reloadSignals,
        ...(denialFailure ? { failure: { name: String(denialFailure.name),
          message: String(denialFailure.message).slice(0, 1_000) } } : {}) };
      try {
        await testInfo.attach("google-session-denial-boundary", {
          body: JSON.stringify(evidence, null, 2), contentType: "application/json"
        });
      } catch (attachmentError) {
        if (denialFailure) throw new AggregateError([denialFailure, attachmentError],
          "credential denial failed and its QA evidence could not be attached");
        throw attachmentError;
      }
    }
    return;
  }
  await expect(page.locator("#public-account-auth-gate")).toHaveCount(0);
  record("auth-gate-absent");
  expect(idTokenRequests).toBe(1);
  expect(await page.evaluate(() => {
    const session = JSON.parse(
      localStorage.getItem("settle-friends-account-session") || "null"
    );
    return {
      accessToken: session?.access_token,
      refreshToken: session?.refresh_token,
      userId: session?.user?.id
    };
  })).toEqual({
    accessToken: "google-access-token",
    refreshToken: "google-refresh-token",
    userId: USER_ID
  });
  if (backgroundWorkspaceStatus) await backgroundWorkspaceRejected;

  const beforeReload = await page.evaluate(() => {
    const session = JSON.parse(localStorage.getItem("settle-friends-account-session") || "null");
    return { path: location.pathname, readyState: document.readyState,
      authGatePresent: Boolean(document.querySelector("#public-account-auth-gate")),
      sessionUserId: session?.user?.id ?? null,
      accessTokenPresent: Boolean(session?.access_token),
      refreshTokenPresent: Boolean(session?.refresh_token) };
  });
  const completedDocumentLoadsBeforeManualReload = completedDocumentLoads;
  const activeNavigationRequestsBeforeManualReload = activeNavigationRequests;
  record("manual-reload-start", { completedDocumentLoads, activeNavigationRequests });
  let reloadFailure;
  try {
    await page.reload();
    await expect(page.locator("#public-account-auth-gate")).toHaveCount(0);
    expect(idTokenRequests).toBe(1);
    expect(await page.evaluate(() => {
      const session = JSON.parse(localStorage.getItem("settle-friends-account-session") || "null");
      return { accessToken: session?.access_token, refreshToken: session?.refresh_token,
        userId: session?.user?.id };
    })).toEqual({ accessToken: "google-access-token",
      refreshToken: "google-refresh-token", userId: USER_ID });
    if (backgroundWorkspaceStatus) {
      await expect.poll(() => successfulEnsureWorkspaceResponses).toBeGreaterThanOrEqual(2);
      await expect.poll(() => acknowledgedWorkspaceResponses).toBeGreaterThanOrEqual(2);
      expect(ensureWorkspaceRequests).toBeGreaterThanOrEqual(3);
    }
  } catch (error) {
    reloadFailure = error;
    throw error;
  } finally {
    for (const [target, event, handler] of listeners) target.off(event, handler);
    let afterReload;
    if (!page.isClosed()) {
      try {
        afterReload = await page.evaluate(() => {
          const session = JSON.parse(localStorage.getItem("settle-friends-account-session") || "null");
          return { path: location.pathname, readyState: document.readyState,
            authGatePresent: Boolean(document.querySelector("#public-account-auth-gate")),
            accountReadyMarker: sessionStorage.getItem("settle-friends-account-ready"),
            testReadyMarker: localStorage.getItem("iphone-google-test-ready"),
            sessionUserId: session?.user?.id ?? null,
            accessTokenPresent: Boolean(session?.access_token),
            refreshTokenPresent: Boolean(session?.refresh_token) };
        });
      } catch (error) {
        afterReload = { evaluationError: String(error.message).slice(0, 300) };
      }
    }
    const evidence = { project: testInfo.project.name, retry: testInfo.retry,
      beforeReload, completedDocumentLoadsBeforeManualReload,
      activeNavigationRequestsBeforeManualReload,
      activeNavigationRequestsAtCompletion: activeNavigationRequests,
      afterReload,
      pageClosed: page.isClosed(), browserConnected: browser?.isConnected() ?? null,
      signals: reloadSignals,
      ...(reloadFailure ? { failure: { name: String(reloadFailure.name),
        message: String(reloadFailure.message).slice(0, 1_000) } } : {}) };
    try {
      await testInfo.attach("google-session-reload-boundary", {
        body: JSON.stringify(evidence, null, 2), contentType: "application/json"
      });
    } catch (attachmentError) {
      if (reloadFailure) throw new AggregateError([reloadFailure, attachmentError],
        "reload failed and its QA evidence could not be attached");
      throw attachmentError;
    }
  }
}

test("iPhone Google sign-in keeps the session after returning to the app", async ({ page }, testInfo) => {
  await verifyGoogleSession({ page }, testInfo);
});

test("iPhone Google session survives a non-auth workspace rejection and reload", async ({ page }, testInfo) => {
  await verifyGoogleSession({ page }, testInfo, { backgroundWorkspaceStatus: 400 });
});

test("iPhone Google session survives a generic workspace permission rejection and reload", async ({ page }, testInfo) => {
  await verifyGoogleSession({ page }, testInfo, { backgroundWorkspaceStatus: 403 });
});

test("iPhone Google session is invalidated after confirmed credential rejection", async ({ page }, testInfo) => {
  await verifyGoogleSession({ page }, testInfo, { backgroundWorkspaceStatus: 401 });
});

test("iPhone Google session is invalidated after an Auth API refresh-token code", async ({ page }, testInfo) => {
  await verifyGoogleSession({ page }, testInfo, {
    backgroundWorkspaceStatus: 401, refreshRejectStatus: 400,
    refreshRejectCode: "refresh_token_not_found"
  });
});

for (const code of ["user_banned", "user_not_found"]) {
  test(`iPhone Google session is invalidated after Auth API ${code}`, async ({ page }, testInfo) => {
    await verifyGoogleSession({ page }, testInfo, {
      backgroundAuthUserCode: code, refreshRejectStatus: 403
    });
  });
}

test("iPhone Google denial reloads after an interrupted signed-in document load", async ({ page }, testInfo) => {
  await verifyGoogleSession({ page }, testInfo, {
    backgroundAuthUserCode: "user_banned", refreshRejectStatus: 403,
    holdSignedInDocumentLoad: true
  });
});
