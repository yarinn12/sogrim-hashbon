import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath =
  "supabase/migrations/20260821183052_finalize_launch_security.sql";
const friendshipFlowMigrationPath =
  "supabase/migrations/20260821184836_friend_request_rate_limit_flow_fix.sql";

test("final launch migration closes shared-event lifecycle gaps", async () => {
  const [migration, schema, verification] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile("supabase/schema.sql", "utf8"),
    readFile(
      "supabase/verification/verify_20260821183052_finalize_launch_security.sql",
      "utf8"
    )
  ]);

  for (const source of [migration, schema]) {
    assert.match(source, /private\.shared_snapshot_tombstone_recipients/);
    assert.match(source, /pending_join_until timestamptz/);
    assert.match(source, /capture_shared_snapshot_tombstone_recipients/);
    assert.match(source, /event_invite_tokens \(space_id, event_id\)/);
    assert.match(source, /guard_initial_paid_transfer_attribution/);
    assert.match(source, /offset 8/);
    assert.match(source, /public\.reserve_sensitive_api_capacity/);
    assert.match(source, /revoke insert on table public\.app_feedback/);
    assert.match(source, /public\.submit_app_feedback/);
    assert.match(source, /private\.friend_request_attempts/);
    assert.match(source, /reserve_friend_request_capacity/);
    assert.match(source, /offset 200/);
    assert.match(source, /verify_shared_event_invitation_parties/);
  }
  assert.match(verification, /Shared-event security triggers are missing/);
  assert.match(verification, /Feedback write boundary is not hardened/);
});

test("friend request limits preserve idempotent and mutual request flows", async () => {
  const migration = await readFile(friendshipFlowMigrationPath, "utf8");
  const incomingRequestBranch = migration.indexOf(
    "friendship.requester_id = target_id"
  );
  const createRequestBranch = migration.indexOf("if friendship.id is null then");
  const pairReservation = migration.indexOf(
    "reserve_friend_request_capacity(actor_id, target_id)",
    createRequestBranch
  );

  assert.ok(createRequestBranch >= 0);
  assert.ok(incomingRequestBranch > createRequestBranch);
  assert.ok(pairReservation > createRequestBranch);
  assert.match(
    migration,
    /friendship\.status = 'pending'[\s\S]*friendship\.requester_id = actor_id then[\s\S]*null;/
  );
  assert.match(
    migration,
    /if friend_code is null then[\s\S]*reserve_friend_request_capacity\(actor_id, null\)/
  );
  assert.doesNotMatch(
    migration,
    /if normalized_username !~[\s\S]{0,300}reserve_friend_request_capacity\(actor_id, null\)[\s\S]{0,300}select invite\.code/
  );
});

test("server and native boundaries use the hardened contracts", async () => {
  const [
    vercel,
    server,
    invites,
    notifications,
    feedback,
    javaContact,
    nativeBridge
  ] = await Promise.all([
    readFile("vercel.json", "utf8"),
    readFile("server.mjs", "utf8"),
    readFile("src/server/eventInvites.mjs", "utf8"),
    readFile("src/server/eventActivityNotifications.mjs", "utf8"),
    readFile("src/data/appFeedback.mjs", "utf8"),
    readFile(
      "android/app/src/main/java/com/sogrimhashbon/app/SogrimContactPickerPlugin.java",
      "utf8"
    ),
    readFile("src/publicNativeBridgeLayer.mjs", "utf8")
  ]);

  assert.doesNotMatch(vercel, /"src"\s*:\s*"\*\.mjs"/);
  assert.match(vercel, /"src"\s*:\s*"legal\.mjs"/);
  assert.match(server, /reserveDurableApiRateLimit/);
  assert.match(server, /reserve_sensitive_api_capacity/);
  assert.match(server, /RATE_LIMIT_UNAVAILABLE/);
  assert.match(invites, /params\.set\("space_id", `eq\.\$\{spaceId\}`\)/);
  assert.match(invites, /space_id: `eq\.\$\{spaceId\}`/);
  assert.match(notifications, /verify_shared_event_notification_parties/);
  assert.match(notifications, /verify_shared_event_invitation_parties/);
  assert.match(feedback, /rpc\/submit_app_feedback/);
  assert.doesNotMatch(feedback, /rest\/v1\/app_feedback/);
  assert.match(javaContact, /MAX_RAW_DISPLAY_NAME_CHARS = 256/);
  assert.match(nativeBridge, /\.slice\(0, 256\)/);
});
