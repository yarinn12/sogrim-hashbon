import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Supabase schema secures shared snapshots with explicit grants and RLS", async () => {
  const schema = await readFile("supabase/schema.sql", "utf8");

  assert.match(schema, /create table if not exists public\.app_snapshots/);
  assert.match(schema, /id text primary key/);
  assert.match(schema, /access_key_hash text not null/);
  assert.match(schema, /state jsonb not null/);
  assert.match(schema, /owner_user_id uuid references auth\.users\(id\) on delete cascade/);
  assert.match(schema, /enable row level security/);
  assert.match(schema, /force row level security/);
  assert.match(schema, /grant select on table public\.app_snapshots to anon, authenticated/);
  assert.match(schema, /grant insert, update on table public\.app_snapshots to authenticated/);
  assert.match(schema, /for insert\s+to authenticated/);
  assert.match(schema, /for update\s+to authenticated/);
  assert.match(
    schema,
    /create policy app_snapshots_select[\s\S]+snapshot_kind = 'workspace'[\s\S]+access_key_hash/
  );
  assert.match(
    schema,
    /create policy app_snapshots_member_select[\s\S]+to authenticated[\s\S]+snapshot_kind = 'shared_event'[\s\S]+can_write_shared_snapshot/
  );
  assert.match(
    schema,
    /create or replace function public\.can_read_deleted_shared_snapshot[\s\S]+private\.shared_snapshot_members[\s\S]+member\.user_id = \(select auth\.uid\(\)\)/
  );
  assert.match(
    schema,
    /create policy app_snapshots_member_select[\s\S]+state -> 'events' -> 0 is null[\s\S]+jsonb_array_length\(state -> 'deletedEvents'\) > 0[\s\S]+can_read_deleted_shared_snapshot/
  );
  assert.match(
    schema,
    /revoke all on function public\.can_read_deleted_shared_snapshot\(text\)[\s\S]+from public, anon[\s\S]+grant execute on function public\.can_read_deleted_shared_snapshot\(text\)[\s\S]+to authenticated/
  );
  assert.match(schema, /owner_user_id = \(select auth\.uid\(\)\)/);
  assert.match(schema, /create or replace function private\.claim_signup_workspace/);
  assert.match(schema, /after insert on auth\.users/);
  const sharedUpdatePolicy = schema.slice(
    schema.indexOf("create policy app_snapshots_update"),
    schema.indexOf("drop policy if exists app_snapshots_owner_select")
  );
  assert.match(sharedUpdatePolicy, /using \(\s*owner_user_id is null/);
  assert.match(sharedUpdatePolicy, /snapshot_kind = 'workspace'[\s\S]*access_key_hash = \(select public\.request_space_key_hash\(\)\)/);
  assert.match(sharedUpdatePolicy, /snapshot_kind = 'shared_event'[\s\S]*select public\.can_write_shared_snapshot\(id\)/);
  assert.match(sharedUpdatePolicy, /with check \(\s*owner_user_id is null/);
  assert.match(schema, /create or replace function public\.delete_account_data/);
  assert.match(schema, /create or replace function public\.delete_account_data\(\s*p_user_id uuid\s*\)/);
  assert.doesNotMatch(schema, /account_snapshot\.access_key_hash = p_space_key_hash/);
  assert.match(schema, /owner_user_id is distinct from p_user_id/);
  assert.match(schema, /shared_records_anonymized/);
  assert.match(schema, /create or replace function private\.anonymize_account_before_delete/);
  assert.match(schema, /before delete on auth\.users/);
  assert.match(schema, /perform public\.delete_account_data\(old\.id\)/);
});

test("schema deployment verifies the account deletion function that is installed", async () => {
  const deployScript = await readFile("scripts/apply-supabase-schema.mjs", "utf8");

  assert.match(
    deployScript,
    /to_regprocedure\('public\.delete_account_data\(uuid\)'\)/
  );
  assert.match(deployScript, /deletion_trigger_ready/);
  assert.doesNotMatch(deployScript, /delete_account_data\(uuid,text,text\)/);
});

