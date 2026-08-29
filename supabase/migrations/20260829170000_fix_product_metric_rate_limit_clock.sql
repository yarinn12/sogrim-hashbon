begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.reserve_product_metric_batch(
  p_user_id uuid,
  p_event_count integer,
  p_window_seconds integer default 60,
  p_event_limit integer default 120
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  rate_limit private.product_metric_rate_limits%rowtype;
  current_timestamp_value timestamptz := pg_catalog.clock_timestamp();
begin
  if p_user_id is null
    or p_event_count not between 1 and 20
    or p_window_seconds not between 10 and 3600
    or p_event_limit not between 20 and 1000 then
    raise exception 'Invalid product metric capacity request'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('product-metrics:' || p_user_id::text, 0)
  );

  select record.* into rate_limit
  from private.product_metric_rate_limits as record
  where record.user_id = p_user_id
  for update;

  if rate_limit.user_id is null
    or rate_limit.window_started_at <= current_timestamp_value -
      pg_catalog.make_interval(secs => p_window_seconds) then
    insert into private.product_metric_rate_limits (
      user_id,
      window_started_at,
      event_count,
      updated_at
    ) values (
      p_user_id,
      current_timestamp_value,
      p_event_count,
      current_timestamp_value
    )
    on conflict (user_id) do update
    set
      window_started_at = excluded.window_started_at,
      event_count = excluded.event_count,
      updated_at = excluded.updated_at;
    return true;
  end if;

  if rate_limit.event_count + p_event_count > p_event_limit then
    return false;
  end if;

  update private.product_metric_rate_limits
  set
    event_count = event_count + p_event_count,
    updated_at = current_timestamp_value
  where user_id = p_user_id;
  return true;
end;
$$;

revoke all on function public.reserve_product_metric_batch(uuid, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_product_metric_batch(uuid, integer, integer, integer)
  to service_role;

commit;
