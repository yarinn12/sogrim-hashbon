import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const AUTH_ORIGIN = "https://auth-feedback.supabase.co";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/config", (route) =>
    route.fulfill({
      json: {
        publicUrl: "http://127.0.0.1:4182",
        storage: {
          mode: "supabase",
          url: AUTH_ORIGIN,
          anonKey: "anon-key",
          table: "app_snapshots"
        },
        launch: {
          googleAuthReady: false,
          authEmailDeliveryReady: true
        }
      }
    })
  );

  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  });
});

test("touching the login fields focuses them on iPad and opens the software-input path", async ({ page }) => {
  await page.goto("/");
  const hasTouch = Boolean(test.info().project.use.hasTouch);
  test.skip(!hasTouch, "the software-input path only exists in touch contexts");
  const gate = page.locator("#public-account-auth-gate");
  const email = gate.locator('input[name="email"]');
  const password = gate.locator('input[name="password"]');

  await expect(gate).toBeVisible();
  await expect(gate).not.toHaveAttribute("inert", "");
  await email.tap();
  await expect(email).toBeFocused();
  await password.tap();
  await expect(password).toBeFocused();
});

test("password recovery keeps validation and success feedback visible", async ({ page }) => {
  let recoveryRequests = 0;
  await page.route(`${AUTH_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, body: "" });
    }
    if (url.pathname.endsWith("/auth/v1/recover")) {
      recoveryRequests += 1;
      expect(route.request().postDataJSON()).toEqual({ email: "qa@example.com" });
      return route.fulfill({ status: 200, json: {} });
    }
    return route.fulfill({ status: 200, json: [] });
  });

  await page.goto("/");
  const gate = page.locator("#public-account-auth-gate");
  await expect(gate).toBeVisible();

  await gate.getByRole("button", { name: "שכחתי סיסמה" }).click();
  const validation = gate.locator("#account-auth-feedback");
  await expect(validation).toHaveRole("alert");
  await expect(validation).toContainText("צריך להזין אימייל");
  await expect(gate.locator('input[name="email"]')).toBeFocused();

  await gate.locator('input[name="email"]').fill("qa@example");
  await gate.getByRole("button", { name: "שכחתי סיסמה" }).click();
  await expect(gate.locator("#account-auth-feedback")).toContainText(
    "כתובת האימייל אינה תקינה"
  );
  expect(recoveryRequests).toBe(0);

  await gate.locator('input[name="email"]').fill("qa@example.com");
  await gate.getByRole("button", { name: "שכחתי סיסמה" }).click();

  const success = page.locator("#public-account-auth-gate #account-auth-feedback");
  await expect(success).toHaveRole("status");
  await expect(success).toContainText("שלחנו קישור לאיפוס הסיסמה");
  await expect(success).toBeInViewport();
  await page.waitForTimeout(1_000);
  await expect(success).toBeVisible();
  expect(recoveryRequests).toBe(1);
});

test("password recovery form survives a reload for the same authenticated account", async ({ page }) => {
  const user = {
    id: "qa-recovery-user",
    email: "qa@example.com",
    user_metadata: {
      full_name: "QA Recovery",
      username: "qa_recovery",
      account_space_id: "space-qa-recovery",
      account_space_key: "abcdefghijklmnopqrstuvwxyzABCDEF"
    }
  };
  await page.addInitScript(({ user }) => {
    const session = {
      access_token: "recovery-access-token",
      refresh_token: "recovery-refresh-token",
      token_type: "bearer",
      expires_at: Math.floor(Date.now() / 1000) + 3_600,
      user
    };
    localStorage.setItem(
      "settle-friends-account-session",
      JSON.stringify(session)
    );
    localStorage.setItem(
      "settle-friends-account-recovery-session",
      JSON.stringify({ userId: user.id, createdAt: Date.now() })
    );
  }, { user });
  await page.route(`${AUTH_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/v1/user")) {
      return route.fulfill({ status: 200, json: user });
    }
    return route.fulfill({ status: 200, json: [] });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "איפוס סיסמה" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "איפוס סיסמה" })).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
});

test("an unconfirmed account can request a fresh verification email", async ({ page }) => {
  let resendRequests = 0;
  await page.route(`${AUTH_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, body: "" });
    }
    if (url.pathname.endsWith("/auth/v1/token")) {
      return route.fulfill({
        status: 400,
        json: { message: "Email not confirmed" }
      });
    }
    if (url.pathname.endsWith("/auth/v1/resend")) {
      resendRequests += 1;
      expect(route.request().postDataJSON()).toEqual({
        type: "signup",
        email: "qa@example.com"
      });
      return route.fulfill({ status: 200, json: {} });
    }
    return route.fulfill({ status: 200, json: [] });
  });

  await page.goto("/");
  const gate = page.locator("#public-account-auth-gate");
  await gate.locator('input[name="email"]').fill("qa@example.com");
  await gate.locator('input[name="password"]').fill("correct-password");
  await gate.getByRole("button", { name: "התחבר", exact: true }).click();

  await expect(gate.locator("#account-auth-feedback")).toContainText(
    "צריך לאשר את המייל"
  );
  await gate.getByRole("button", { name: "שלח שוב קישור אימות" }).click();
  await expect(gate.locator("#account-auth-feedback")).toContainText(
    "שלחנו קישור אימות חדש"
  );
  expect(resendRequests).toBe(1);
});

test("login and signup errors remain visible next to the relevant fields", async ({ page }) => {
  await page.route(`${AUTH_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, body: "" });
    }
    if (url.pathname.endsWith("/auth/v1/token")) {
      return route.fulfill({
        status: 400,
        json: { message: "Invalid login credentials" }
      });
    }
    return route.fulfill({ status: 200, json: [] });
  });

  await page.goto("/");
  const gate = page.locator("#public-account-auth-gate");
  await gate.locator('input[name="email"]').fill("qa@example.com");
  await gate.locator('input[name="password"]').fill("incorrect-password");
  await gate.getByRole("button", { name: "התחבר", exact: true }).click();
  await expect(gate.locator("#account-auth-feedback")).toContainText(
    "האימייל או הסיסמה אינם נכונים"
  );

  await gate.getByRole("button", { name: "הרשמה", exact: true }).click();
  await expect(gate.locator(".account-auth-field-hint")).toContainText(
    "החשבון יופעל רק אחרי פתיחת הקישור"
  );
  await gate.getByRole("button", { name: "צור חשבון", exact: true }).click();
  const signupError = gate.locator("#account-auth-feedback");
  await expect(signupError).toHaveRole("alert");
  await expect(signupError).toContainText("שם פרטי ושם משפחה");
  await expect(gate.locator('input[name="displayName"]')).toBeFocused();
});
