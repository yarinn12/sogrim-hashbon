do $$
begin
  raise exception
    'Unsafe rollback refused: weakening merge timestamp validation can restore cross-device sync lockouts';
end;
$$;
