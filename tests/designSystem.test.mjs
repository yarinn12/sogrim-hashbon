import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("stylesheet includes premium interaction and motion foundations", async () => {
  const css = await readFile("styles.css", "utf8");

  assert.match(css, /\.brand::before/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@keyframes surface-in/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\[hidden\]\s*\{[\s\S]*?display:\s*none !important/);
  assert.match(css, /\.status-chip/);
  assert.match(css, /\.status-chip\.is-warn/);
  assert.match(css, /\.status-chip\.is-ok/);
  assert.match(css, /\.settlement-close-confirmation/);
  assert.match(css, /\.event-row-side/);
  assert.match(css, /\.avatar-stack/);
  assert.match(css, /\.avatar/);
  assert.match(css, /\.transfer-people/);
});

test("public app uses a dedicated Hebrew UI font stack", async () => {
  const html = await readFile("index.html", "utf8");
  const circleLayer = await readFile("src/publicCircleDesignLayer.mjs", "utf8");

  assert.match(html, /fonts\.googleapis\.com/);
  assert.match(html, /family=IBM\+Plex\+Sans\+Hebrew/);
  assert.match(html, /family=IBM\+Plex\+Mono/);
  assert.match(html, /display=swap/);
  assert.match(circleLayer, /font-family: "IBM Plex Sans Hebrew"/);
  assert.match(circleLayer, /font-family: "IBM Plex Mono"/);
});

test("Hebrew font loading does not block the app from rendering", async () => {
  const html = await readFile("index.html", "utf8");

  assert.match(html, /rel="preload" href="https:\/\/fonts\.googleapis\.com/);
  assert.match(html, /as="style"/);
  assert.match(html, /rel="stylesheet" media="print" onload="this\.media='all'"/);
  assert.match(html, /<noscript>[\s\S]*fonts\.googleapis\.com[\s\S]*<\/noscript>/);
});

test("event rows render focused metadata, status, and personal attention", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /class="event-row-main"/);
  assert.match(app, /class="event-row-side"/);
  assert.match(app, /event-row-attention/);
  assert.doesNotMatch(app, /renderAvatarStack\(event\.participantIds\)/);
  assert.match(app, /status-chip/);
  assert.match(app, /isEventClosed\(event\) \? "סגור" : "פתוח"/);
});

test("transfer rows render participant avatars and a visual direction", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /class="transfer-people"/);
  assert.match(app, /renderAvatar\(transfer\.fromParticipantId\)/);
  assert.match(app, /class="transfer-arrow"/);
  assert.match(app, /renderAvatar\(transfer\.toParticipantId\)/);
});

test("event workspace has elevated action and modal styling", async () => {
  const css = await readFile("styles.css", "utf8");

  assert.match(css, /\.event-command-card::before/);
  assert.match(css, /\.event-command-card:hover::before/);
  assert.match(css, /\.summary-item::after/);
  assert.match(css, /\.event-modal::before/);
});

test("visual polish uses modern app surfaces instead of flat form styling", async () => {
  const css = await readFile("styles.css", "utf8");

  assert.match(css, /\.app::before/);
  assert.match(css, /--shadow-panel/);
  assert.match(css, /\.expense-guest-box/);
  assert.match(css, /\.primary-button::after/);
});
