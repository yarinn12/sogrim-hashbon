begin;

alter table public.event_activity_notifications
  drop constraint if exists event_activity_notifications_kind_check;
alter table public.event_activity_notifications
  add constraint event_activity_notifications_kind_check
  check (kind in (
    'expense-created',
    'participant-joined',
    'event-invite',
    'event-closed'
  ));

alter table public.notification_inbox
  drop constraint if exists notification_inbox_kind_check;
alter table public.notification_inbox
  add constraint notification_inbox_kind_check
  check (kind in (
    'expense-created',
    'participant-joined',
    'event-invite',
    'event-closed',
    'payment-reminder'
  ));

create or replace function public.reserve_event_activity_notification(
  p_event_id text,
  p_activity_id text,
  p_kind text,
  p_sender_user_id uuid,
  p_recipient_user_id uuid,
  p_min_interval_seconds integer default 45
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  normalized_event_id text := pg_catalog.btrim(p_event_id);
  normalized_activity_id text := pg_catalog.btrim(p_activity_id);
  normalized_kind text := pg_catalog.btrim(p_kind);
  existing_status text;
  notification_id uuid;
  recent_notification_at timestamptz;
begin
  if normalized_event_id !~ '^[A-Za-z0-9_-]{1,128}$'
    or normalized_activity_id !~ '^[A-Za-z0-9_-]{1,128}$'
    or normalized_kind not in (
      'expense-created',
      'participant-joined',
      'event-invite',
      'event-closed'
    )
    or p_sender_user_id is null
    or p_recipient_user_id is null
    or p_sender_user_id = p_recipient_user_id
    or p_min_interval_seconds not between 0 and 600 then
    raise exception 'Invalid event activity notification reservation'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      normalized_event_id || ':' ||
      normalized_activity_id || ':' ||
      normalized_kind || ':' ||
      p_recipient_user_id::text,
      0
    )
  );

  select notification.status
  into existing_status
  from public.event_activity_notifications as notification
  where notification.event_id = normalized_event_id
    and notification.activity_id = normalized_activity_id
    and notification.kind = normalized_kind
    and notification.recipient_user_id = p_recipient_user_id
  limit 1;

  if existing_status is not null then
    return pg_catalog.jsonb_build_object(
      'allowed', false,
      'reason', 'duplicate'
    );
  end if;

  if p_min_interval_seconds > 0 then
    select notification.created_at
    into recent_notification_at
    from public.event_activity_notifications as notification
    where notification.event_id = normalized_event_id
      and notification.kind = normalized_kind
      and notification.recipient_user_id = p_recipient_user_id
      and notification.status in ('reserved', 'delivered')
      and notification.created_at >
        pg_catalog.now() - pg_catalog.make_interval(
          secs => p_min_interval_seconds
        )
    order by notification.created_at desc
    limit 1;
  end if;

  insert into public.event_activity_notifications (
    event_id,
    activity_id,
    kind,
    sender_user_id,
    recipient_user_id,
    status
  )
  values (
    normalized_event_id,
    normalized_activity_id,
    normalized_kind,
    p_sender_user_id,
    p_recipient_user_id,
    case
      when recent_notification_at is null then 'reserved'
      else 'suppressed'
    end
  )
  returning id into notification_id;

  if recent_notification_at is not null then
    return pg_catalog.jsonb_build_object(
      'allowed', false,
      'reason', 'rate-limited'
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'allowed', true,
    'notification_id', notification_id
  );
end;
$$;

revoke all on function public.reserve_event_activity_notification(
  text,
  text,
  text,
  uuid,
  uuid,
  integer
) from public, anon, authenticated;
grant execute on function public.reserve_event_activity_notification(
  text,
  text,
  text,
  uuid,
  uuid,
  integer
) to service_role;

commit;
