begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

drop function if exists public.delete_account_data(uuid, text, text);

commit;
