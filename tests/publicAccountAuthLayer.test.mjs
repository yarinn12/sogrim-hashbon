import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("account auth layer loads after the profile overlay and before visual layers", async () => {
  const index = await readFile("index.html", "utf8");
  const profileIndex = index.indexOf("publicProfileOverlay.mjs");
  const accountIndex = index.indexOf("publicAccountAuthLayer.mjs");
  const designIndex = index.indexOf("publicDesignV2Layer.mjs");

  assert.ok(profileIndex >= 0);
  assert.ok(accountIndex > profileIndex);
  assert.ok(designIndex > accountIndex);
});

test("account gate offers email registration, Google, Apple, sign out and deletion", async () => {
  const layer = await readFile("src/publicAccountAuthLayer.mjs", "utf8");

  assert.match(layer, /data-account-mode="login"/);
  assert.match(layer, /data-account-mode="signup"/);
  assert.match(layer, /signInWithPassword/);
  assert.match(layer, /signUpWithPassword/);
  assert.match(layer, /googleOAuthUrl/);
  assert.match(layer, /appleOAuthUrl/);
  assert.match(layer, /data-account-action="signout"/);
  assert.match(layer, /data-account-action="delete-account-open"/);
  assert.match(layer, /data-account-action="delete-account-confirm"/);
  assert.match(layer, /deleteAccount/);
  assert.match(layer, /handleAccountDeletionKeydown/);
  assert.match(layer, /setAttribute\("inert", ""\)/);
  assert.equal([...layer.matchAll(/gate\.setAttribute\("role", "main"\)/g)].length, 3);
  assert.match(layer, /accountDeleteReturnFocus/);
  assert.match(layer, /\.profile-setup-panel/);
  assert.match(layer, /class="account-data-links" aria-label="מידע על החשבון"/);
  assert.match(layer, /\.account-data-link[\s\S]*?min-width: 44px;[\s\S]*?min-height: 44px;/);
  assert.ok(
    layer.indexOf('class="account-data-links"') <
      layer.indexOf('class="account-profile-actions"')
  );
  assert.match(layer, /account-auth-logo-lockup/);
  assert.match(layer, /sogrim-logo-lockup\.png/);
});

test("account gate protects private content and preserves interrupted form work", async () => {
  const layer = await readFile("src/publicAccountAuthLayer.mjs", "utf8");

  assert.match(layer, /renderAccountBootGate\(\)/);
  assert.match(layer, /account-auth-locked/);
  assert.match(layer, /canResumeOffline/);
  assert.match(layer, /values\.email/);
  assert.match(layer, /rememberAccountReturnUrl\(\)/);
  assert.match(layer, /href="\.\/terms\.html"/);
  assert.match(layer, /href="\.\/privacy\.html"/);
  assert.match(layer, /prefers-reduced-motion/);
});

test("account gate prioritizes provider login and progressively reveals email", async () => {
  const layer = await readFile("src/publicAccountAuthLayer.mjs", "utf8");

  assert.match(layer, /emailAuthExpanded/);
  assert.match(layer, /data-account-action="toggle-email"/);
  assert.match(layer, /aria-controls="account-email-auth"/);
  assert.match(layer, /class="account-email-auth"/);
  assert.match(layer, /providerAvailable/);
  assert.match(layer, /emailAuthExpanded = !googleEnabled && !appleEnabled/);
  assert.match(layer, /new AbortController\(\)/);
  assert.match(layer, /controller\.abort\(\), 2500/);
});

test("service worker keeps account auth available in the installed app", async () => {
  const sw = await readFile("sw.js", "utf8");
  assert.match(sw, /const CACHE_NAME = "settle-friends-live-v\d+"/);
  assert.match(sw, /"\/src\/data\/accountAuth\.mjs"/);
  assert.match(sw, /"\/src\/data\/pendingInvite\.mjs"/);
  assert.match(sw, /"\/src\/publicAccountAuthLayer\.mjs"/);
});
