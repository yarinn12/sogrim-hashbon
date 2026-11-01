-- Read-only verification of the hosted optimistic-conflict contract.
do $$
declare definition text;
begin
  definition := pg_catalog.pg_get_functiondef('public.set_my_bit_shortcut(text,bigint)'::pg_catalog.regprocedure);
  if pg_catalog.strpos(definition,'PT409')=0 or pg_catalog.strpos(definition,'40001')>0 then
    raise exception 'Bit shortcut conflicts must use non-retryable HTTP 409';
  end if;
  if not pg_catalog.has_function_privilege('authenticated','public.set_my_bit_shortcut(text,bigint)','execute') or
      pg_catalog.has_function_privilege('anon','public.set_my_bit_shortcut(text,bigint)','execute') then
    raise exception 'Bit shortcut write privileges changed';
  end if;
end;
$$;
