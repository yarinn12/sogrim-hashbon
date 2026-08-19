begin;

create or replace function private.prevent_locked_event_expense_updates()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  old_event jsonb := old.state -> 'events' -> 0;
  new_event jsonb := new.state -> 'events' -> 0;
begin
  if old.snapshot_kind <> 'shared_event'
    or old_event is null
    or new_event is null then
    return new;
  end if;

  if coalesce((old_event ->> 'locked')::boolean, false)
    and (
      coalesce(old_event -> 'expenses', '[]'::jsonb) is distinct from
        coalesce(new_event -> 'expenses', '[]'::jsonb)
      or coalesce(old_event -> 'deletedExpenses', '[]'::jsonb) is distinct from
        coalesce(new_event -> 'deletedExpenses', '[]'::jsonb)
    ) then
    raise exception 'Expenses cannot be changed while the event is locked'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_locked_event_expense_updates on public.app_snapshots;
create trigger prevent_locked_event_expense_updates
  before update on public.app_snapshots
  for each row execute function private.prevent_locked_event_expense_updates();

revoke all on function private.prevent_locked_event_expense_updates()
  from public, anon, authenticated;

commit;
