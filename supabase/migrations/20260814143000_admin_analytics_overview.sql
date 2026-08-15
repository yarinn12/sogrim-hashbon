create or replace function public.admin_analytics_overview(
  p_window_days integer default 30
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with parameters as (
    select least(
      90,
      greatest(1, coalesce(p_window_days, 30))
    )::integer as window_days
  ),
  window_metrics as (
    select metric.*
    from public.product_metrics as metric
    cross join parameters
    where metric.received_at >= pg_catalog.now()
      - pg_catalog.make_interval(days => parameters.window_days)
  ),
  metric_counts as (
    select event_name, pg_catalog.count(*)::bigint as event_count
    from window_metrics
    group by event_name
  ),
  session_health as (
    select
      pg_catalog.count(distinct session_id)::bigint as sessions,
      pg_catalog.count(distinct session_id) filter (
        where event_name in ('client_error', 'operation_failure')
      )::bigint as affected_sessions
    from window_metrics
    where session_id is not null
  ),
  platform_health as (
    select
      platform,
      pg_catalog.count(distinct session_id)::bigint as sessions,
      pg_catalog.count(distinct session_id) filter (
        where event_name in ('client_error', 'operation_failure')
      )::bigint as affected_sessions
    from window_metrics
    where session_id is not null
    group by platform
  ),
  operation_failures as (
    select detail, pg_catalog.count(*)::bigint as failure_count
    from window_metrics
    where event_name = 'operation_failure'
    group by detail
    order by failure_count desc, detail
  )
  select pg_catalog.jsonb_build_object(
    'generatedAt', pg_catalog.now(),
    'windowDays', parameters.window_days,
    'accounts', pg_catalog.jsonb_build_object(
      'registered', (select pg_catalog.count(*)::bigint from auth.users),
      'confirmed', (
        select pg_catalog.count(*)::bigint from auth.users where confirmed_at is not null
      ),
      'signedInDuringWindow', (
        select pg_catalog.count(*)::bigint
        from auth.users
        where last_sign_in_at >= pg_catalog.now()
          - pg_catalog.make_interval(days => parameters.window_days)
      )
    ),
    'storage', pg_catalog.jsonb_build_object(
      'workspaces', (
        select pg_catalog.count(*)::bigint
        from public.app_snapshots where snapshot_kind = 'workspace'
      ),
      'sharedEvents', (
        select pg_catalog.count(*)::bigint
        from public.app_snapshots where snapshot_kind = 'shared_event'
      ),
      'snapshotBytes', (
        select coalesce(pg_catalog.sum(pg_catalog.pg_column_size(state)), 0)::bigint
        from public.app_snapshots
      ),
      'databaseBytes', pg_catalog.pg_database_size(pg_catalog.current_database())::bigint
    ),
    'metrics', coalesce(
      (select pg_catalog.jsonb_object_agg(event_name, event_count) from metric_counts),
      '{}'::jsonb
    ),
    'sessions', (
      select pg_catalog.jsonb_build_object(
        'total', sessions,
        'affected', affected_sessions,
        'errorFreeRate', case
          when sessions = 0 then null
          else pg_catalog.round((sessions - affected_sessions)::numeric / sessions, 4)
        end
      )
      from session_health
    ),
    'platforms', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'platform', platform,
            'sessions', sessions,
            'affected', affected_sessions
          ) order by platform
        )
        from platform_health
      ),
      '[]'::jsonb
    ),
    'operationFailures', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object('operation', detail, 'count', failure_count)
          order by failure_count desc, detail
        )
        from operation_failures
      ),
      '[]'::jsonb
    )
  )
  from parameters;
$$;

revoke all on function public.admin_analytics_overview(integer)
  from public, anon, authenticated;
grant execute on function public.admin_analytics_overview(integer)
  to service_role;
