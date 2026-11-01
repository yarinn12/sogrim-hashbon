-- Optional private Bit receiving shortcuts (2026-11-01).
-- Additive candidate migration. Never run against production as part of local QA.
create table if not exists private.user_bit_shortcuts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bit_url text check (bit_url is null or (
    pg_catalog.char_length(bit_url) <= 250 and
    bit_url ~ '^https://www\.bitpay\.co\.il/app/me/[A-Fa-f0-9-]{20,100}$'
  )),
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);
alter table private.user_bit_shortcuts enable row level security;
alter table private.user_bit_shortcuts force row level security;
revoke all on table private.user_bit_shortcuts from public, anon, authenticated;

create or replace function public.get_my_bit_shortcut()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); shortcut private.user_bit_shortcuts%rowtype;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into shortcut from private.user_bit_shortcuts where user_id=actor;
  if not found then
    return pg_catalog.jsonb_build_object('user_id',actor,'bit_url',null,'revision',0,'updated_at',null);
  end if;
  return pg_catalog.to_jsonb(shortcut);
end;
$$;

create or replace function public.set_my_bit_shortcut(p_bit_url text, p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); shortcut private.user_bit_shortcuts%rowtype;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_expected_revision is null or p_expected_revision < 0 or p_expected_revision >= 9007199254740991 then
    raise exception 'Invalid revision' using errcode='22023';
  end if;
  if p_bit_url is not null and (pg_catalog.char_length(p_bit_url)>250 or
      p_bit_url !~ '^https://www\.bitpay\.co\.il/app/me/[A-Fa-f0-9-]{20,100}$') then
    raise exception 'Invalid personal Bit receiving QR' using errcode='22023';
  end if;
  insert into private.user_bit_shortcuts(user_id,bit_url,revision) values(actor,null,0)
    on conflict(user_id) do nothing;
  select * into shortcut from private.user_bit_shortcuts where user_id=actor for update;
  if shortcut.revision <> p_expected_revision then
    raise exception 'Bit shortcut changed; reload before saving' using errcode='40001';
  end if;
  update private.user_bit_shortcuts set bit_url=p_bit_url,revision=revision+1,
    updated_at=pg_catalog.clock_timestamp() where user_id=actor returning * into shortcut;
  return pg_catalog.to_jsonb(shortcut);
end;
$$;

create or replace function public.get_transfer_bit_shortcut(p_snapshot_id text,p_transfer_id text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid(); event jsonb; transfer jsonb; recipient uuid;
  shortcut jsonb; amount bigint;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_snapshot_id is null or p_transfer_id is null or pg_catalog.char_length(p_snapshot_id)>160 or
      pg_catalog.char_length(p_transfer_id)>160 then raise exception 'Invalid transfer' using errcode='22023'; end if;
  select snapshot.state->'events'->0 into event from public.app_snapshots snapshot
    where snapshot.id=p_snapshot_id and snapshot.owner_user_id is null and snapshot.snapshot_kind='shared_event'
      and private.is_active_shared_event_member(snapshot.id,actor);
  if event is null then raise exception 'Transfer unavailable' using errcode='42501'; end if;
  select item into transfer from pg_catalog.jsonb_array_elements(coalesce(event->'transfers','[]'::jsonb)) item
    where item->>'id'=p_transfer_id;
  if transfer is null or transfer->>'fromParticipantId' <> 'account-'||actor::text or
      coalesce(transfer->>'status','') <> 'pending' then
    raise exception 'Transfer unavailable' using errcode='42501';
  end if;
  select member.user_id into recipient from private.shared_snapshot_members member
    where member.snapshot_id=p_snapshot_id and member.participant_id=transfer->>'toParticipantId'
      and member.status='active' and private.is_active_shared_event_member(p_snapshot_id,member.user_id);
  if recipient is null or recipient=actor then return null; end if;
  if exists(select 1 from public.user_blocks b where
      (b.blocker_user_id=actor and b.blocked_user_id=recipient) or
      (b.blocker_user_id=recipient and b.blocked_user_id=actor)) then
    raise exception 'Transfer unavailable' using errcode='42501';
  end if;
  if pg_catalog.jsonb_typeof(transfer->'amount') <> 'number' or
      coalesce(transfer->>'amount','') !~ '^[0-9]{1,16}$' then return null; end if;
  amount := (transfer->>'amount')::bigint;
  if amount<=0 or amount>9007199254740991 then return null; end if;
  select pg_catalog.to_jsonb(s) into shortcut from private.user_bit_shortcuts s where s.user_id=recipient;
  return pg_catalog.jsonb_build_object('transfer_id',p_transfer_id,
    'recipient_user_id',recipient,'recipient_participant_id','account-'||recipient::text,
    'amount_minor',amount,'currency',coalesce(event->>'currency','ILS'),
    'shortcut',coalesce(shortcut,pg_catalog.jsonb_build_object('user_id',recipient,'bit_url',null,'revision',0,'updated_at',null)));
end;
$$;

revoke all on function public.get_my_bit_shortcut() from public,anon;
revoke all on function public.set_my_bit_shortcut(text,bigint) from public,anon;
revoke all on function public.get_transfer_bit_shortcut(text,text) from public,anon;
grant execute on function public.get_my_bit_shortcut() to authenticated;
grant execute on function public.set_my_bit_shortcut(text,bigint) to authenticated;
grant execute on function public.get_transfer_bit_shortcut(text,text) to authenticated;

-- Also clear the shortcut when the existing service-only data deletion is used
-- before Auth removes the account. Auth deletion itself is protected by the FK.
create or replace function public.delete_account_data(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare participant_id text := 'account-' || p_user_id::text; anonymized_count integer := 0;
begin
  delete from private.user_bit_shortcuts where user_id=p_user_id;
  update public.app_snapshots as snapshot set state=pg_catalog.jsonb_set(snapshot.state,'{participants}',
    coalesce((select pg_catalog.jsonb_agg(case when participant->>'id'=participant_id then
      private.account_deletion_participant_tombstone(participant) else participant end)
      from pg_catalog.jsonb_array_elements(coalesce(snapshot.state->'participants','[]'::jsonb)) participant),'[]'::jsonb),true),
    updated_at=pg_catalog.now()
    where snapshot.owner_user_id is distinct from p_user_id and
      pg_catalog.jsonb_typeof(snapshot.state->'participants')='array' and exists(
        select 1 from pg_catalog.jsonb_array_elements(snapshot.state->'participants') participant where participant->>'id'=participant_id);
  get diagnostics anonymized_count=row_count;
  return pg_catalog.jsonb_build_object('workspace_owned_by_user',exists(
    select 1 from public.app_snapshots where owner_user_id=p_user_id),'shared_records_anonymized',anonymized_count);
end;
$$;
revoke all on function public.delete_account_data(uuid) from public,anon,authenticated;
grant execute on function public.delete_account_data(uuid) to service_role;
