do $$
declare
  constraint_definition text;
begin
  select pg_catalog.pg_get_constraintdef(constraint_record.oid)
    into constraint_definition
  from pg_catalog.pg_constraint as constraint_record
  where constraint_record.conrelid = 'public.product_metrics'::regclass
    and constraint_record.conname = 'product_metrics_check';

  if constraint_definition is null
    or pg_catalog.strpos(constraint_definition, 'account_link') = 0 then
    raise exception 'Account-link reliability metrics are not accepted';
  end if;
end;
$$;
