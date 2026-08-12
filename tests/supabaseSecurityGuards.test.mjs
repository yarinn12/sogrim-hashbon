import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const schema = await readFile("supabase/schema.sql", "utf8");

test("signup metadata cannot claim an unregistered ownerless snapshot", () => {
  const claimFunction = sqlFunction("private.claim_signup_workspace");

  assert.match(schema, /create table if not exists private\.signup_workspace_claims/);
  assert.match(schema, /snapshot_id text primary key\s+references public\.app_snapshots\(id\) on delete cascade/);
  assert.match(schema, /alter table private\.signup_workspace_claims enable row level security/);
  assert.match(
    schema,
    /revoke all on table private\.signup_workspace_claims\s+from public, anon, authenticated/
  );
  assert.doesNotMatch(
    schema,
    /update public\.app_snapshots as snapshot[\s\S]{0,500}from auth\.users as account/
  );
  assert.doesNotMatch(schema, /insert into private\.signup_workspace_claims/);
  assert.match(claimFunction, /from private\.signup_workspace_claims as claim/);
  assert.match(claimFunction, /claim\.snapshot_id = snapshot\.id/);
  assert.match(claimFunction, /claim\.access_key_hash = snapshot\.access_key_hash/);
  assert.match(claimFunction, /snapshot\.owner_user_id is null/);
  assert.match(claimFunction, /returning snapshot\.id into claimed_snapshot_id/);
  assert.match(
    claimFunction,
    /delete from private\.signup_workspace_claims\s+where snapshot_id = claimed_snapshot_id/
  );

  const sharedEvent = snapshot("shared-event", "shared-secret");
  const forgedMetadata = {
    account_space_id: sharedEvent.id,
    account_space_key: "shared-secret"
  };
  const privateWorkspace = snapshot("legacy-private-workspace", "private-secret");

  assert.equal(canClaim(sharedEvent, forgedMetadata, []), false);
  assert.equal(
    canClaim(
      privateWorkspace,
      {
        account_space_id: privateWorkspace.id,
        account_space_key: "private-secret"
      },
      [
        {
          snapshotId: privateWorkspace.id,
          accessKeyHash: privateWorkspace.accessKeyHash
        }
      ]
    ),
    true
  );
  assert.equal(
    canClaim(
      privateWorkspace,
      {
        account_space_id: privateWorkspace.id,
        account_space_key: "wrong-secret"
      },
      [
        {
          snapshotId: privateWorkspace.id,
          accessKeyHash: privateWorkspace.accessKeyHash
        }
      ]
    ),
    false
  );
  assert.equal(
    canClaim(
      { ...privateWorkspace, ownerUserId: "existing-owner" },
      {
        account_space_id: privateWorkspace.id,
        account_space_key: "private-secret"
      },
      [
        {
          snapshotId: privateWorkspace.id,
          accessKeyHash: privateWorkspace.accessKeyHash
        }
      ]
    ),
    false
  );
});

test("reciprocal friendship requests lock the same pair before row lookup", () => {
  const requestFunction = sqlFunction("public.request_friendship");
  const lockPattern = /pg_advisory_xact_lock\(\s*pg_catalog\.hashtextextended\(\s*'friendship:' \|\| least\(actor_id, target_id\)::text \|\| ':' \|\|\s*greatest\(actor_id, target_id\)::text/;

  assert.match(requestFunction, lockPattern);
  assert.ok(
    requestFunction.indexOf("pg_advisory_xact_lock") <
      requestFunction.indexOf("select relation.*"),
    "the pair lock must be acquired before SELECT FOR UPDATE"
  );
  assert.match(
    requestFunction,
    /select relation\.\*[\s\S]+where relation\.user_low = least\(actor_id, target_id\)[\s\S]+for update/
  );

  const firstUser = "00000000-0000-4000-8000-000000000001";
  const secondUser = "00000000-0000-4000-8000-000000000002";
  assert.equal(
    friendshipLockResource(firstUser, secondUser),
    friendshipLockResource(secondUser, firstUser)
  );

  const pending = applyFriendshipRequest(null, firstUser, secondUser);
  const accepted = applyFriendshipRequest(pending, secondUser, firstUser);
  assert.deepEqual(accepted, {
    requesterId: firstUser,
    addresseeId: secondUser,
    status: "accepted"
  });
});

function sqlFunction(name) {
  const escapedName = name.replaceAll(".", "\\.");
  const match = schema.match(
    new RegExp(
      `create or replace function ${escapedName}\\([^]*?\\n\\$\\$;`
    )
  );
  assert.ok(match, `${name} was not found in the schema`);
  return match[0];
}

function snapshot(id, key) {
  return {
    id,
    accessKeyHash: sha256(key),
    ownerUserId: null
  };
}

function canClaim(snapshotRecord, metadata, trustedClaims) {
  if (snapshotRecord.ownerUserId !== null) return false;
  if (metadata.account_space_id !== snapshotRecord.id) return false;
  if (sha256(metadata.account_space_key) !== snapshotRecord.accessKeyHash) return false;

  return trustedClaims.some(
    (claim) =>
      claim.snapshotId === snapshotRecord.id &&
      claim.accessKeyHash === snapshotRecord.accessKeyHash
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function friendshipLockResource(firstUser, secondUser) {
  const [userLow, userHigh] = [firstUser, secondUser].sort();
  return `friendship:${userLow}:${userHigh}`;
}

function applyFriendshipRequest(friendship, actorId, targetId) {
  if (!friendship) {
    return {
      requesterId: actorId,
      addresseeId: targetId,
      status: "pending"
    };
  }

  if (
    friendship.status === "pending" &&
    friendship.requesterId === targetId &&
    friendship.addresseeId === actorId
  ) {
    return { ...friendship, status: "accepted" };
  }

  return friendship;
}