test("legacy account deletion overload is removed and independently verified", async () => {
  const migration = await readFile(
    "supabase/migrations/20260815015532_drop_legacy_delete_account_overload.sql",
    "utf8"
  );
  const verification = await readFile(
    "supabase/verification/verify_20260815015532_drop_legacy_delete_account_overload.sql",
    "utf8"
  );

  assert.match(
    migration,
    /drop function if exists public\.delete_account_data\(uuid, text, text\)/
  );
  assert.match(
    verification,
    /to_regprocedure\(\s*'public\.delete_account_data\(uuid,text,text\)'\s*\) is not null/
  );
  assert.match(
    verification,
    /perform public\.delete_account_data\(\s*'00000000-0000-0000-0000-000000000000'::uuid/
  );
  assert.match(verification, /'ready' as verification_status/);
});

test("friendship data is private, approval-based and has no direct client mutation grants", async () => {
  const schema = await readFile("supabase/schema.sql", "utf8");

  assert.match(schema, /create table if not exists public\.user_profiles/);
  assert.match(schema, /username text/);
  assert.match(schema, /username_customized boolean not null default false/);
  assert.match(schema, /profile\.username_customized = true/);
  assert.match(schema, /user_profiles_username_unique_idx/);
  assert.match(schema, /\^\[a-z\]\[a-z0-9_\]\{2,23\}\$/);
  assert.match(schema, /create table if not exists public\.friend_invite_codes/);
  assert.match(schema, /create table if not exists public\.friendships/);
  assert.match(schema, /status in \('pending', 'accepted', 'declined'\)/);
  assert.match(schema, /alter table public\.friendships force row level security/);
  assert.match(schema, /friendship\.status in \('pending', 'accepted'\)/);
  assert.match(schema, /requester_id = \(select auth\.uid\(\)\)/);
  assert.match(schema, /addressee_id = \(select auth\.uid\(\)\)/);
  assert.match(schema, /grant select on table public\.friendships to authenticated/);
  assert.doesNotMatch(
    schema,
    /grant\s+(?:select,\s*)?insert[^;]+public\.friendships to authenticated/i
  );
  assert.match(schema, /create or replace function public\.request_friendship/);
  assert.match(schema, /create or replace function public\.request_friendship_by_username/);
  assert.match(schema, /create or replace function public\.request_friendship_from_event/);
  assert.match(schema, /create or replace function public\.set_friend_username/);
  assert.match(schema, /create or replace function public\.manage_friendship/);
  assert.match(schema, /Only the recipient can accept a pending request/);
  assert.match(schema, /grant execute on function public\.request_friendship\(text\) to authenticated/);
  assert.match(
    schema,
    /grant execute on function public\.request_friendship_by_username\(text\) to authenticated/
  );
  assert.match(
    schema,
    /grant execute on function public\.request_friendship_from_event\(text, uuid\) to authenticated/
  );
  assert.match(schema, /Both accounts must be active participants in the shared event/);
  assert.match(
    schema,
    /grant execute on function public\.set_friend_username\(text\) to authenticated/
  );
  assert.match(schema, /grant execute on function public\.manage_friendship\(uuid, text\) to authenticated/);
});

test("reports and blocks are private, guarded and preserve financial history", async () => {
  const schema = await readFile("supabase/schema.sql", "utf8");

  assert.match(schema, /create table if not exists public\.user_blocks/);
  assert.match(schema, /create table if not exists public\.content_reports/);
  assert.match(schema, /alter table public\.user_blocks force row level security/);
  assert.match(schema, /alter table public\.content_reports force row level security/);
  assert.match(schema, /blocker_user_id = \(select auth\.uid\(\)\)/);
  assert.match(schema, /reporter_user_id = \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(
    schema,
    /grant\s+(?:select,\s*)?insert[^;]+public\.(?:user_blocks|content_reports) to authenticated/i
  );
  assert.match(schema, /create or replace function public\.block_user\(\s*p_target_user_id uuid/);
  assert.match(schema, /create or replace function public\.unblock_user\(\s*p_target_user_id uuid/);
  assert.match(schema, /create or replace function public\.submit_user_report/);
  assert.match(schema, /Both accounts must be active participants in the shared event/);
  assert.match(schema, /delete from public\.friendships as friendship/);
  assert.doesNotMatch(schema, /delete from public\.app_snapshots/);
  assert.match(schema, /Friendship is unavailable for blocked accounts/);
  assert.match(schema, /grant execute on function public\.block_user\(uuid\) to authenticated/);
  assert.match(schema, /grant execute on function public\.unblock_user\(uuid\) to authenticated/);
  assert.match(
    schema,
    /grant execute on function public\.submit_user_report\(text, uuid, text, text\) to authenticated/
  );
});

test("event invitations are durable, private, and carry only a trusted action url", async () => {
  const schema = await readFile("supabase/schema.sql", "utf8");

  assert.match(schema, /create table if not exists public\.event_invite_tokens/);
  assert.match(schema, /token_hash text not null unique/);
  assert.match(schema, /kind in \('open', 'private'\)/);
  assert.match(schema, /alter table public\.event_invite_tokens force row level security/);
  assert.match(
    schema,
    /revoke all on table public\.event_invite_tokens\s+from public, anon, authenticated/
  );
  assert.match(
    schema,
    /grant select, insert, update, delete\s+on table public\.event_invite_tokens\s+to service_role/
  );
  assert.match(schema, /create or replace function public\.rotate_open_event_invite/);
  assert.match(schema, /pg_advisory_xact_lock/);
  assert.match(
    schema,
    /event_invite_tokens_one_open_link_idx\s+on public\.event_invite_tokens \(event_id\)/
  );
  assert.match(
    schema,
    /event_invite_tokens_one_private_link_idx\s+on public\.event_invite_tokens \(event_id, created_by, recipient_user_id\)/
  );
  assert.match(
    schema,
    /where event_id = p_event_id\s+and kind = 'open'\s+and revoked_at is null/
  );
  assert.doesNotMatch(
    schema,
    /event_invite_tokens_one_open_link_per_creator_idx\s+on public\.event_invite_tokens \(event_id, created_by\)/
  );
  assert.match(
    schema,
    /revoke all on function public\.rotate_open_event_invite[\s\S]+from public, anon, authenticated/
  );
  assert.match(schema, /create or replace function public\.rotate_private_event_invite/);
  assert.match(
    schema,
    /revoke all on function public\.rotate_private_event_invite[\s\S]+from public, anon, authenticated/
  );
  assert.match(
    schema,
    /event_activity_notifications_kind_check[\s\S]+?'event-invite'/
  );
  assert.match(
    schema,
    /notification_inbox_kind_check[\s\S]+?'event-invite'/
  );
  assert.match(schema, /add column if not exists action_url text not null default ''/);
  assert.match(schema, /notification_inbox_action_url_check/);
  assert.match(schema, /char_length\(action_url\) <= 2048/);
  assert.match(schema, /notification_inbox_select_self/);
  assert.doesNotMatch(
    schema,
    /grant update \(action_url\) on table public\.notification_inbox to authenticated/
  );
});

test("schema deployment verifies the revocable invitation boundary", async () => {
  const deployScript = await readFile("scripts/apply-supabase-schema.mjs", "utf8");

  assert.match(deployScript, /to_regclass\('public\.event_invite_tokens'\)/);
  assert.match(
    deployScript,
    /to_regprocedure\(\s*'public\.rotate_open_event_invite\(text,uuid,text,text,text,timestamptz\)'/
  );
  assert.match(
    deployScript,
    /to_regprocedure\(\s*'public\.rotate_private_event_invite\(text,uuid,uuid,text,text,text,timestamptz,timestamptz\)'/
  );
  assert.match(deployScript, /event_invite_tokens_client_locked/);
  assert.match(deployScript, /event_invite_rotation_locked/);
  assert.match(deployScript, /event_open_invite_index_ready/);
  assert.match(deployScript, /private_event_invite_rotation_locked/);
});

test("schema deployment verifies every friendship table and RPC", async () => {
  const deployScript = await readFile("scripts/apply-supabase-schema.mjs", "utf8");

  assert.match(deployScript, /to_regclass\('public\.user_profiles'\)/);
  assert.match(deployScript, /profile_username_state_ready/);
  assert.match(deployScript, /to_regclass\('public\.friend_invite_codes'\)/);
  assert.match(deployScript, /to_regclass\('public\.friendships'\)/);
  assert.match(deployScript, /to_regclass\('public\.user_blocks'\)/);
  assert.match(deployScript, /to_regclass\('public\.content_reports'\)/);
  assert.match(deployScript, /to_regprocedure\('public\.request_friendship\(text\)'\)/);
  assert.match(
    deployScript,
    /to_regprocedure\('public\.request_friendship_by_username\(text\)'\)/
  );
  assert.match(
    deployScript,
    /to_regprocedure\('public\.request_friendship_from_event\(text,uuid\)'\)/
  );
  assert.match(
    deployScript,
    /to_regprocedure\('public\.set_friend_username\(text\)'\)/
  );
  assert.match(deployScript, /to_regprocedure\('public\.manage_friendship\(uuid,text\)'\)/);
  assert.match(deployScript, /to_regprocedure\('public\.block_user\(uuid\)'\)/);
  assert.match(deployScript, /to_regprocedure\('public\.unblock_user\(uuid\)'\)/);
  assert.match(
    deployScript,
    /to_regprocedure\('public\.submit_user_report\(text,uuid,text,text\)'\)/
  );
  assert.match(deployScript, /safety_client_mutation_locked/);
  assert.match(deployScript, /safety_function_access_ready/);
});

test("schema deployment verifies workspace claim and pair-lock hardening", async () => {
  const deployScript = await readFile("scripts/apply-supabase-schema.mjs", "utf8");

  assert.match(deployScript, /to_regclass\('private\.signup_workspace_claims'\)/);
  assert.match(deployScript, /signup_claims_rls_ready/);
  assert.match(deployScript, /signup_claims_private/);
  assert.match(deployScript, /signup_claim_trigger_ready/);
  assert.match(deployScript, /signup_claim_function_private/);
  assert.match(deployScript, /personal_snapshot_guard_ready/);
  assert.match(deployScript, /is_safe_account_deletion_anonymization/);
  assert.match(deployScript, /shared_snapshot_policy_ready/);
  assert.match(deployScript, /friendship_pair_lock_ready/);
});
