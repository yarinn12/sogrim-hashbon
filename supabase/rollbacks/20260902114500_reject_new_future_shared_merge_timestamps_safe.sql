do $$
begin
  raise exception
    'Unsafe rollback refused: removing the guard permits poisoned client clocks to dominate future merges';
end;
$$;
