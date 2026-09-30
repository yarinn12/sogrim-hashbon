import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const origin = "https://email-completion.supabase.co";
const user = {
  id: "email-completion-user",
  email: "email-completion@example.com",
  app_metadata: { provider: "email" },
  user_metadata: {
    full_name: "משתמש בדיקה",
    username: "email_completion",
    account_space_id: "space-email-completion",
    account_space_key: "abcdefghijklmnopqrstuvwxyz_123456"
  }
};
const participantId = `account-${user.id}`;
const eventName = "האירוע של החשבון שהתחבר";

async function prepareLogin(page, { failOnce = "", holdUser = null, holdWrite = null, offlineAfterAcceptance = false } = {}) {
  const counts = { passwords: 0, users: 0, workspaces: 0, writes: 0, documents: 0 };
  let state = {
    currentParticipantId: participantId,
    participants: [{ id: participantId, displayName: "משתמש בדיקה", kind: "user", accountLinked: true }],
    friendContacts: [], groups: [], deletedEvents: [], deletedParticipants: [],
    events: [{
      id: "email-completion-event", name: eventName, currency: "ILS",
      participantIds: [participantId], adminIds: [participantId],
      createdByParticipantId: participantId,
      createdAt: "2026-09-01T08:00:00.000Z", updatedAt: "2026-09-01T08:00:00.000Z",
      expenses: [], transfers: [], activityLog: []
    }]
  };
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) counts.documents += 1;
  });
  await page.addInitScript(() => {
    // A real reload must retain the accepted session and its durable account data.
    if (!sessionStorage.getItem("email-completion-fixture")) {
      localStorage.clear();
      sessionStorage.clear();
      sessionStorage.setItem("email-completion-fixture", "1");
    }
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  });
  await page.route("**/api/config", route => route.fulfill({ json: {
    publicUrl: "http://127.0.0.1:4182",
    storage: { mode: "supabase", url: origin, anonKey: "anon-key", table: "app_snapshots" },
    launch: { googleAuthReady: false, authEmailDeliveryReady: true }
  } }));
  await page.route(`${origin}/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, body: "" });
    if (url.pathname.endsWith("/auth/v1/token")) {
      expect(url.searchParams.get("grant_type")).toBe("password");
      counts.passwords += 1;
      return route.fulfill({ json: {
        access_token: "email-access", refresh_token: "email-refresh", expires_in: 3600,
        token_type: "bearer", user
      } });
    }
    if (url.pathname.endsWith("/auth/v1/user")) {
      counts.users += 1;
      if (holdUser) await holdUser;
      if (failOnce === "user" && counts.users === 1) {
        if (offlineAfterAcceptance) await page.context().setOffline(true);
        return route.fulfill({ status: 503, json: { message: "temporary user lookup outage" } });
      }
      return route.fulfill({ json: user });
    }
    if (url.pathname.endsWith("/rpc/ensure_account_workspace")) {
      counts.workspaces += 1;
      if (failOnce === "workspace" && counts.workspaces === 1) {
        return route.fulfill({ status: 503, json: { message: "temporary workspace outage" } });
      }
      return route.fulfill({ json: { status: "existing", workspaceId: user.user_metadata.account_space_id } });
    }
    if (url.pathname.endsWith("/app_snapshots")) {
      if (request.method() === "GET" && url.searchParams.get("id") !== `eq.${user.user_metadata.account_space_id}`) {
        return route.fulfill({ json: [] });
      }
      if (request.method() !== "GET") {
        counts.writes += 1;
        const payload = request.postDataJSON();
        const row = Array.isArray(payload) ? payload[0] : payload;
        expect(row.state.currentParticipantId).toBe(participantId);
        expect(row.state.events.some(event => event.id === "email-completion-event")).toBe(true);
        state = row.state;
        if (holdWrite) await holdWrite;
      }
      return route.fulfill({ json: [{
        ...(url.searchParams.get("select") === "updated_at" ? {} : { state }),
        updated_at: "2026-09-01T08:00:01.000Z"
      }] });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/");
  const gate = page.locator("#public-account-auth-gate");
  await gate.locator('input[name="email"]').fill(user.email);
  await gate.locator('input[name="password"]').fill("correct-password");
  await gate.getByRole("button", { name: "התחבר", exact: true }).click();
  return counts;
}

async function expectAccountOpen(page, counts) {
  await expect(page.locator("#public-account-auth-gate")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByText(eventName, { exact: true })).toBeVisible();
  await expect(page.locator("#app")).not.toHaveAttribute("inert", "");
  expect(counts.passwords).toBe(1);
  expect(counts.documents).toBe(2); // The app, already booted behind login, hydrates once for this account.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("settle-friends-account-session"))?.user?.id)).toBe(user.id);
}

test("accepted email login shows progress immediately and opens the account without another tap", async ({ page }) => {
  let releaseUser;
  const holdUser = new Promise(resolve => { releaseUser = resolve; });
  const counts = await prepareLogin(page, { holdUser });
  try {
    await expect(page.getByRole("heading", { name: "נכנסת בהצלחה" })).toBeVisible();
    await expect(page.getByRole("status", { name: "", exact: true })).toContainText("פותחים את החשבון שלך…");
    await expect(page.locator('input[name="password"]')).toHaveCount(0);
    await expect(page.locator("#app")).toHaveAttribute("inert", "");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("settle-friends-account-session"))?.user?.id)).toBe(user.id);
  } finally { releaseUser(); }
  await expectAccountOpen(page, counts);
});

for (const failOnce of ["user", "workspace"]) {
  test(`accepted email login recovers automatically after a temporary ${failOnce} failure`, async ({ page }) => {
    const counts = await prepareLogin(page, { failOnce });
    await expect(page.getByText("ההתחברות הצליחה. ננסה שוב לפתוח את החשבון בעוד רגע.", { exact: true })).toBeVisible();
    await expect(page.locator('input[name="password"]')).toHaveCount(0);
    await expectAccountOpen(page, counts);
    expect(counts.users).toBeGreaterThanOrEqual(2);
  });
}

test("email login resumes on reconnect without reopening the app or sending the password twice", async ({ page, context }) => {
  const counts = await prepareLogin(page, { failOnce: "user", offlineAfterAcceptance: true });
  await expect(page.getByText("ההתחברות הצליחה. ננסה שוב לפתוח את החשבון בעוד רגע.", { exact: true })).toBeVisible();
  await expect(page.locator("#app")).toHaveAttribute("inert", "");
  await page.waitForTimeout(5_100); // Beyond the recovery timer: offline must not loop requests.
  expect(counts.users).toBe(1);
  await context.setOffline(false);
  // Repeated wake-up events must share the same completion attempt.
  await page.evaluate(() => {
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expectAccountOpen(page, counts);
});

test("email completion waits for the account write acknowledgement before reloading", async ({ page }) => {
  let releaseWrite;
  const holdWrite = new Promise(resolve => { releaseWrite = resolve; });
  const counts = await prepareLogin(page, { holdWrite });
  try {
    await expect.poll(() => counts.writes).toBeGreaterThan(0);
    await expect(page.getByRole("heading", { name: "נכנסת בהצלחה" })).toBeVisible();
    await expect(page.locator("#app")).toHaveAttribute("inert", "");
    expect(counts.documents).toBe(1);
  } finally { releaseWrite(); }
  await expectAccountOpen(page, counts);
});
