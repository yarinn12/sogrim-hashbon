do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.app_snapshots'::regclass
      and tgname='aa_preserve_committed_event_account_links'
      and tgenabled='O'
  ) or has_function_privilege('anon','private.preserve_committed_event_account_links()','execute')
    or has_function_privilege('authenticated','private.preserve_committed_event_account_links()','execute') then
    raise exception 'Committed account-link protection is missing or incorrectly exposed';
  end if;
end;
$$;
