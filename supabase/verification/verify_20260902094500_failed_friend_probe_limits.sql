do $$
declare
  code_definition text;
  username_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.request_friendship(text)'::regprocedure
  ) into code_definition;
  select pg_catalog.pg_get_functiondef(
    'public.request_friendship_by_username(text)'::regprocedure
  ) into username_definition;

  if pg_catalog.strpos(code_definition, 'FRIEND_NOT_FOUND') = 0
    or pg_catalog.strpos(username_definition, 'USERNAME_NOT_FOUND') = 0 then
    raise exception 'Failed friendship probes do not preserve their rate limit';
  end if;
end;
$$;
