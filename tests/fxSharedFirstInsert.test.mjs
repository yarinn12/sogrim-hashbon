import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const verification = readFileSync(new URL("../supabase/verification/verify_20261011120000_expense_fx_snapshot_boundary.sql", import.meta.url), "utf8");
const creatorId = "00000000-0000-4000-8000-000000000001";
const foreignId = "00000000-0000-4000-8000-000000000002";
const actor = `account-${creatorId}`;
const key = "synthetic-test-only-space-key-0001";
const fx = { version: 1, sourceCurrency: "USD", targetCurrency: "ILS",
  targetAmountMinorUnits: "3500", rate: "3.5" };
const participant = { id: actor, kind: "user", displayName: "Synthetic", accountLinked: true };
const expense = includeFx => ({ id: "expense-probe", name: "Lunch", total: 3500,
  payers: [{ participantId: actor, amount: 3500 }], sharedByParticipantIds: [actor],
  createdByParticipantId: actor, ...(includeFx ? { fxConversion: fx } : {}) });
const state = (includeFx, currentParticipantId = "") => ({ currentParticipantId,
  participants: currentParticipantId && currentParticipantId !== actor
    ? [participant, { id: currentParticipantId, kind: "user", displayName: "Other" }]
    : [participant], groups: [], deletedEvents: [], deletedParticipants: [],
  events: [{ id: "event-probe", name: "Synthetic event", currency: "ILS",
    eventType: "standard", participantIds: currentParticipantId && currentParticipantId !== actor
      ? [actor, currentParticipantId] : [actor], adminIds: [actor],
    createdByParticipantId: actor, locked: false, expenses: [expense(includeFx)],
    deletedExpenses: [], notes: [], deletedNotes: [], transfers: [], transferStatusUpdates: [] }] });

async function fixture() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb,
      raw_app_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now(),
      updated_at timestamptz default now(), email_confirmed_at timestamptz,
      confirmed_at timestamptz, last_sign_in_at timestamptz, banned_until timestamptz,
      is_anonymous boolean default false);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
    create function auth.role() returns text language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'authenticated'); $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select jsonb_build_object('sub', auth.uid(), 'role', auth.role()); $$;`);
  await db.exec(schema);
  await db.query("insert into auth.users (id,email) values ($1::uuid,'creator@example.invalid'),($2::uuid,'foreign@example.invalid')",
    [creatorId, foreignId]);
  return db;
}

async function workspace(db, ownerId, id, includeFx = true) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ownerId]);
  await db.query(`insert into public.app_snapshots (id,access_key_hash,owner_user_id,state)
    values ($1,encode(extensions.digest($2,'sha256'),'hex'),$3::uuid,$4::jsonb)`,
    [id, key, ownerId, JSON.stringify(state(includeFx, `account-${ownerId}`))]);
}

async function createAs(db, userId, candidate = state(false)) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
  await db.exec("set role authenticated");
  try {
    return (await db.query(`select public.create_shared_event_snapshot($1,$2,$3::jsonb) as value`,
      ["shared-probe", key, JSON.stringify(candidate)])).rows[0].value;
  } finally {
    await db.exec("reset role");
  }
}

test("authenticated first shared INSERT preserves FX from the creator's own workspace", async () => {
  const db = await fixture();
  try {
    await workspace(db, creatorId, "workspace-creator");
    assert.equal((await createAs(db, creatorId)).status, "created");
    const saved = (await db.query("select state from public.app_snapshots where id='shared-probe'")).rows[0].state;
    assert.deepEqual(saved.events[0].expenses[0].fxConversion, fx);
    const personal = (await db.query("select state from public.app_snapshots where id='workspace-creator'")).rows[0].state;
    assert.deepEqual(personal.events[0].expenses[0].fxConversion, fx);
    assert.equal((await db.exec(verification)).at(-1).rows[0].verification_status, "ready");
  } finally { await db.close(); }
});

test("first shared INSERT never reads another account's FX and rejects a foreign creator", async () => {
  const db = await fixture();
  try {
    await workspace(db, foreignId, "workspace-foreign");
    await workspace(db, creatorId, "workspace-creator", false);
    await assert.rejects(createAs(db, foreignId), { code: "42501" });
    assert.equal((await createAs(db, creatorId)).status, "created");
    const saved = (await db.query("select state from public.app_snapshots where id='shared-probe'")).rows[0].state;
    assert.equal(saved.events[0].expenses[0].fxConversion, undefined);
  } finally { await db.close(); }
});

test("first shared INSERT rejects a changed ledger that omits the creator's saved FX", async () => {
  const db = await fixture();
  try {
    await workspace(db, creatorId, "workspace-creator");
    const changed = state(false);
    changed.events[0].expenses[0].total = 3600;
    changed.events[0].expenses[0].payers[0].amount = 3600;
    await assert.rejects(createAs(db, creatorId, changed), { code: "PFX01" });
    assert.equal((await db.query("select count(*)::int as count from public.app_snapshots where id='shared-probe'")).rows[0].count, 0);
  } finally { await db.close(); }
});
