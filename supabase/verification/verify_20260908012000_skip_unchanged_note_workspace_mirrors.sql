do $$
declare
  body text;
  is_definer boolean;
begin
  select prosrc, prosecdef into body, is_definer
  from pg_proc
  where oid = 'private.sync_shared_event_notes_to_workspaces(text,jsonb,timestamptz)'::regprocedure;
  if not is_definer
    or strpos(body, 'if next_events is not distinct from workspace.state') = 0
    or strpos(body, 'and missing_participants = ''[]''::jsonb then') = 0
    or strpos(body, 'update public.app_snapshots as personal') = 0
    or strpos(body, 'if conflicting_event_exists then') = 0
    or strpos(body, 'Active member workspace is unavailable') = 0 then
    raise exception 'No-op note mirror optimization is missing or incomplete';
  end if;
end;
$$;
