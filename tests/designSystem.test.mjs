import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("stylesheet includes premium interaction and motion foundations", async () => {
  const css = await readFile("styles.css", "utf8");

  assert.match(css, /\.brand::before/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@keyframes surface-in/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.status-chip/);
  assert.match(css, /\.event-row-side/);
  assert.match(css, /\.avatar-stack/);
  assert.match(css, /\.avatar/);
  assert.match(css, /\.transfer-people/);
});

test("public app uses a dedicated Hebrew UI font stack", async () => {
  const html = await readFile("index.html", "utf8");
  const css = await readFile("styles.css", "utf8");

  assert.match(html, /fonts\.googleapis\.com/);
  assert.match(html, /family=Assistant/);
  assert.match(html, /display=swap/);
  assert.match(css, /--font-ui:\s*"Assistant",\s*"Noto Sans Hebrew"/);
  assert.match(css, /font-family:\s*var\(--font-ui\)/);
});

test("event rows render polished metadata and status chips", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /class="event-row-main"/);
  assert.match(app, /class="event-row-side"/);
  assert.match(app, /renderAvatarStack\(event\.participantIds\)/);
  assert.match(app, /status-chip/);
  assert.match(app, /event\.locked \? "סגור" : "פתוח"/);
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
