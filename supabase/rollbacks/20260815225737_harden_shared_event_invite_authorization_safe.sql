do $$
begin
  raise exception
    'Rollback refused: restoring key-only shared-event access would reopen a tenant-isolation vulnerability';
end;
$$;
