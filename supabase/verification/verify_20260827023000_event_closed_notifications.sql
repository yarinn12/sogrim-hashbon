do $$
declare
  activity_constraint text;
  inbox_constraint text;
  reservation_function text;
begin
  select pg_catalog.pg_get_constraintdef(constraint_row.oid)
  into activity_constraint
  from pg_catalog.pg_constraint as constraint_row
  where constraint_row.conrelid = 'public.event_activity_notifications'::regclass
    and constraint_row.conname = 'event_activity_notifications_kind_check';

  select pg_catalog.pg_get_constraintdef(constraint_row.oid)
  into inbox_constraint
  from pg_catalog.pg_constraint as constraint_row
  where constraint_row.conrelid = 'public.notification_inbox'::regclass
    and constraint_row.conname = 'notification_inbox_kind_check';

  select pg_catalog.pg_get_functiondef(procedure_row.oid)
  into reservation_function
  from pg_catalog.pg_proc as procedure_row
  where procedure_row.oid = (
    'public.reserve_event_activity_notification(text,text,text,uuid,uuid,integer)'
  )::regprocedure;

  if activity_constraint is null
    or pg_catalog.strpos(activity_constraint, 'event-closed') = 0 then
    raise exception 'Event-close delivery is not accepted by the activity notification table';
  end if;

  if inbox_constraint is null
    or pg_catalog.strpos(inbox_constraint, 'event-closed') = 0 then
    raise exception 'Event-close delivery is not accepted by the notification inbox';
  end if;

  if reservation_function is null
    or pg_catalog.strpos(reservation_function, 'event-closed') = 0 then
    raise exception 'Event-close delivery cannot reserve a notification';
  end if;
end;
$$;

select 'ready' as verification_status;
