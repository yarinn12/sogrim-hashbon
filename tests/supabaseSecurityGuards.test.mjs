import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const schema = await readFile("supabase/schema.sql", "utf8");
const migration = await readFile(
  "supabase/migrations/20260812150007_harden_workspace_claims_and_friendship_requests.sql",
  "utf8"
);
const rollback = await readFile(
  "supabase/rollbacks/20260812150007_harden_workspace_claims_and_friendship_requests_safe.sql",
  "utf8"
);
const verification = await readFile(
  "supabase/verification/verify_20260812150007_security_hardening.sql",
  "utf8"
);
const membershipMigration = await readFile(
  "supabase/migrations/20260812151750_enforce_shared_event_membership.sql",
  "utf8"
);
const membershipRollback = await readFile(
  "supabase/rollbacks/20260812151750_enforce_shared_event_membership_safe.sql",
  "utf8"
);
const membershipVerification = await readFile(
  "supabase/verification/verify_20260812151750_shared_event_membership.sql",
  "utf8"
);
const deletionCompatibilityMigration = await readFile(
  "supabase/migrations/20260812185000_allow_guarded_account_deletion_anonymization.sql",
  "utf8"
);
const deletionCompatibilityVerification = await readFile(
  "supabase/verification/verify_20260812185000_account_deletion_compatibility.sql",
  "utf8"
);

test("signup metadata cannot claim an unregistered ownerless snapshot", () => {
  const claimFunction = sqlFunction("private.claim_signup_workspace");

  assert.match(schema, /create table if not exists private\.signup_workspace_claims/);
  assert.match(schema, /snapshot_id text primary key\s+references public\.app_snapshots\(id\) on delete cascade/);
  assert.match(schema, /alter table private\.signup_workspace_claims enable row level security/);
  assert.match(schema, /alter table private\.signup_workspace_claims force row level security/);
  assert.match(schema, /revoke all on schema private from public, anon, authenticated/);
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

test("security hardening migration is transactional, bounded and mirrors the schema", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /set local lock_timeout = '5s'/);
  assert.match(migration, /set local statement_timeout = '60s'/);
  assert.match(migration, /public\.app_snapshots must exist before applying this migration/);
  assert.match(migration, /friendship tables must exist before applying this migration/);
  assert.match(migration, /revoke all on schema private from public, anon, authenticated/);
  assert.match(migration, /alter table private\.signup_workspace_claims force row level security/);
  assert.doesNotMatch(
    migration,
    /update public\.app_snapshots as snapshot[\s\S]{0,500}from auth\.users as account/
  );

  const migrationClaim = sqlFunctionFrom(migration, "private.claim_signup_workspace");
  const schemaClaim = sqlFunction("private.claim_signup_workspace");
  assert.equal(normalizeSql(migrationClaim), normalizeSql(schemaClaim));

  const migrationFriendship = sqlFunctionFrom(migration, "public.request_friendship");
  const schemaFriendship = sqlFunction("public.request_friendship");
  assert.equal(normalizeSql(migrationFriendship), normalizeSql(schemaFriendship));

  assert.match(
    migration,
    /using \(\s*owner_user_id is null\s*and access_key_hash = \(select public\.request_space_key_hash\(\)\)\s*\)/
  );
  assert.match(migration, /revoke all on function public\.request_friendship\(text\) from public, anon/);
  assert.match(migration, /grant execute on function public\.request_friendship\(text\) to authenticated/);
  assert.match(migration, /commit;\s*$/);
});

test("safe rollback refuses pending claims and preserves monotonic protections", () => {
  assert.match(rollback, /^begin;/);
  assert.match(rollback, /Rollback stopped: signup workspace claims are still pending/);
  assert.match(rollback, /drop trigger if exists claim_signup_workspace_on_user_create/);
  assert.match(rollback, /drop function if exists private\.claim_signup_workspace\(\)/);
  assert.match(rollback, /drop table if exists private\.signup_workspace_claims/);
  assert.doesNotMatch(rollback, /create policy app_snapshots_update/);
  assert.doesNotMatch(rollback, /create or replace function public\.request_friendship/);
});

