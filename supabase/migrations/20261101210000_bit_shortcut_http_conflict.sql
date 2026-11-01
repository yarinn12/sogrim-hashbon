-- Bit shortcut conflicts return a non-retryable HTTP status (2026-11-01).
-- Optimistic version conflicts are business errors, not retryable serialization failures.
create or replace function public.set_my_bit_shortcut(p_bit_url text, p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); shortcut private.user_bit_shortcuts%rowtype;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_expected_revision is null or p_expected_revision < 0 or p_expected_revision >= 9007199254740991 then
    raise exception 'Invalid revision' using errcode='22023';
  end if;
  if p_bit_url is not null and (pg_catalog.char_length(p_bit_url)>250 or
      p_bit_url !~ '^https://www\.bitpay\.co\.il/app/me/[A-Fa-f0-9-]{20,100}$') then
    raise exception 'Invalid personal Bit receiving QR' using errcode='22023';
  end if;
  insert into private.user_bit_shortcuts(user_id,bit_url,revision) values(actor,null,0)
    on conflict(user_id) do nothing;
  select * into shortcut from private.user_bit_shortcuts where user_id=actor for update;
  if shortcut.revision <> p_expected_revision then
    raise exception 'Bit shortcut changed; reload before saving' using errcode='PT409';
  end if;
  update private.user_bit_shortcuts set bit_url=p_bit_url,revision=revision+1,
    updated_at=pg_catalog.clock_timestamp() where user_id=actor returning * into shortcut;
  return pg_catalog.to_jsonb(shortcut);
end;
$$;

revoke all on function public.set_my_bit_shortcut(text,bigint) from public,anon;
grant execute on function public.set_my_bit_shortcut(text,bigint) to authenticated;
