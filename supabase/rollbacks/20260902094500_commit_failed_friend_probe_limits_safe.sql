do $$
begin
  raise exception 'Unsafe rollback refused: failed friend probes must continue consuming quota';
end;
$$;
