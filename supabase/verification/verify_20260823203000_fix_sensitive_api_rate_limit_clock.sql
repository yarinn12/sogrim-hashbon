do $$
declare
  first_result jsonb;
  second_result jsonb;
begin
  first_result := public.reserve_sensitive_api_capacity(
    'sensitive-api:verification-clock',
    array[repeat('a', 64)],
    1,
    100,
    60
  );
  if first_result ->> 'allowed' <> 'true' then
    raise exception 'The first sensitive API reservation was not allowed';
  end if;

  second_result := public.reserve_sensitive_api_capacity(
    'sensitive-api:verification-clock',
    array[repeat('a', 64)],
    1,
    100,
    60
  );
  if second_result ->> 'allowed' <> 'false'
    or coalesce((second_result ->> 'retryAfterSeconds')::integer, 0) < 1 then
    raise exception 'The sensitive API client limit was not enforced';
  end if;

  delete from private.api_rate_limit_buckets
  where namespace = 'sensitive-api:verification-clock';
end;
$$;
