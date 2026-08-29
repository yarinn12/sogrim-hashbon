do $$
declare
  index_definition text;
  duplicate_event_id text;
begin
  select pg_catalog.pg_get_indexdef(index_row.indexrelid)
  into index_definition
  from pg_catalog.pg_index as index_row
  where index_row.indexrelid =
    'public.app_snapshots_shared_event_event_id_uidx'::regclass;

  if index_definition is null
    or index_definition not ilike 'CREATE UNIQUE INDEX%'
    or index_definition not like '%#>>%{events,0,id}%'
    or index_definition not like '%snapshot_kind%shared_event%' then
    raise exception 'Shared-event identity unique index is missing or invalid';
  end if;

  select snapshot.state #>> '{events,0,id}'
  into duplicate_event_id
  from public.app_snapshots as snapshot
  where snapshot.snapshot_kind = 'shared_event'
    and nullif(snapshot.state #>> '{events,0,id}', '') is not null
  group by snapshot.state #>> '{events,0,id}'
  having count(*) > 1
  limit 1;

  if duplicate_event_id is not null then
    raise exception 'Duplicate shared event identity remains: %', duplicate_event_id;
  end if;
end;
$$;
