do $$
begin
  raise exception
    'Rollback refused: restoring the ambiguous product metric clock would disable operational telemetry';
end;
$$;
