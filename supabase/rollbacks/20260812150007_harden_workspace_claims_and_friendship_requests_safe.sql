begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
begin
  if pg_catalog.to_regclass('private.signup_workspace_claims') is not null
    and exists (select 1 from private.signup_workspace_claims) then
    raise exception 'Rollback stopped: signup workspace claims are still pending';
  end if;
end;
$$;

drop trigger if exists claim_signup_workspace_on_user_create on auth.users;
drop function if exists private.claim_signup_workspace();
drop table if exists private.signup_workspace_claims;

commit;

-- This is intentionally a safe, partial rollback. The owner isolation policy and
-- reciprocal-friendship transaction lock remain in place because both changes are
-- backward-compatible security fixes. Restoring their previous definitions would
-- reopen the vulnerabilities that this migration closes.
