import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261011120000_preserve_expense_fx_at_snapshot_boundary.sql", import.meta.url), "utf8");
const verification = readFileSync(new URL("../supabase/verification/verify_20261011120000_expense_fx_snapshot_boundary.sql", import.meta.url), "utf8");
const marker = "-- Protect converted expenses at the snapshot write boundary (2026-10-11).";
const migrationBody = migration.replace(/^begin;\r?\n/u, "").replace(/\r?\ncommit;\s*$/u, "\n");
const withoutFirstInsertGuard = migrationBody.replace(
  /    if tg_op = 'INSERT' and new.snapshot_kind = 'shared_event'[\s\S]*?(?=    if new.snapshot_kind = 'workspace')/u,
  ""
);

test("FX migration rolls back atomically and installs from the previous local schema", async () => {
  assert.ok(schema.includes(marker));
  const db = new PGlite({ extensions: { pgcrypto } });
  const trigger = async () => (await db.query(`select count(*)::int as count from pg_catalog.pg_trigger
    where tgname='zzz_preserve_expense_fx_at_snapshot_boundary' and not tgisinternal`)).rows[0].count;
  try {
    // Supabase Auth owns this schema in production. The disposable local DB
    // provides only the functions and roles the application schema needs.
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.users (
        id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb,
        raw_app_meta_data jsonb default '{}'::jsonb,
        created_at timestamptz default now(), updated_at timestamptz default now(),
        email_confirmed_at timestamptz, confirmed_at timestamptz,
        last_sign_in_at timestamptz, banned_until timestamptz, is_anonymous boolean default false
      );
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      create function auth.role() returns text language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'authenticated');
      $$;
      create function auth.jwt() returns jsonb language sql stable as $$
        select jsonb_build_object('sub', auth.uid(), 'role', auth.role());
      $$;
    `);
    await db.exec(schema.split(marker)[0]);
    assert.equal(await trigger(), 0);
    assert.notEqual(withoutFirstInsertGuard, migrationBody);

    await db.exec("begin");
    try {
      await db.exec(withoutFirstInsertGuard);
      assert.equal(await trigger(), 1);
      await assert.rejects(db.exec(verification),
        /Expense FX first shared INSERT guard is missing/u);
    } finally {
      await db.exec("rollback");
    }
    assert.equal(await trigger(), 0);

    await db.exec("begin");
    try {
      await db.exec(migrationBody);
      assert.equal(await trigger(), 1);
      assert.equal((await db.exec(verification)).at(-1).rows[0].verification_status, "ready");
    } finally {
      await db.exec("rollback");
    }
    assert.equal(await trigger(), 0, "rollback must remove the new write guard");

    await db.exec(migration);
    assert.equal(await trigger(), 1);
    assert.equal((await db.exec(verification)).at(-1).rows[0].verification_status, "ready");
  } finally {
    await db.close();
  }
});
