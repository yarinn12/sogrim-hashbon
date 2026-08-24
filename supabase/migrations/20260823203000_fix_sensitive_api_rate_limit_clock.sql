begin;

create or replace function public.reserve_sensitive_api_capacity(
  p_namespace text,
  p_subject_hashes text[],
  p_client_limit integer,
  p_global_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_timestamp_value timestamptz := pg_catalog.clock_timestamp();
  window_start timestamptz;
  retry_after integer;
  global_count integer;
  subject_count integer;
  subject_hash_value text;
  normalized_subjects text[];
  global_hash constant text := '0000000000000000000000000000000000000000000000000000000000000000';
begin
  normalized_subjects := array(
    select distinct pg_catalog.lower(value)
    from pg_catalog.unnest(coalesce(p_subject_hashes, '{}'::text[])) as item(value)
    order by pg_catalog.lower(value)
  );

  if coalesce(p_namespace, '') !~ '^[a-z0-9:-]{3,160}$'
    or p_client_limit not between 1 and 10000
    or p_global_limit not between p_client_limit and 1000000
    or p_window_seconds not between 10 and 3600
    or coalesce(pg_catalog.array_length(normalized_subjects, 1), 0)
      not between 1 and 2
    or exists (
      select 1
      from pg_catalog.unnest(normalized_subjects) as item(value)
      where item.value !~ '^[a-f0-9]{64}$'
    ) then
    raise exception 'Invalid sensitive API capacity request'
      using errcode = '22023';
  end if;

  window_start := pg_catalog.to_timestamp(
    pg_catalog.floor(
      extract(epoch from current_timestamp_value) / p_window_seconds
    ) * p_window_seconds
  );
  retry_after := greatest(
    1,
    pg_catalog.ceil(
      extract(epoch from window_start +
        pg_catalog.make_interval(secs => p_window_seconds) - current_timestamp_value)
    )::integer
  );

  insert into private.api_rate_limit_buckets (
    namespace, subject_hash, window_started_at, request_count, updated_at
  ) values (
    p_namespace, global_hash, window_start, 1, current_timestamp_value
  )
  on conflict (namespace, subject_hash, window_started_at) do update
  set
    request_count = private.api_rate_limit_buckets.request_count + 1,
    updated_at = excluded.updated_at
  returning request_count into global_count;

  if global_count > p_global_limit then
    return pg_catalog.jsonb_build_object(
      'allowed', false,
      'retryAfterSeconds', retry_after
    );
  end if;

  foreach subject_hash_value in array normalized_subjects loop
    insert into private.api_rate_limit_buckets (
      namespace, subject_hash, window_started_at, request_count, updated_at
    ) values (
      p_namespace, subject_hash_value, window_start, 1, current_timestamp_value
    )
    on conflict (namespace, subject_hash, window_started_at) do update
    set
      request_count = private.api_rate_limit_buckets.request_count + 1,
      updated_at = excluded.updated_at
    returning request_count into subject_count;

    if subject_count > p_client_limit then
      return pg_catalog.jsonb_build_object(
        'allowed', false,
        'retryAfterSeconds', retry_after
      );
    end if;
  end loop;

  delete from private.api_rate_limit_buckets
  where window_started_at < current_timestamp_value - interval '2 days';

  return pg_catalog.jsonb_build_object(
    'allowed', true,
    'retryAfterSeconds', 0
  );
end;
$$;

revoke all on function public.reserve_sensitive_api_capacity(
  text, text[], integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.reserve_sensitive_api_capacity(
  text, text[], integer, integer, integer
) to service_role;

commit;
