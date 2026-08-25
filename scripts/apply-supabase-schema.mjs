import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";

const root = process.cwd();
loadEnvFile(resolve(root, ".env.local"));
loadEnvFile(resolve(root, ".env"));

const databaseUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Supabase database URL is not configured");

const schema = await readFile(resolve(root, "supabase/schema.sql"), "utf8");
const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  ssl: "require"
});

try {
  await sql.unsafe(schema);
  const [result] = await sql`
    select
      to_regclass('public.app_snapshots') is not null as table_ready,
      to_regclass('private.signup_workspace_claims') is not null
        as signup_claims_ready,
      to_regclass('private.shared_snapshot_members') is not null
        as shared_members_ready,
      to_regclass('private.shared_event_qualification_activity') is not null
        and to_regprocedure(
          'private.is_active_shared_event_member(text,uuid)'
        ) is not null
        as trusted_shared_activity_ready,
      to_regprocedure('private.guard_personal_snapshot_write()') is not null
        and exists (
          select 1
          from pg_catalog.pg_trigger as trigger
          where trigger.tgname = 'guard_personal_snapshot_write'
            and trigger.tgrelid = 'public.app_snapshots'::regclass
            and not trigger.tgisinternal
        )
        and pg_catalog.strpos(
          pg_catalog.pg_get_functiondef(
            'private.guard_personal_snapshot_write()'::regprocedure
          ),
          'is_safe_account_deletion_anonymization'
        ) > 0
        and pg_catalog.strpos(
          pg_catalog.pg_get_functiondef(
            'private.guard_personal_snapshot_write()'::regprocedure
          ),
          'pg_trigger_depth() > 1'
        ) > 0 as personal_snapshot_guard_ready,
      to_regprocedure(
        'private.has_valid_shared_event_transfer_totals(jsonb)'
      ) is not null
        and to_regprocedure(
          'private.has_authorized_transfer_status_changes(jsonb,jsonb,text)'
        ) is not null
        and to_regprocedure(
          'private.guard_shared_event_financial_integrity()'
        ) is not null
        and exists (
          select 1
          from pg_catalog.pg_trigger as trigger
          where trigger.tgname = 'guard_shared_event_financial_integrity'
            and trigger.tgrelid = 'public.app_snapshots'::regclass
            and not trigger.tgisinternal
        ) as shared_financial_guard_ready,
      (
        select relation.relrowsecurity and relation.relforcerowsecurity
        from pg_catalog.pg_class as relation
        where relation.oid = 'private.signup_workspace_claims'::regclass
      ) as signup_claims_rls_ready,
      not pg_catalog.has_schema_privilege('anon', 'private', 'usage')
        and not pg_catalog.has_schema_privilege('authenticated', 'private', 'usage')
        and not pg_catalog.has_table_privilege(
          'anon', 'private.signup_workspace_claims', 'select'
        )
        and not pg_catalog.has_table_privilege(
          'authenticated', 'private.signup_workspace_claims', 'select'
        ) as signup_claims_private,
      to_regprocedure('private.claim_signup_workspace()') is not null
        and exists (
          select 1
          from pg_catalog.pg_trigger as trigger
          where trigger.tgname = 'claim_signup_workspace_on_user_create'
            and trigger.tgrelid = 'auth.users'::regclass
            and not trigger.tgisinternal
        ) as signup_claim_trigger_ready,
      not pg_catalog.has_function_privilege(
        'anon', 'private.claim_signup_workspace()', 'execute'
      ) and not pg_catalog.has_function_privilege(
        'authenticated', 'private.claim_signup_workspace()', 'execute'
      ) as signup_claim_function_private,
      exists (
        select 1
        from pg_catalog.pg_policies as policy
        where policy.schemaname = 'public'
          and policy.tablename = 'app_snapshots'
          and policy.policyname = 'app_snapshots_update'
          and pg_catalog.lower(policy.qual) like '%owner_user_id is null%'
          and pg_catalog.lower(policy.qual) like '%snapshot_kind = ''workspace''%'
          and pg_catalog.lower(policy.qual) not like '%shared_event%'
          and pg_catalog.lower(policy.qual) not like '%can_bootstrap_shared_snapshot%'
          and pg_catalog.lower(policy.with_check) like '%owner_user_id is null%'
          and pg_catalog.lower(policy.with_check) like '%snapshot_kind = ''workspace''%'
          and pg_catalog.lower(policy.with_check) not like '%shared_event%'
          and pg_catalog.lower(policy.with_check) not like '%can_bootstrap_shared_snapshot%'
      ) as shared_snapshot_policy_ready,
      exists (
        select 1
        from pg_catalog.pg_policies as policy
        where policy.schemaname = 'public'
          and policy.tablename = 'app_snapshots'
          and policy.policyname = 'app_snapshots_select'
          and pg_catalog.lower(policy.qual) like '%owner_user_id is null%'
          and pg_catalog.lower(policy.qual) like '%snapshot_kind = ''workspace''%'
      ) and exists (
        select 1
        from pg_catalog.pg_policies as policy
        where policy.schemaname = 'public'
          and policy.tablename = 'app_snapshots'
          and policy.policyname = 'app_snapshots_member_select'
          and pg_catalog.lower(policy.qual) like '%snapshot_kind = ''shared_event''%'
          and pg_catalog.lower(policy.qual) like '%can_write_shared_snapshot%'
      ) as shared_read_policy_ready,
      to_regprocedure('public.can_bootstrap_shared_snapshot(text)') is not null
        and not pg_catalog.has_function_privilege(
          'anon', 'public.can_bootstrap_shared_snapshot(text)', 'execute'
        )
        and not pg_catalog.has_function_privilege(
          'authenticated', 'public.can_bootstrap_shared_snapshot(text)', 'execute'
        ) as shared_bootstrap_ready,
      to_regprocedure('public.join_shared_event(text)') is not null
        and not pg_catalog.has_function_privilege(
          'anon', 'public.join_shared_event(text)', 'execute'
        )
        and pg_catalog.has_function_privilege(
          'authenticated', 'public.join_shared_event(text)', 'execute'
        )
        and pg_catalog.strpos(
          pg_catalog.pg_get_functiondef(
            'public.join_shared_event(text)'::regprocedure
          ),
          'request_space_key_hash'
        ) = 0
        and pg_catalog.strpos(
          pg_catalog.pg_get_functiondef(
            'public.join_shared_event(text)'::regprocedure
          ),
          'existing_member.status <> ''active'''
        ) > 0 as shared_join_ready,
      to_regprocedure(
        'public.create_shared_event_snapshot(text,text,jsonb)'
      ) is not null
        and not pg_catalog.has_function_privilege(
          'anon',
          'public.create_shared_event_snapshot(text,text,jsonb)',
          'execute'
        )
        and pg_catalog.has_function_privilege(
          'authenticated',
          'public.create_shared_event_snapshot(text,text,jsonb)',
          'execute'
        ) and pg_catalog.strpos(
          pg_catalog.pg_get_functiondef(
            'public.create_shared_event_snapshot(text,text,jsonb)'::regprocedure
          ),
          'is_valid_shared_event_financials'
        ) > 0 as shared_creation_ready,
      to_regprocedure(
        'public.update_shared_event_snapshot(text,text,timestamptz,jsonb)'
      ) is not null
        and not pg_catalog.has_function_privilege(
          'anon',
          'public.update_shared_event_snapshot(text,text,timestamptz,jsonb)',
          'execute'
        )
        and pg_catalog.has_function_privilege(
          'authenticated',
          'public.update_shared_event_snapshot(text,text,timestamptz,jsonb)',
          'execute'
        )
        and pg_catalog.strpos(
          pg_catalog.pg_get_functiondef(
            'public.update_shared_event_snapshot(text,text,timestamptz,jsonb)'::regprocedure
          ),
          '''status'', ''conflict'''
        ) > 0 as shared_atomic_update_ready,
      pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(
          'private.guard_shared_snapshot_update()'::regprocedure
        ),
        '''updatedAt'''
      ) > 0
        and pg_catalog.strpos(
          pg_catalog.pg_get_functiondef(
            'private.guard_shared_snapshot_update()'::regprocedure
          ),
          'not actor_is_adding_offline_guests'
        ) > 0 as shared_member_content_ready,
      to_regprocedure(
        'private.is_safe_self_profile_update(jsonb,jsonb,text)'
      ) is not null
        and not pg_catalog.has_function_privilege(
          'anon',
          'private.is_safe_self_profile_update(jsonb,jsonb,text)',
          'execute'
        )
        and not pg_catalog.has_function_privilege(
          'authenticated',
          'private.is_safe_self_profile_update(jsonb,jsonb,text)',
          'execute'
        )
        and pg_catalog.strpos(
          pg_catalog.pg_get_functiondef(
            'private.guard_shared_snapshot_update()'::regprocedure
          ),
          'actor_is_updating_own_profile'
        ) > 0 as shared_self_profile_ready,
      to_regprocedure(
        'public.redeem_event_invite_membership(uuid,text,uuid)'
      ) is not null
        and not pg_catalog.has_function_privilege(
          'anon',
          'public.redeem_event_invite_membership(uuid,text,uuid)',
          'execute'
        )
        and not pg_catalog.has_function_privilege(
          'authenticated',
          'public.redeem_event_invite_membership(uuid,text,uuid)',
          'execute'
        )
        and pg_catalog.has_function_privilege(
          'service_role',
          'public.redeem_event_invite_membership(uuid,text,uuid)',
          'execute'
        ) as event_invite_membership_redeem_ready,
      exists (
        select 1
        from pg_catalog.pg_trigger as trigger
        where trigger.tgname = 'guard_shared_snapshot_update'
          and trigger.tgrelid = 'public.app_snapshots'::regclass
          and not trigger.tgisinternal
      ) and exists (
        select 1
        from pg_catalog.pg_trigger as trigger
        where trigger.tgname = 'sync_shared_snapshot_members'
          and trigger.tgrelid = 'public.app_snapshots'::regclass
          and not trigger.tgisinternal
      ) as shared_membership_triggers_ready,
      to_regprocedure('public.delete_account_data(uuid)') is not null as deletion_ready,
      exists (
        select 1
        from pg_catalog.pg_trigger as trigger
        where trigger.tgname = 'anonymize_account_before_delete'
          and trigger.tgrelid = 'auth.users'::regclass
          and not trigger.tgisinternal
      ) as deletion_trigger_ready,
      to_regclass('public.user_profiles') is not null as profiles_ready,
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'user_profiles'
          and column_name = 'username_customized'
          and data_type = 'boolean'
          and is_nullable = 'NO'
      ) as profile_username_state_ready,
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'user_profiles'
          and column_name = 'avatar_image_updated_at'
          and data_type = 'timestamp with time zone'
      ) and exists (
        select 1
        from pg_catalog.pg_trigger as trigger
        where trigger.tgname = 'preserve_versioned_profile_avatar'
          and trigger.tgrelid = 'public.user_profiles'::regclass
          and not trigger.tgisinternal
      ) as profile_avatar_version_ready,
      to_regclass('public.friend_invite_codes') is not null as invite_codes_ready,
      to_regclass('public.friendships') is not null as friendships_ready,
      to_regclass('public.user_blocks') is not null as user_blocks_ready,
      to_regclass('public.content_reports') is not null as content_reports_ready,
      to_regclass('public.push_devices') is not null as push_devices_ready,
      to_regclass('public.payment_reminders') is not null as payment_reminders_ready,
      to_regclass('public.event_invite_tokens') is not null
        as event_invite_tokens_ready,
      to_regclass('public.event_activity_notifications') is not null
        as event_activity_notifications_ready,
      to_regclass('public.notification_inbox') is not null
        as notification_inbox_ready,
      to_regclass('public.app_feedback') is not null
        as app_feedback_ready,
      to_regclass('public.product_metrics') is not null
        as product_metrics_ready,
      to_regclass('public.referrals') is not null as referrals_ready,
      to_regclass('public.user_entitlements') is not null as entitlements_ready,
      to_regclass('public.subscription_purchases') is not null as subscriptions_ready,
      (
        select relation.relrowsecurity and relation.relforcerowsecurity
        from pg_catalog.pg_class as relation
        where relation.oid = 'public.subscription_purchases'::regclass
      ) as subscription_rls_ready,
      not pg_catalog.has_table_privilege(
        'authenticated',
        'public.subscription_purchases',
        'select'
      ) and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.subscription_purchases',
        'insert'
      ) and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.subscription_purchases',
        'update'
      ) and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.subscription_purchases',
        'delete'
      ) as subscription_client_locked,
      to_regprocedure('public.request_friendship(text)') is not null as request_ready,
      pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(
          'public.request_friendship(text)'::regprocedure
        ),
        'pg_advisory_xact_lock'
      ) > 0 as friendship_pair_lock_ready,
      to_regprocedure('public.request_friendship_by_username(text)') is not null
        as username_request_ready,
      to_regprocedure('public.request_friendship_from_event(text,uuid)') is not null
        as event_friend_request_ready,
      to_regprocedure('public.set_friend_username(text)') is not null
        as username_update_ready,
      pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(
          'public.set_friend_username(text)'::regprocedure
        ),
        'else profile.updated_at'
      ) > 0 as stable_username_timestamp_ready,
      to_regprocedure('public.manage_friendship(uuid,text)') is not null as management_ready,
      to_regprocedure('public.block_user(uuid)') is not null as block_user_ready,
      to_regprocedure('public.unblock_user(uuid)') is not null as unblock_user_ready,
      to_regprocedure('public.submit_user_report(text,uuid,text,text)') is not null
        as submit_user_report_ready,
      (
        select pg_catalog.bool_and(
          relation.relrowsecurity and relation.relforcerowsecurity
        )
        from pg_catalog.pg_class as relation
        where relation.oid in (
          'public.user_blocks'::regclass,
          'public.content_reports'::regclass
        )
      ) as safety_rls_ready,
      not pg_catalog.has_table_privilege(
        'authenticated', 'public.user_blocks', 'insert'
      ) and not pg_catalog.has_table_privilege(
        'authenticated', 'public.user_blocks', 'update'
      ) and not pg_catalog.has_table_privilege(
        'authenticated', 'public.user_blocks', 'delete'
      ) and not pg_catalog.has_table_privilege(
        'authenticated', 'public.content_reports', 'insert'
      ) and not pg_catalog.has_table_privilege(
        'authenticated', 'public.content_reports', 'update'
      ) and not pg_catalog.has_table_privilege(
        'authenticated', 'public.content_reports', 'delete'
      ) as safety_client_mutation_locked,
      pg_catalog.has_function_privilege(
        'authenticated', 'public.block_user(uuid)', 'execute'
      ) and pg_catalog.has_function_privilege(
        'authenticated', 'public.unblock_user(uuid)', 'execute'
      ) and pg_catalog.has_function_privilege(
        'authenticated',
        'public.submit_user_report(text,uuid,text,text)',
        'execute'
      ) and not pg_catalog.has_function_privilege(
        'anon', 'public.block_user(uuid)', 'execute'
      ) and not pg_catalog.has_function_privilege(
        'anon', 'public.unblock_user(uuid)', 'execute'
      ) and not pg_catalog.has_function_privilege(
        'anon',
        'public.submit_user_report(text,uuid,text,text)',
        'execute'
      ) as safety_function_access_ready,
      pg_catalog.strpos(
        pg_catalog.pg_get_functiondef('public.block_user(uuid)'::regprocedure),
        'has_known_relationship'
      ) > 0 as block_relationship_ready,
      to_regprocedure('public.register_push_device(text,text,jsonb,text)') is not null as push_register_ready,
      to_regprocedure('public.disable_push_device(text)') is not null as push_disable_ready,
      to_regprocedure(
        'public.reserve_payment_reminder(text,text,uuid,uuid,integer)'
      ) is not null as payment_reminder_reserve_ready,
      to_regprocedure(
        'public.rotate_open_event_invite(text,uuid,text,text,text,timestamptz)'
      ) is not null as event_invite_rotation_ready,
      to_regclass('public.event_invite_tokens_one_open_link_idx') is not null
        and to_regclass(
          'public.event_invite_tokens_one_open_link_per_creator_idx'
        ) is null as event_open_invite_index_ready,
      to_regprocedure(
        'public.rotate_private_event_invite(text,uuid,uuid,text,text,text,timestamptz,timestamptz)'
      ) is not null as private_event_invite_rotation_ready,
      to_regprocedure(
        'public.reserve_event_activity_notification(text,text,text,uuid,uuid,integer)'
      ) is not null as event_activity_notification_reserve_ready,
      (
        select relation.relrowsecurity and relation.relforcerowsecurity
        from pg_catalog.pg_class as relation
        where relation.oid = 'public.payment_reminders'::regclass
      ) as payment_reminder_rls_ready,
      not pg_catalog.has_table_privilege(
        'authenticated',
        'public.payment_reminders',
        'select'
      ) and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.payment_reminders',
        'insert'
      ) and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.payment_reminders',
        'update'
      ) and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.payment_reminders',
        'delete'
      ) as payment_reminder_client_locked,
      not pg_catalog.has_function_privilege(
        'authenticated',
        'public.reserve_payment_reminder(text,text,uuid,uuid,integer)',
        'execute'
      ) and not pg_catalog.has_function_privilege(
        'anon',
        'public.reserve_payment_reminder(text,text,uuid,uuid,integer)',
        'execute'
      ) and pg_catalog.has_function_privilege(
        'service_role',
        'public.reserve_payment_reminder(text,text,uuid,uuid,integer)',
        'execute'
      ) as payment_reminder_function_locked,
      (
        select relation.relrowsecurity and relation.relforcerowsecurity
        from pg_catalog.pg_class as relation
        where relation.oid = 'public.event_invite_tokens'::regclass
      ) as event_invite_tokens_rls_ready,
      not pg_catalog.has_table_privilege(
        'authenticated',
        'public.event_invite_tokens',
        'select'
      ) and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.event_invite_tokens',
        'insert'
      ) and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.event_invite_tokens',
        'update'
      ) and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.event_invite_tokens',
        'delete'
      ) and not pg_catalog.has_table_privilege(
        'anon',
        'public.event_invite_tokens',
        'select'
      ) as event_invite_tokens_client_locked,
      not pg_catalog.has_function_privilege(
        'authenticated',
        'public.rotate_open_event_invite(text,uuid,text,text,text,timestamptz)',
        'execute'
      ) and not pg_catalog.has_function_privilege(
        'anon',
        'public.rotate_open_event_invite(text,uuid,text,text,text,timestamptz)',
        'execute'
      ) and pg_catalog.has_function_privilege(
        'service_role',
        'public.rotate_open_event_invite(text,uuid,text,text,text,timestamptz)',
        'execute'
      ) as event_invite_rotation_locked,
      not pg_catalog.has_function_privilege(
        'authenticated',
        'public.rotate_private_event_invite(text,uuid,uuid,text,text,text,timestamptz,timestamptz)',
        'execute'
      ) and not pg_catalog.has_function_privilege(
        'anon',
        'public.rotate_private_event_invite(text,uuid,uuid,text,text,text,timestamptz,timestamptz)',
        'execute'
      ) and pg_catalog.has_function_privilege(
        'service_role',
        'public.rotate_private_event_invite(text,uuid,uuid,text,text,text,timestamptz,timestamptz)',
        'execute'
      ) as private_event_invite_rotation_locked,
      (
        select relation.relrowsecurity and relation.relforcerowsecurity
        from pg_catalog.pg_class as relation
        where relation.oid = 'public.event_activity_notifications'::regclass
      ) as event_activity_notification_rls_ready,
      not pg_catalog.has_table_privilege(
        'authenticated',
        'public.event_activity_notifications',
        'select'
      ) and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.event_activity_notifications',
        'insert'
      ) and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.event_activity_notifications',
        'update'
      ) and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.event_activity_notifications',
        'delete'
      ) as event_activity_notification_client_locked,
      not pg_catalog.has_function_privilege(
        'authenticated',
        'public.reserve_event_activity_notification(text,text,text,uuid,uuid,integer)',
        'execute'
      ) and not pg_catalog.has_function_privilege(
        'anon',
        'public.reserve_event_activity_notification(text,text,text,uuid,uuid,integer)',
        'execute'
      ) and pg_catalog.has_function_privilege(
        'service_role',
        'public.reserve_event_activity_notification(text,text,text,uuid,uuid,integer)',
        'execute'
      ) as event_activity_notification_function_locked,
      (
        select relation.relrowsecurity and relation.relforcerowsecurity
        from pg_catalog.pg_class as relation
        where relation.oid = 'public.notification_inbox'::regclass
      ) as notification_inbox_rls_ready,
      pg_catalog.has_table_privilege(
        'authenticated',
        'public.notification_inbox',
        'select'
      ) and pg_catalog.has_column_privilege(
        'authenticated',
        'public.notification_inbox',
        'read_at',
        'update'
      ) and not pg_catalog.has_column_privilege(
        'authenticated',
        'public.notification_inbox',
        'title',
        'update'
      ) and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.notification_inbox',
        'insert'
      ) and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.notification_inbox',
        'delete'
      ) as notification_inbox_client_access_ready,
      to_regclass('private.shared_snapshot_tombstone_recipients') is not null
        and exists (
          select 1
          from pg_catalog.pg_attribute
          where attrelid = 'private.shared_snapshot_members'::regclass
            and attname = 'pending_join_until'
            and not attisdropped
        )
        and exists (
          select 1
          from pg_catalog.pg_trigger
          where tgname = 'capture_shared_snapshot_tombstone_recipients'
            and tgrelid = 'public.app_snapshots'::regclass
            and not tgisinternal
        ) as shared_tombstone_join_protection_ready,
      exists (
        select 1
        from pg_catalog.pg_trigger
        where tgname = 'guard_initial_paid_transfer_attribution'
          and tgrelid = 'public.app_snapshots'::regclass
          and not tgisinternal
      ) as initial_transfer_attribution_guard_ready,
      to_regclass('private.api_rate_limit_buckets') is not null
        and to_regprocedure(
          'public.reserve_sensitive_api_capacity(text,text[],integer,integer,integer)'
        ) is not null
        and not pg_catalog.has_function_privilege(
          'anon',
          'public.reserve_sensitive_api_capacity(text,text[],integer,integer,integer)',
          'execute'
        )
        and not pg_catalog.has_function_privilege(
          'authenticated',
          'public.reserve_sensitive_api_capacity(text,text[],integer,integer,integer)',
          'execute'
        )
        and pg_catalog.has_function_privilege(
          'service_role',
          'public.reserve_sensitive_api_capacity(text,text[],integer,integer,integer)',
          'execute'
        ) as sensitive_api_rate_limit_ready,
      (
        select relation.relrowsecurity and relation.relforcerowsecurity
        from pg_catalog.pg_class as relation
        where relation.oid = 'public.app_feedback'::regclass
      ) as app_feedback_rls_ready,
      not pg_catalog.has_table_privilege(
        'authenticated',
        'public.app_feedback',
        'insert'
      ) and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.app_feedback',
        'select'
      ) and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.app_feedback',
        'update'
      ) and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.app_feedback',
        'delete'
      )
        and to_regprocedure('public.submit_app_feedback(text,text,jsonb)') is not null
        and not pg_catalog.has_function_privilege(
          'anon', 'public.submit_app_feedback(text,text,jsonb)', 'execute'
        )
        and pg_catalog.has_function_privilege(
          'authenticated', 'public.submit_app_feedback(text,text,jsonb)', 'execute'
        ) as app_feedback_client_access_ready,
      to_regclass('private.friend_request_attempts') is not null
        and to_regprocedure(
          'private.reserve_friend_request_capacity(uuid,uuid)'
        ) is not null
        and pg_catalog.strpos(
          pg_catalog.pg_get_functiondef(
            'public.request_friendship(text)'::regprocedure
          ),
          'reserve_friend_request_capacity'
        ) > 0 as friend_request_abuse_protection_ready,
      to_regprocedure(
        'public.verify_shared_event_invitation_parties(text,uuid,uuid)'
      ) is not null
        and not pg_catalog.has_function_privilege(
          'anon',
          'public.verify_shared_event_invitation_parties(text,uuid,uuid)',
          'execute'
        )
        and not pg_catalog.has_function_privilege(
          'authenticated',
          'public.verify_shared_event_invitation_parties(text,uuid,uuid)',
          'execute'
        )
        and pg_catalog.has_function_privilege(
          'service_role',
          'public.verify_shared_event_invitation_parties(text,uuid,uuid)',
          'execute'
        ) as invitation_party_verification_ready,
      exists (
        select 1
        from pg_catalog.pg_indexes
        where schemaname = 'public'
          and indexname = 'event_invite_tokens_one_open_link_idx'
          and indexdef like '%(space_id, event_id)%'
      ) and exists (
        select 1
        from pg_catalog.pg_indexes
        where schemaname = 'public'
          and indexname = 'event_invite_tokens_one_private_link_idx'
          and indexdef like '%(space_id, event_id, created_by, recipient_user_id)%'
      ) as invite_namespace_ready,
      pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(
          'public.register_push_device(text,text,jsonb,text)'::regprocedure
        ),
        'offset 8'
      ) > 0
        and pg_catalog.strpos(
          pg_catalog.pg_get_functiondef(
            'private.prune_revoked_event_invites()'::regprocedure
          ),
          'offset 200'
        ) > 0 as bounded_push_and_invite_retention_ready,
      (
        select relation.relrowsecurity and relation.relforcerowsecurity
        from pg_catalog.pg_class as relation
        where relation.oid = 'public.product_metrics'::regclass
      ) as product_metrics_rls_ready,
      not pg_catalog.has_table_privilege(
        'anon',
        'public.product_metrics',
        'select'
      ) and not pg_catalog.has_table_privilege(
        'anon',
        'public.product_metrics',
        'insert'
      ) and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.product_metrics',
        'select'
      ) and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.product_metrics',
        'insert'
      ) and pg_catalog.has_table_privilege(
        'service_role',
        'public.product_metrics',
        'select'
      ) and pg_catalog.has_table_privilege(
        'service_role',
        'public.product_metrics',
        'insert'
      ) and pg_catalog.has_table_privilege(
        'service_role',
        'public.product_metrics',
        'delete'
      ) as product_metrics_client_locked,
      not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'product_metrics'
          and column_name in ('user_id', 'account_id', 'email')
      ) and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'product_metrics'
          and column_name = 'session_id'
          and data_type = 'uuid'
      ) as product_metrics_anonymous_ready,
      to_regclass('private.product_metric_rate_limits') is not null
        and to_regprocedure(
          'public.reserve_product_metric_batch(uuid,integer,integer,integer)'
        ) is not null
        and not pg_catalog.has_function_privilege(
          'authenticated',
          'public.reserve_product_metric_batch(uuid,integer,integer,integer)',
          'execute'
        )
        and pg_catalog.has_function_privilege(
          'service_role',
          'public.reserve_product_metric_batch(uuid,integer,integer,integer)',
          'execute'
        ) as product_metrics_rate_limit_ready,
      exists (
        select 1
        from pg_catalog.pg_trigger as trigger
        where trigger.tgrelid = 'public.app_snapshots'::regclass
          and trigger.tgname = 'revoke_event_invites_after_member_removal'
          and not trigger.tgisinternal
      ) as removed_member_invites_revoked,
      to_regprocedure('public.admin_analytics_overview(integer)') is not null
        and not pg_catalog.has_function_privilege(
          'anon',
          'public.admin_analytics_overview(integer)',
          'execute'
        )
        and not pg_catalog.has_function_privilege(
          'authenticated',
          'public.admin_analytics_overview(integer)',
          'execute'
        )
        and pg_catalog.has_function_privilege(
          'service_role',
          'public.admin_analytics_overview(integer)',
          'execute'
        ) as admin_analytics_function_locked,
      to_regprocedure('public.claim_referral(text)') is not null as referral_claim_ready,
      to_regprocedure('public.qualify_referral(text)') is not null as referral_qualify_ready,
      to_regprocedure('public.get_referral_program_status()') is not null as referral_status_ready,
      pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(
          'public.claim_referral(text)'::regprocedure
        ),
        'interval ''1 hour'''
      ) > 0
      and pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(
          'public.claim_referral(text)'::regprocedure
        ),
        'actor_is_anonymous'
      ) > 0
      and pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(
          'public.qualify_referral(text)'::regprocedure
        ),
        'referral.claimed_at > account_created_at + interval ''1 hour'''
      ) > 0
      and pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(
          'public.qualify_referral(text)'::regprocedure
        ),
        'account_is_anonymous'
      ) > 0 as referral_new_account_guard_ready,
      not pg_catalog.has_table_privilege(
        'authenticated',
        'public.referrals',
        'insert'
      ) and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.referrals',
        'update'
      ) and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.referrals',
        'delete'
      ) and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.user_entitlements',
        'insert'
      ) and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.user_entitlements',
        'update'
      ) and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.user_entitlements',
        'delete'
      ) as referral_tables_client_locked,
      not pg_catalog.has_function_privilege(
        'anon',
        'public.claim_referral(text)',
        'execute'
      ) and pg_catalog.has_function_privilege(
        'authenticated',
        'public.claim_referral(text)',
        'execute'
      ) and not pg_catalog.has_function_privilege(
        'anon',
        'public.qualify_referral(text)',
        'execute'
      ) and pg_catalog.has_function_privilege(
        'authenticated',
        'public.qualify_referral(text)',
        'execute'
      ) and not pg_catalog.has_function_privilege(
        'anon',
        'public.get_referral_program_status()',
        'execute'
      ) and pg_catalog.has_function_privilege(
        'authenticated',
        'public.get_referral_program_status()',
        'execute'
      ) as referral_function_access_ready,
      to_regprocedure(
        'public.record_verified_subscription(uuid,text,text,text,text,timestamptz,boolean,text,timestamptz)'
      ) is not null as subscription_record_ready,
      not pg_catalog.has_function_privilege(
        'authenticated',
        'public.record_verified_subscription(uuid,text,text,text,text,timestamptz,boolean,text,timestamptz)',
        'execute'
      ) and not pg_catalog.has_function_privilege(
        'anon',
        'public.record_verified_subscription(uuid,text,text,text,text,timestamptz,boolean,text,timestamptz)',
        'execute'
      ) and pg_catalog.has_function_privilege(
        'service_role',
        'public.record_verified_subscription(uuid,text,text,text,text,timestamptz,boolean,text,timestamptz)',
        'execute'
      ) as subscription_function_locked
  `;
  if (
    !result?.table_ready ||
    !result?.signup_claims_ready ||
    !result?.shared_members_ready ||
    !result?.trusted_shared_activity_ready ||
    !result?.personal_snapshot_guard_ready ||
    !result?.shared_financial_guard_ready ||
    !result?.signup_claims_rls_ready ||
    !result?.signup_claims_private ||
    !result?.signup_claim_trigger_ready ||
    !result?.signup_claim_function_private ||
    !result?.shared_snapshot_policy_ready ||
    !result?.shared_read_policy_ready ||
    !result?.shared_bootstrap_ready ||
    !result?.shared_join_ready ||
    !result?.shared_creation_ready ||
    !result?.shared_atomic_update_ready ||
    !result?.shared_member_content_ready ||
    !result?.shared_self_profile_ready ||
    !result?.event_invite_membership_redeem_ready ||
    !result?.shared_membership_triggers_ready ||
    !result?.deletion_ready ||
    !result?.deletion_trigger_ready ||
    !result?.profiles_ready ||
    !result?.profile_username_state_ready ||
    !result?.profile_avatar_version_ready ||
    !result?.invite_codes_ready ||
    !result?.friendships_ready ||
    !result?.user_blocks_ready ||
    !result?.content_reports_ready ||
    !result?.push_devices_ready ||
    !result?.payment_reminders_ready ||
    !result?.event_invite_tokens_ready ||
    !result?.event_activity_notifications_ready ||
    !result?.notification_inbox_ready ||
    !result?.app_feedback_ready ||
    !result?.product_metrics_ready ||
    !result?.referrals_ready ||
    !result?.entitlements_ready ||
    !result?.subscriptions_ready ||
    !result?.subscription_rls_ready ||
    !result?.subscription_client_locked ||
    !result?.request_ready ||
    !result?.friendship_pair_lock_ready ||
    !result?.username_request_ready ||
    !result?.event_friend_request_ready ||
    !result?.username_update_ready ||
    !result?.stable_username_timestamp_ready ||
    !result?.management_ready ||
    !result?.block_user_ready ||
    !result?.unblock_user_ready ||
    !result?.submit_user_report_ready ||
    !result?.safety_rls_ready ||
    !result?.safety_client_mutation_locked ||
    !result?.safety_function_access_ready ||
    !result?.block_relationship_ready ||
    !result?.push_register_ready ||
    !result?.push_disable_ready ||
    !result?.payment_reminder_reserve_ready ||
    !result?.event_invite_rotation_ready ||
    !result?.event_open_invite_index_ready ||
    !result?.private_event_invite_rotation_ready ||
    !result?.event_activity_notification_reserve_ready ||
    !result?.payment_reminder_rls_ready ||
    !result?.payment_reminder_client_locked ||
    !result?.payment_reminder_function_locked ||
    !result?.event_invite_tokens_rls_ready ||
    !result?.event_invite_tokens_client_locked ||
    !result?.event_invite_rotation_locked ||
    !result?.private_event_invite_rotation_locked ||
    !result?.event_activity_notification_rls_ready ||
    !result?.event_activity_notification_client_locked ||
    !result?.event_activity_notification_function_locked ||
    !result?.notification_inbox_rls_ready ||
    !result?.notification_inbox_client_access_ready ||
    !result?.shared_tombstone_join_protection_ready ||
    !result?.initial_transfer_attribution_guard_ready ||
    !result?.sensitive_api_rate_limit_ready ||
    !result?.app_feedback_rls_ready ||
    !result?.app_feedback_client_access_ready ||
    !result?.friend_request_abuse_protection_ready ||
    !result?.invitation_party_verification_ready ||
    !result?.invite_namespace_ready ||
    !result?.bounded_push_and_invite_retention_ready ||
    !result?.product_metrics_rls_ready ||
    !result?.product_metrics_client_locked ||
    !result?.product_metrics_anonymous_ready ||
    !result?.product_metrics_rate_limit_ready ||
    !result?.removed_member_invites_revoked ||
    !result?.admin_analytics_function_locked ||
    !result?.referral_claim_ready ||
    !result?.referral_qualify_ready ||
    !result?.referral_status_ready ||
    !result?.referral_new_account_guard_ready ||
    !result?.referral_tables_client_locked ||
    !result?.referral_function_access_ready ||
    !result?.subscription_record_ready ||
    !result?.subscription_function_locked
  ) {
    throw new Error("Supabase schema verification failed");
  }
  console.log("Supabase schema is ready.");
} finally {
  await sql.end({ timeout: 5 });
}
