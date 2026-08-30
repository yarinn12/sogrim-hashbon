create or replace function public.admin_operational_health(
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
  deferred_operations as (
    select detail, pg_catalog.count(*)::bigint as deferred_count
    from window_metrics
    where event_name = 'operation_deferred'
    group by detail
    order by deferred_count desc, detail
  ),
  client_error_groups as (
    select platform, screen, pg_catalog.count(*)::bigint as error_count
    from window_metrics
    where event_name = 'client_error'
    group by platform, screen
    order by error_count desc, platform, screen
    limit 10
  ),
  delivery_health as (
    select
      pg_catalog.count(*) filter (
        where delivery.reserved_at >= pg_catalog.now()
          - pg_catalog.make_interval(days => parameters.window_days)
      )::bigint as reserved,
      pg_catalog.count(*) filter (
        where delivery.reserved_at >= pg_catalog.now()
          - pg_catalog.make_interval(days => parameters.window_days)
          and delivery.delivered_at is not null
      )::bigint as delivered,
      pg_catalog.count(*) filter (
        where delivery.delivered_at is null
          and delivery.reserved_at < pg_catalog.now() - interval '10 minutes'
      )::bigint as stale_pending
    from public.broadcast_notification_deliveries as delivery
    cross join parameters
  ),
  continuity_health as (
    select
      (select pg_catalog.max(snapshot.updated_at) from public.app_snapshots as snapshot)
        as latest_snapshot_at,
      (
        select pg_catalog.count(*)::bigint
        from auth.users as account
        where account.confirmed_at is not null
          and not exists (
          select 1
          from public.app_snapshots as workspace
          where workspace.owner_user_id = account.id
            and workspace.snapshot_kind = 'workspace'
        )
      ) as accounts_without_workspace,
      (
        select pg_catalog.count(*)::bigint
        from public.app_snapshots as snapshot
        where snapshot.snapshot_kind = 'shared_event'
          and pg_catalog.jsonb_typeof(snapshot.state -> 'events') = 'array'
          and pg_catalog.jsonb_array_length(snapshot.state -> 'events') = 1
          and exists (
            select 1
            from pg_catalog.jsonb_array_elements(
              case
                when pg_catalog.jsonb_typeof(snapshot.state -> 'participants') = 'array'
                  then snapshot.state -> 'participants'
                else '[]'::jsonb
              end
            ) as participant(value)
            join auth.users as account
              on participant.value ->> 'id' = 'account-' || account.id::text
          )
          and (
            exists (
              select 1
              from public.app_snapshots as workspace
              cross join lateral pg_catalog.jsonb_array_elements(
                case
                  when pg_catalog.jsonb_typeof(workspace.state -> 'events') = 'array'
                    then workspace.state -> 'events'
                  else '[]'::jsonb
                end
              ) as workspace_event(value)
              where workspace.snapshot_kind = 'workspace'
                and workspace_event.value ->> 'sharedSpaceId' = snapshot.id
            )
            or exists (
              select 1
              from public.event_invite_tokens as invite
              where invite.space_id = snapshot.id
                and invite.revoked_at is null
                and (invite.expires_at is null or invite.expires_at > pg_catalog.now())
            )
          )
          and not exists (
            select 1
            from private.shared_snapshot_members as member
            where member.snapshot_id = snapshot.id
              and member.status = 'active'
              and member.removed_at is null
          )
      ) as events_without_active_members
  )
  select pg_catalog.jsonb_build_object(
    'telemetry', pg_catalog.jsonb_build_object(
      'lastReceivedAt', (
        select pg_catalog.max(metric.received_at)
        from public.product_metrics as metric
      ),
      'eventsLast24Hours', (
        select pg_catalog.count(*)::bigint
        from public.product_metrics as metric
        where metric.received_at >= pg_catalog.now() - interval '24 hours'
      ),
      'failuresLast24Hours', (
        select pg_catalog.count(*)::bigint
        from public.product_metrics as metric
        where metric.event_name in ('client_error', 'operation_failure')
          and metric.received_at >= pg_catalog.now() - interval '24 hours'
      ),
      'deferredLast24Hours', (
        select pg_catalog.count(*)::bigint
        from public.product_metrics as metric
        where metric.event_name = 'operation_deferred'
          and metric.received_at >= pg_catalog.now() - interval '24 hours'
      ),
      'clientErrorsDuringWindow', (
        select pg_catalog.count(*)::bigint
        from window_metrics
        where event_name = 'client_error'
      )
    ),
    'pushDelivery', (
      select pg_catalog.jsonb_build_object(
        'reservedDuringWindow', reserved,
        'deliveredDuringWindow', delivered,
        'stalePending', stale_pending,
        'deliveryRate', case
          when reserved = 0 then null
          else pg_catalog.round(delivered::numeric / reserved, 4)
        end
      )
      from delivery_health
    ),
    'dataContinuity', (
      select pg_catalog.jsonb_build_object(
        'latestSnapshotAt', latest_snapshot_at,
        'accountsWithoutWorkspace', accounts_without_workspace,
        'eventsWithoutActiveMembers', events_without_active_members
      )
      from continuity_health
    ),
    'deferredOperations', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'operation', detail,
            'count', deferred_count
          )
          order by deferred_count desc, detail
        )
        from deferred_operations
      ),
      '[]'::jsonb
    ),
    'clientErrors', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'platform', platform,
            'screen', screen,
            'count', error_count
          )
          order by error_count desc, platform, screen
        )
        from client_error_groups
      ),
      '[]'::jsonb
    )
  )
  from parameters;
$$;

revoke all on function public.admin_operational_health(integer)
  from public, anon, authenticated;
grant execute on function public.admin_operational_health(integer)
  to service_role;
