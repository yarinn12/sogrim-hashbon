import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { iconSvg } from "../src/uiIcons.mjs";
import { renderProfileAccountControlsView, renderProfileAdPrivacyControlView } from "../src/ui/profileAccountPresentation.mjs";
const layer = readFileSync(process.env.PROFILE_ACCOUNT_TEST_LAYER || "src/publicAccountAuthLayer.mjs", "utf8");
const start = layer.indexOf("function enhanceAccountControls()"), next = layer.slice(start + 1).search(/\n(?:async )?function /), source = layer.slice(start, start + 1 + next);
const escapeHtml = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
function render({ user = true, email = "noam@example.invalid", platform = "web", hostSelector = ".profile-summary", noHost = false, existing = false } = {}) {
  let html = "", position = "", calls = 0;
  const host = { querySelector: () => existing ? {} : null, insertAdjacentHTML: (p, h) => {
    position = p;
    html = h;
    calls++;
  } };
  runInNewContext(source + ";enhanceAccountControls()", { accountSession: user ? { user: { email } } : null, Event: class {}, document: { dispatchEvent() {}, querySelector: (s) => !noHost && s === hostSelector ? host : null }, globalThis: { Capacitor: { getPlatform: () => platform } }, iconSvg, escapeHtml, renderProfileAccountControlsView, renderProfileAdPrivacyControlView, enhanceAccountFeedbackPage() {} });
  return { html, position, calls };
}
test("public Profile feedback uses ordinary-user wording and one compact summary", () => {
  const { html } = render();
  assert.match(html, /<strong>שליחת משוב<\/strong>/);
  assert.match(html, /דיווח על תקלה או הצעה לשיפור/);
  assert.doesNotMatch(html, /משוב לבודקים|פרטיות, התקנה וניהול החשבון/);
});
test("connected email keeps all characters and preferred safe wrap points", () => {
  const { html } = render({ email: "  noam.long_name@example.invalid  " });
  assert.match(html, /מחובר כ־/);
  const value = html.match(/<bdi dir="ltr">([\s\S]*?)<\/bdi>/)?.[1];
  assert.ok(value);
  assert.equal(value.replaceAll("<wbr>", ""), "noam.long_name@example.invalid");
  assert.match(value, /@<wbr>/);
  assert.match(value, /_<wbr>/);
});
test("help is discoverable and all legal routes are preserved", () => {
  const { html } = render();
  assert.deepEqual([...html.matchAll(/href="([^"]+)"/g)].map((x) => x[1]), ["./support.html", "./privacy.html", "./terms.html", "./accessibility.html"]);
  assert.match(html, /עזרה ותמיכה/);
});
test("deletion has one action, one warning and the standard icon wrapper", () => {
  const { html } = render();
  assert.equal((html.match(/data-account-action="delete-account-open"/g) || []).length, 1);
  assert.equal((html.match(/החשבון והמידע האישי יימחקו לצמיתות/g) || []).length, 1);
  assert.match(html, /class="button-action-icon" data-command-icon="delete-account-open"/);
  assert.doesNotMatch(html, /account-danger-copy/);
  assert.ok(html.indexOf('data-account-action="signout"') < html.indexOf('class="account-danger-zone"'));
});
test("sensitive controls start collapsed and retain their disclosure semantics", () => {
  const { html } = render();
  assert.match(html, /<details class="account-profile-controls" data-account-controls>/);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b/);
  assert.match(html, /<summary class="account-profile-controls-summary">/);
});
test("a normal connected user needs no tester or administrator role", () => {
  const value = render();
  assert.equal(value.calls, 1);
  assert.equal(value.position, "beforeend");
  assert.match(value.html, /data-account-action="feedback-open"/);
});
test("signed-out users never receive connected account controls", () => {
  assert.equal(render({ user: false }).calls, 0);
});
test("a missing host never creates an orphan account surface", () => {
  assert.equal(render({ noHost: true }).calls, 0);
});
test("repeat enhancement never duplicates account controls", () => {
  assert.equal(render({ existing: true }).calls, 0);
});
test("all existing Profile host fallbacks remain supported", () => {
  for (const hostSelector of [".profile-summary", ".public-profile-card", ".profile-setup-panel"]) assert.equal(render({ hostSelector }).calls, 1);
});
test("advertising privacy remains conditional on Android only", () => {
  for (const platform of ["web", "ios", "android"]) assert.equal(render({ platform }).html.includes('data-account-action="ad-privacy"'), platform === "android");
});
test("existing feedback, signout and deletion action hooks are retained", () => {
  const { html } = render();
  assert.deepEqual([...html.matchAll(/data-account-action="([^"]+)"/g)].map((x) => x[1]), ["feedback-open", "signout", "delete-account-open"]);
  assert.doesNotMatch(html, /data-public-install-app/);
  assert.match(html, /class="account-profile-actions"/);
});
test("pure view escapes email before inserting only known wrap markup", () => {
  const html = renderProfileAccountControlsView({ email: '"><img src=x>@example.invalid', adPrivacyControl: "", iconSvg });
  assert.doesNotMatch(html, /<img src=x>/);
  assert.match(html, /&lt;img src=x&gt;/);
  assert.match(html, /@<wbr>/);
});
test("public help uses the same feedback name as Profile", () => {
  const html = readFileSync("support.html", "utf8");
  assert.doesNotMatch(html, /משוב לבודקים/);
  assert.match(html, /שליחת משוב/);
});
test("shared account view remains in both offline inventories", () => {
  assert.equal((readFileSync("sw.js", "utf8").match(/"\/src\/ui\/profileAccountPresentation\.mjs"/g) || []).length, 2);
});
