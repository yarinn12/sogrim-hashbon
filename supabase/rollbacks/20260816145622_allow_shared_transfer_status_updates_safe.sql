do $$
begin
  raise exception
    'Rollback refused: removing transfer status support would break payment reconciliation for active shared events.';
end;
$$;
