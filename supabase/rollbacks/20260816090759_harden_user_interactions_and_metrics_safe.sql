do $$
begin
  raise exception using
    message = 'Rollback refused: this would restore profile enumeration, stale event invitations, and unbounded metric writes.';
end;
$$;
