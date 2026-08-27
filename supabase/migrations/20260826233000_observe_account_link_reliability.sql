begin;

alter table public.product_metrics
  drop constraint if exists product_metrics_check;
alter table public.product_metrics
  add constraint product_metrics_check
  check (
    (event_name = 'event_created' and detail in ('standard', 'trip', 'restaurant'))
    or (
      event_name = 'client_error'
      and detail ~ '^(Error|TypeError|ReferenceError|RangeError|SyntaxError|ResourceError|UnhandledRejection):(app|public-layer|vendor|resource|unknown):[0-9]{1,6}(:[0-9]{1,6}:[0-9a-f]{8})?$'
    )
    or (
      event_name in ('operation_deferred', 'operation_failure')
      and detail ~ '^(auth|state_load|state_save|account_link|event_invite|friend_network|notification_inbox|feedback|push|ads|share)(:(offline|network|timeout|auth|permission|conflict|validation|storage|server|unavailable|unknown))?$'
    )
    or (
      event_name not in (
        'event_created',
        'client_error',
        'operation_deferred',
        'operation_failure'
      )
      and detail = ''
    )
  );

commit;
