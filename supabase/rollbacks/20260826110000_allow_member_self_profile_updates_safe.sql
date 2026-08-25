begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Keep the guard definition intact and close the new capability immediately.
-- This restores the previous restrictive behavior without weakening any other
-- shared-event authorization rule.
create or replace function private.is_safe_self_profile_update(
  p_old_state jsonb,
  p_new_state jsonb,
  p_actor_participant_id text
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select false;
$$;

revoke all on function private.is_safe_self_profile_update(jsonb, jsonb, text)
  from public, anon, authenticated;

commit;
