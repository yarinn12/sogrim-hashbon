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

test("public invite QR layer renders only the exact prepared event invite link", async () => {
  const layer = await readFile("src/publicInviteQrLayer.mjs", "utf8");

  assert.match(layer, /createQrSvg/);
  assert.match(layer, /const inviteUrl = input\?\.value\?\.trim\(\)/);
  assert.match(layer, /parseInviteEventId\(inviteUrl\)/);
  assert.match(layer, /parseInviteToken\(inviteUrl\)/);
  assert.match(layer, /exactEventId !== eventId/);
  assert.match(layer, /!exactInviteToken/);
  assert.doesNotMatch(layer, /smartInviteUrl/);
  assert.match(layer, /settle-friends:entitlements-changed/);
  assert.doesNotMatch(layer, /buildEventInviteUrl/);
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
