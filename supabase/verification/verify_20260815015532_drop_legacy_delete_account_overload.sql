do $$
begin
  if to_regprocedure(
    'public.delete_account_data(uuid,text,text)'
  ) is not null then
    raise exception 'legacy account deletion overload still exists';
  end if;

  if to_regprocedure('public.delete_account_data(uuid)') is null then
    raise exception 'current account deletion function is missing';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.delete_account_data(uuid)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.delete_account_data(uuid)',
    'EXECUTE'
  ) then
    raise exception 'account deletion helper is exposed to an app role';
  end if;

  perform public.delete_account_data(
    '00000000-0000-0000-0000-000000000000'::uuid
  );
end;
$$;

select 'ready' as verification_status;
