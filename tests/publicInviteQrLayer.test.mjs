import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("public invite QR layer loads after invite snapshot links", async () => {
  const index = await readFile("index.html", "utf8");
  const sw = await readFile("sw.js", "utf8");

  assert.match(index, /publicInviteQrLayer\.mjs/);
  assert.ok(
    index.indexOf("publicInviteQrLayer.mjs") >
      index.indexOf("publicInviteSnapshotLayer.mjs")
  );
  assert.match(sw, /publicInviteQrLayer\.mjs/);
});

test("public invite QR layer renders a QR code from the smart event invite link", async () => {
  const layer = await readFile("src/publicInviteQrLayer.mjs", "utf8");

  assert.match(layer, /createQrSvg/);
  assert.match(layer, /input\?\.value\?\.trim\(\) \|\| smartInviteUrl/);
  assert.match(layer, /buildEventInviteSnapshot/);
  assert.match(layer, /buildEventInviteUrl/);
  assert.match(layer, /eventOpenInviteToken/);
  assert.match(layer, /normalizeReferralCode/);
  assert.match(layer, /settle-friends:entitlements-changed/);
  assert.match(layer, /referralCode/);
  assert.match(layer, /runtimeConfig\?\.storage\?\.mode === "supabase"/);
  assert.match(layer, /runtimeConfig\?\.publicUrl \|\| window\.location\.href/);
  assert.match(layer, /inviteToken/);
  assert.doesNotMatch(layer, /getActiveCloudSpaceId/);
  assert.match(layer, /data-action="copy-invite"/);
  assert.match(layer, /data-open-link="true"/);
  assert.match(layer, /data-public-invite-qr/);
  assert.match(layer, /public-invite-qr/);
  assert.match(layer, /document\.createElement\("details"\)/);
  assert.match(layer, /public-invite-qr-summary/);
  assert.match(layer, /public-invite-qr-body/);
  assert.match(layer, /הצג QR להצטרפות/);
  assert.match(layer, /QR/);
  assert.match(layer, /catch/);
});