test("post-deploy verification fails closed on every hardening boundary", () => {
  assert.match(verification, /signup workspace claims table is missing/);
  assert.match(verification, /signup workspace claims RLS is not forced/);
  assert.match(verification, /signup workspace claims are exposed to a client role/);
  assert.match(verification, /shared snapshot update policy does not isolate owned workspaces/);
  assert.match(verification, /friendship pair transaction lock is missing/);
  assert.match(verification, /friendship function grants are incorrect/);
  assert.match(verification, /'ready' as verification_status/);
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

test("shared-event writes require live server membership instead of the retained invite key", () => {
  assert.match(schema, /snapshot_kind text not null default 'workspace'/);
  assert.match(schema, /create table if not exists private\.shared_snapshot_members/);
  assert.match(schema, /primary key \(snapshot_id, user_id\)/);
  assert.match(schema, /participant_id = 'account-' \|\| user_id::text/);
  assert.match(schema, /alter table private\.shared_snapshot_members force row level security/);
  assert.match(
    schema,
    /revoke all on table private\.shared_snapshot_members\s+from public, anon, authenticated/
  );

  const updatePolicy = schema.slice(
    schema.indexOf("create policy app_snapshots_update"),
    schema.indexOf("drop policy if exists app_snapshots_owner_select")
  );
  assert.match(updatePolicy, /snapshot_kind = 'workspace'[\s\S]*request_space_key_hash/);
  assert.match(updatePolicy, /snapshot_kind = 'shared_event'[\s\S]*public\.can_write_shared_snapshot\(id\)/);
  assert.match(updatePolicy, /public\.can_bootstrap_shared_snapshot\(id\)/);
  assert.doesNotMatch(
    updatePolicy,
    /snapshot_kind = 'shared_event'[\s\S]{0,180}access_key_hash = \(select public\.request_space_key_hash/
  );

  const joinFunction = sqlFunction("public.join_shared_event");
  assert.match(joinFunction, /snapshot\.access_key_hash is distinct from public\.request_space_key_hash\(\)/);
  assert.match(joinFunction, /existing_member\.status = 'removed'/);
  assert.match(joinFunction, /You are no longer a member of this event/);
  assert.match(joinFunction, /on conflict \(snapshot_id, user_id\) do update/);

  const bootstrapFunction = sqlFunction("public.can_bootstrap_shared_snapshot");
  assert.match(bootstrapFunction, /snapshot\.access_key_hash = public\.request_space_key_hash\(\)/);
  assert.match(bootstrapFunction, /not exists \([\s\S]*private\.shared_snapshot_members/);
  assert.match(bootstrapFunction, /inactiveParticipantIds/);

  const guardFunction = sqlFunction("private.guard_shared_snapshot_update");
  assert.match(guardFunction, /Only an event admin can manage event membership/);
  assert.match(guardFunction, /Only an event admin can delete a shared event/);
  assert.match(guardFunction, /actor_is_leaving/);
  assert.match(guardFunction, /actor_is_joining/);
  assert.match(guardFunction, /Only an event admin can edit this event/);
  assert.match(guardFunction, /pg_catalog\.pg_trigger_depth\(\) > 1/);
  assert.match(guardFunction, /private\.is_safe_account_deletion_anonymization/);

  const deletionCompatibilityFunction = sqlFunction(
    "private.is_safe_account_deletion_anonymization"
  );
  assert.match(deletionCompatibilityFunction, /p_old_state - 'participants'/);
  assert.match(deletionCompatibilityFunction, /p_new_state - 'participants'/);
  assert.match(deletionCompatibilityFunction, /'משתמש שנמחק'/);
  assert.match(deletionCompatibilityFunction, /- 'email' - 'authProvider' - 'authSubject'/);

  const syncFunction = sqlFunction("private.sync_shared_snapshot_members");
  assert.match(syncFunction, /status = case[\s\S]*then 'active'[\s\S]*else 'removed'/);
  assert.match(syncFunction, /removed_at = case/);
});

test("account deletion compatibility allows only the nested participant anonymization", () => {
  assert.match(deletionCompatibilityMigration, /^begin;/);
  assert.match(deletionCompatibilityMigration, /set local lock_timeout = '5s'/);
  assert.match(deletionCompatibilityMigration, /set local statement_timeout = '60s'/);
  assert.match(deletionCompatibilityMigration, /pg_catalog\.pg_trigger_depth\(\) > 1/);
  assert.match(deletionCompatibilityMigration, /private\.is_safe_account_deletion_anonymization/);
  assert.match(deletionCompatibilityMigration, /p_old_state - 'participants'/);
  assert.match(deletionCompatibilityMigration, /p_new_state - 'participants'/);
  assert.match(
    deletionCompatibilityMigration,
    /revoke all on function private\.is_safe_account_deletion_anonymization\(jsonb, jsonb\)/
  );
  assert.match(deletionCompatibilityMigration, /commit;\s*$/);
  assert.match(
    deletionCompatibilityVerification,
    /account deletion compatibility helper is missing/
  );
  assert.match(
    deletionCompatibilityVerification,
    /shared event guard does not preserve account deletion/
  );
  assert.match(deletionCompatibilityVerification, /'ready' as verification_status/);
});

test("shared membership migration, verification and rollback are deployment-safe", () => {
  assert.match(membershipMigration, /^begin;/);
  assert.match(membershipMigration, /set local lock_timeout = '5s'/);
  assert.match(membershipMigration, /set local statement_timeout = '60s'/);
  assert.match(membershipMigration, /update public\.app_snapshots\s+set snapshot_kind = 'shared_event'/);
  assert.match(membershipMigration, /create trigger classify_snapshot_kind/);
  assert.match(membershipMigration, /create trigger guard_shared_snapshot_update/);
  assert.match(membershipMigration, /create trigger sync_shared_snapshot_members/);
  assert.match(membershipMigration, /grant execute on function public\.join_shared_event\(text\) to authenticated/);
  assert.match(membershipMigration, /commit;\s*$/);

  assert.match(membershipVerification, /shared snapshot membership table is missing/);
  assert.match(membershipVerification, /shared snapshot update policy does not require active membership/);
  assert.match(membershipVerification, /shared event join does not reject removed members safely/);
  assert.match(membershipVerification, /legacy_shared_snapshots_awaiting_first_member/);
  assert.match(membershipVerification, /'ready' as verification_status/);

  assert.match(membershipRollback, /^begin;/);
  assert.match(membershipRollback, /create policy app_snapshots_update/);
  assert.match(membershipRollback, /drop trigger if exists guard_shared_snapshot_update/);
  assert.doesNotMatch(membershipRollback, /drop table.*shared_snapshot_members/);
  assert.doesNotMatch(membershipRollback, /drop column.*snapshot_kind/);
});

function sqlFunction(name) {
  return sqlFunctionFrom(schema, name);
}

function sqlFunctionFrom(source, name) {
  const escapedName = name.replaceAll(".", "\\.");
  const match = source.match(
    new RegExp(
      `create or replace function ${escapedName}\\([^]*?\\n\\$\\$;`
    )
  );
  assert.ok(match, `${name} was not found in the schema`);
  return match[0];
}

function normalizeSql(value) {
  return value.replaceAll(/\s+/g, " ").trim();
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
