begin;

do $$
declare
  target_user_id uuid;
  first_reservation boolean;
  limited_reservation boolean;
  function_source text;
begin
  select account.id into target_user_id
  from auth.users as account
  order by account.created_at
  limit 1;

  if target_user_id is null then
    raise exception 'Product metric clock verification requires one account';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.reserve_product_metric_batch(uuid,integer,integer,integer)'::regprocedure
  ) into function_source;

  if pg_catalog.strpos(function_source, 'current_timestamp_value timestamptz') = 0
    or function_source ~ E'\\mcurrent_time\\M' then
    raise exception 'Product metric rate-limit clock is still ambiguous';
  end if;

  delete from private.product_metric_rate_limits
  where user_id = target_user_id;

  first_reservation := public.reserve_product_metric_batch(
    target_user_id,
    1,
    60,
    20
  );
  if first_reservation is not true then
    raise exception 'The first product metric reservation was not allowed';
  end if;

  limited_reservation := public.reserve_product_metric_batch(
    target_user_id,
    20,
    60,
    20
  );
  if limited_reservation is not false then
    raise exception 'The product metric event limit was not enforced';
  end if;
end;
$$;

rollback;

select 'ready' as verification_status;
