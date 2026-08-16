do $$
begin
  raise exception
    'Rollback refused: removing atomic shared-event creation would restore the event creation race';
end;
$$;
