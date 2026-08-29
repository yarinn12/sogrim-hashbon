create table if not exists public.broadcast_notification_deliveries (
  campaign_id text not null,
  device_id uuid not null references public.push_devices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reserved_at timestamptz not null default now(),
  delivered_at timestamptz,
  primary key (campaign_id, device_id),
  constraint broadcast_notification_campaign_id_check check (
    char_length(campaign_id) between 1 and 80
    and campaign_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'
  )
);

create index if not exists broadcast_notification_deliveries_user_idx
  on public.broadcast_notification_deliveries (user_id, reserved_at desc);

alter table public.broadcast_notification_deliveries enable row level security;
alter table public.broadcast_notification_deliveries force row level security;
revoke all on table public.broadcast_notification_deliveries from public, anon, authenticated;
grant select, insert, update, delete on table public.broadcast_notification_deliveries to service_role;
