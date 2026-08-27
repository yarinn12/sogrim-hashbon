begin;

-- The trigger is attached to a public table but deliberately calls helpers in
-- the private schema. Run it as its trusted owner so authenticated clients do
-- not need (and must never receive) USAGE on the private schema.
alter function private.guard_shared_event_history_and_limits()
  security definer;

revoke all on function private.guard_shared_event_history_and_limits()
  from public, anon, authenticated;

commit;
