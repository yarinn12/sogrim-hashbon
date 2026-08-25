import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("public app uses public invite URLs without beta readiness UI", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /loadRuntimeConfig/);
  assert.match(app, /renderInviteStatus/);
  assert.match(app, /runtimePublicOrigin\(runtimeConfig\)/);
  assert.doesNotMatch(app, /runtimeConfig\.publicUrl \|\| window\.location\.href/);
  assert.match(app, /buildEventInviteSnapshot/);
  assert.match(app, /const inviteLink = joinEventDraft\.link/);
  assert.match(app, /resolveEventInviteCredentials/);
  assert.match(app, /readSharedEventState/);
  assert.match(app, /mergeSharedEventIntoState/);
  assert.doesNotMatch(app, /mergeInviteSnapshotIntoState/);
  assert.doesNotMatch(app, /applyInviteSnapshot/);
  assert.match(app, /if \(joinEventBusy\) return/);
  assert.match(app, /runtimeConfig\.launch\.shareLinksReady/);
  assert.doesNotMatch(app, /renderLaunchReadinessPanel/);
  assert.doesNotMatch(app, /getLaunchReadinessItems/);
});

test("server exposes runtime config for deployed beta settings", async () => {
  const server = await readFile("server.mjs", "utf8");

  assert.match(server, /getRuntimeConfig/);
  assert.match(server, /"\/api\/config"/);
});
