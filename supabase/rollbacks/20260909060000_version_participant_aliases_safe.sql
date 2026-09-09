do $$
begin
  raise exception 'Unsafe rollback refused: retain alias clock validation while versioned aliases may exist. Older clients remain compatible with this guard.';
end;
$$;
