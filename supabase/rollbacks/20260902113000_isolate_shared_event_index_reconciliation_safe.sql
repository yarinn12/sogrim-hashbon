do $$
begin
  raise exception
    'Unsafe rollback refused: restoring synchronous reconciliation failures can roll back canonical event membership';
end;
$$;
