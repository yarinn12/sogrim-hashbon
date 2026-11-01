-- Read-only candidate verification; does not enable the UI feature.
do $$
begin
  if pg_catalog.to_regclass('private.user_bit_shortcuts') is null then
    raise exception 'Bit profile migration is missing';
  end if;
  if pg_catalog.has_table_privilege('authenticated','private.user_bit_shortcuts','SELECT,INSERT,UPDATE,DELETE')
    or pg_catalog.has_table_privilege('anon','private.user_bit_shortcuts','SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'Bit shortcuts must not have direct client table privileges';
  end if;
  if not pg_catalog.has_function_privilege('authenticated','public.get_my_bit_shortcut()','EXECUTE')
    or not pg_catalog.has_function_privilege('authenticated','public.set_my_bit_shortcut(text,bigint)','EXECUTE')
    or not pg_catalog.has_function_privilege('authenticated','public.get_transfer_bit_shortcut(text,text)','EXECUTE')
    or pg_catalog.has_function_privilege('anon','public.get_my_bit_shortcut()','EXECUTE')
    or pg_catalog.has_function_privilege('anon','public.set_my_bit_shortcut(text,bigint)','EXECUTE')
    or pg_catalog.has_function_privilege('anon','public.get_transfer_bit_shortcut(text,text)','EXECUTE') then
    raise exception 'Bit RPC execution privileges are incorrect';
  end if;
end;
$$;
