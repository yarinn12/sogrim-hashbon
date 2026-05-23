create table public.profiles (
  id uuid primary key,
  email text,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table public.app_snapshots (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_snapshots enable row level security;

create policy "app_snapshots_select"
  on public.app_snapshots
  for select
  using (true);

create policy "app_snapshots_insert"
  on public.app_snapshots
  for insert
  with check (true);

create policy "app_snapshots_update"
  on public.app_snapshots
  for update
  using (true)
  with check (true);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  archived boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid references public.groups(id) on delete cascade,
  profile_id uuid references public.profiles(id),
  role text not null check (role in ('member', 'admin')),
  primary key (group_id, profile_id)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id),
  name text not null,
  admins_can_edit_only boolean not null default false,
  locked boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  profile_id uuid references public.profiles(id),
  guest_name text,
  kind text not null check (kind in ('user', 'guest')),
  created_at timestamptz not null default now(),
  check (
    (kind = 'user' and profile_id is not null and guest_name is null)
    or
    (kind = 'guest' and profile_id is null and guest_name is not null)
  )
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  name text not null,
  total_agorot integer not null check (total_agorot > 0),
  created_by_participant_id uuid references public.event_participants(id),
  updated_at timestamptz not null default now()
);

create table public.expense_payers (
  expense_id uuid references public.expenses(id) on delete cascade,
  participant_id uuid references public.event_participants(id),
  amount_agorot integer not null check (amount_agorot > 0),
  primary key (expense_id, participant_id)
);

create table public.expense_shares (
  expense_id uuid references public.expenses(id) on delete cascade,
  participant_id uuid references public.event_participants(id),
  primary key (expense_id, participant_id)
);

create table public.settlement_transfers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  from_participant_id uuid references public.event_participants(id),
  to_participant_id uuid references public.event_participants(id),
  amount_agorot integer not null check (amount_agorot > 0),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  marked_paid_by_participant_id uuid references public.event_participants(id),
  marked_paid_at timestamptz
);
