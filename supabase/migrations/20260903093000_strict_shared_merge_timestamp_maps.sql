begin;

-- Keep server-accepted merge clocks compatible with the client validator.
-- Existing unchanged legacy values remain readable and are quarantined by the
-- client; only newly introduced or changed entries are rejected here.
create or replace function private.guard_shared_event_future_merge_timestamps()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_event jsonb := '{}'::jsonb;
  new_event jsonb;
  cutoff timestamptz := pg_catalog.statement_timestamp() + interval '5 minutes';
  field_name text;
  map_name text;
  old_value text;
  new_value text;
  changed_at timestamptz;
  map_entry record;
begin
  if new.snapshot_kind <> 'shared_event' then
    return new;
  end if;

  new_event := new.state -> 'events' -> 0;
  if new_event is null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    old_event := coalesce(old.state -> 'events' -> 0, '{}'::jsonb);
  end if;

  foreach field_name in array array[
    'membershipUpdatedAt',
    'statusUpdatedAt',
    'adminIdsUpdatedAt',
    'settingsUpdatedAt'
  ] loop
    old_value := old_event ->> field_name;
    new_value := new_event ->> field_name;
    if new_value is null or new_value is not distinct from old_value then
      continue;
    end if;
    begin
      changed_at := new_value::timestamptz;
    exception
      when invalid_datetime_format or datetime_field_overflow then
        raise exception 'Shared merge timestamp is invalid'
          using errcode = '22023';
    end;
    if changed_at > cutoff then
      raise exception 'Shared merge timestamp is too far in the future'
        using errcode = '22023';
    end if;
  end loop;

  foreach map_name in array array[
    'membershipUpdatedAtByParticipant',
    'settingsFieldUpdatedAt'
  ] loop
    if pg_catalog.jsonb_typeof(new_event -> map_name) <> 'object' then
      continue;
    end if;
    for map_entry in
      select entry.key, entry.value
      from pg_catalog.jsonb_each_text(new_event -> map_name) as entry(key, value)
    loop
      old_value := old_event -> map_name ->> map_entry.key;
      new_value := map_entry.value;
      if new_value is not distinct from old_value then
        continue;
      end if;
      if map_entry.key !~ '^[A-Za-z0-9_-]{1,128}$' then
        raise exception 'Shared merge timestamp key is invalid'
          using errcode = '22023';
      end if;
      if new_value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$' then
        raise exception 'Shared merge timestamp must use ISO 8601 format'
          using errcode = '22023';
      end if;
      begin
        changed_at := new_value::timestamptz;
      exception
        when invalid_datetime_format or datetime_field_overflow then
          raise exception 'Shared merge timestamp is invalid'
            using errcode = '22023';
      end;
      if changed_at > cutoff then
        raise exception 'Shared merge timestamp is too far in the future'
          using errcode = '22023';
      end if;
    end loop;
  end loop;

  return new;
end;
$$;

revoke all on function private.guard_shared_event_future_merge_timestamps()
  from public, anon, authenticated;

commit;
