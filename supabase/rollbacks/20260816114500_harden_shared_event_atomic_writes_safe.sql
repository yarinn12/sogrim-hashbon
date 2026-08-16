begin;

do $$
begin
  raise exception
    'Rollback refused: restoring direct shared-event writes would re-open invite, financial-validation, and stale-write vulnerabilities';
end;
$$;

rollback;
