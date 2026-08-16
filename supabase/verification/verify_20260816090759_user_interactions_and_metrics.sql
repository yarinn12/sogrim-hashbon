do $$
declare
  block_definition text;
  invite_trigger_definition text;
begin
  if to_regclass('private.product_metric_rate_limits') is null then
    raise exception 'Product metric rate-limit state is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class as relation
    where relation.oid = 'private.product_metric_rate_limits'::regclass
      and relation.relrowsecurity
      and relation.relforcerowsecurity
  ) then
    raise exception 'Product metric rate-limit state is not protected by forced RLS';
  end if;

  if to_regprocedure(
      'public.reserve_product_metric_batch(uuid,integer,integer,integer)'
    ) is null then
    raise exception 'Product metric rate-limit function is missing';
  end if;

  if has_function_privilege(
      'authenticated',
      'public.reserve_product_metric_batch(uuid,integer,integer,integer)',
      'EXECUTE'
    ) or has_function_privilege(
      'anon',
      'public.reserve_product_metric_batch(uuid,integer,integer,integer)',
      'EXECUTE'
    ) then
    raise exception 'Product metric rate-limit function is exposed to clients';
  end if;

  select pg_catalog.pg_get_functiondef('public.block_user(uuid)'::regprocedure)
  into block_definition;
  if block_definition not like '%has_known_relationship%'
    or block_definition not like '%shared_snapshot_members%'
    or block_definition not like '%friendships%' then
    raise exception 'Block-user relationship boundary is missing';
  end if;

  select pg_catalog.pg_get_triggerdef(trigger.oid)
  into invite_trigger_definition
  from pg_catalog.pg_trigger as trigger
  where trigger.tgrelid = 'public.app_snapshots'::regclass
    and trigger.tgname = 'revoke_event_invites_after_member_removal'
    and not trigger.tgisinternal;
  if invite_trigger_definition is null then
    raise exception 'Removed members do not revoke outstanding event invitations';
  end if;
end;
$$;

select 'ready' as verification_status;
