import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { buildSharedEventState } from "../src/data/sharedEventStore.mjs";

const owner = "11111111-1111-4111-8111-111111111111";
const member = "22222222-2222-4222-8222-222222222222";
const key = "synthetic-private-creation-key-00000001";
const workspaceId = "workspace-private-creation-member";
const sharedId = "shared-private-creation-probe";
const stamp = "2026-10-01T08:00:00.000Z";
const json = (value, status = 200) => new Response(JSON.stringify(value), { status,
  headers: { "content-type": "application/json" } });

// Every transport write below runs the actual schema, triggers and RLS as an
// authenticated member. No service key, live account or network is involved.
test("PostgreSQL rejects an older unauthorized shared edit while acknowledging a new private event", async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  const globals = Object.fromEntries(["window", "location", "localStorage", "fetch"].map(name => [name, globalThis[name]]));
  const denied = [], acknowledged = [];
  async function authenticated(user, sql, args = []) {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
    await db.query("select set_config('request.headers',$1,false)", [JSON.stringify({ "x-space-key": key })]);
    await db.exec("set role authenticated");
    try { return await db.query(sql, args); }
    finally { await db.exec("reset role"); }
  }
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb,
        raw_app_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now(),
        updated_at timestamptz default now(), email_confirmed_at timestamptz,
        confirmed_at timestamptz, last_sign_in_at timestamptz, banned_until timestamptz,
        is_anonymous boolean default false);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
      create function auth.role() returns text language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated'); $$;
      create function auth.jwt() returns jsonb language sql stable as $$
        select jsonb_build_object('sub',auth.uid(),'role',auth.role()); $$;`);
    await db.exec(readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8"));
    await db.query("insert into auth.users(id,email) values($1,'owner@example.invalid'),($2,'member@example.invalid')", [owner, member]);
    const participants = [owner, member].map((user, i) => ({ id: `account-${user}`, kind: "user",
      displayName: i ? "Member" : "Owner", accountLinked: true }));
    const oldEvent = { id: "old-admin-event", name: "Canonical name", eventType: "standard", currency: "ILS",
      participantIds: participants.map(p => p.id), adminIds: [`account-${owner}`],
      createdByParticipantId: `account-${owner}`, adminsCanEditOnly: true,
      createdAt: stamp, expenses: [], transfers: [], notes: [], deletedNotes: [] };
    for (const user of [owner, member]) {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
      await db.query(`insert into public.app_snapshots(id,access_key_hash,owner_user_id,state)
        values($1,encode(extensions.digest($2,'sha256'),'hex'),$3::uuid,$4::jsonb)`,
      [user === member ? workspaceId : "workspace-private-creation-owner", key, user,
        JSON.stringify({ currentParticipantId: `account-${user}`, participants, groups: [], events: [] })]);
    }
    const personal = { currentParticipantId: `account-${member}`, participants, groups: [],
      events: [{ ...oldEvent, sharedSpaceId: sharedId, sharedSpaceKey: key }] };
    await authenticated(owner, "select public.create_shared_event_snapshot($1,$2,$3::jsonb)",
      [sharedId, key, JSON.stringify(buildSharedEventState(personal, oldEvent.id))]);
    assert.deepEqual((await db.query(
      "select role,status from private.shared_snapshot_members where snapshot_id=$1 and user_id=$2::uuid",
      [sharedId, member])).rows, [{ role: "member", status: "active" }],
      "canonical publication establishes membership without granting administration");
    await authenticated(member, "update public.app_snapshots set state=$2::jsonb where id=$1", [workspaceId, JSON.stringify(personal)]);

    const entries = new Map();
    const storage = { getItem: name => entries.get(name) ?? null,
      setItem: (name, value) => entries.set(name, String(value)), removeItem: name => entries.delete(name) };
    const location = { href: "https://fixture.invalid/", hostname: "fixture.invalid", protocol: "https:" };
    const config = { storage: { mode: "supabase", url: "https://db-fixture.invalid", anonKey: "synthetic-anon",
      table: "app_snapshots", spaceId: workspaceId, spaceKey: key,
      account: { userId: member, accessToken: "synthetic-token", spaceId: workspaceId } } };
    const queued = structuredClone(personal);
    queued.events[0].name = "Unauthorized pending rename";
    queued.__pendingSync = { version: 1, selection: { eventIds: [oldEvent.id], deletedEventIds: [] } };
    storage.setItem("settle-friends-account-session", JSON.stringify({ access_token: "synthetic-token",
      refresh_token: "synthetic-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: member, user_metadata: { account_space_id: workspaceId, account_space_key: key } } }));
    storage.setItem("settle-friends-cloud-space", workspaceId);
    storage.setItem(`settle-friends-cloud-key:${workspaceId}`, key);
    storage.setItem(`settle-friends-state:${workspaceId}`, JSON.stringify(queued));
    storage.setItem(`settle-friends-pending-sync:${workspaceId}`, JSON.stringify(queued));
    globalThis.window = { location, localStorage: storage, addEventListener() {}, dispatchEvent() {} };
    globalThis.location = location; globalThis.localStorage = storage;
    globalThis.fetch = async (url, options = {}) => {
      const address = new URL(String(url), location.href), body = options.body ? JSON.parse(options.body) : {};
      if (address.pathname === "/api/config") return json(config);
      try {
        if (address.pathname.endsWith("/rpc/join_shared_event")) {
          return json((await authenticated(member, "select public.join_shared_event($1) as value", [body.p_snapshot_id])).rows[0].value);
        }
        if (address.pathname.endsWith("/rpc/update_shared_event_snapshot")) {
          return json((await authenticated(member, "select public.update_shared_event_snapshot($1,$2,$3::timestamptz,$4::jsonb) as value",
            [body.p_snapshot_id, body.p_space_key, body.p_expected_updated_at, JSON.stringify(body.p_state)])).rows[0].value);
        }
        assert.equal(address.pathname, "/rest/v1/app_snapshots");
        const id = address.searchParams.get("id")?.replace(/^eq\./, "");
        if (options.method === "PATCH") {
          assert.equal(id, workspaceId);
          const version = address.searchParams.get("updated_at").replace(/^eq\./, "");
          const result = await authenticated(member, `update public.app_snapshots set state=$2::jsonb,updated_at=$3::timestamptz
            where id=$1 and updated_at=$4::timestamptz returning to_jsonb(updated_at) as updated_at`,
          [id, JSON.stringify(body.state), body.updated_at, version]);
          acknowledged.push(structuredClone(body.state));
          return json(result.rows);
        }
        assert.equal(options.method ?? "GET", "GET");
        return json((await authenticated(member, "select id,state,to_jsonb(updated_at) as updated_at from public.app_snapshots where id=$1", [id])).rows);
      } catch (error) {
        assert.equal(error.code, "42501", error.message);
        denied.push({ path: address.pathname, code: error.code });
        return json({ code: error.code, message: error.message }, 403);
      }
    };
    const store = await import(`../src/data/localStore.mjs?database-private-creation=${crypto.randomUUID()}`);
    const attempted = store.loadState();
    attempted.events.unshift({ ...oldEvent, id: "new-private-event", name: "New private event",
      participantIds: [`account-${member}`], adminIds: [`account-${member}`], createdByParticipantId: `account-${member}` });
    const result = await store.saveSharedState(attempted, { awaitCloud: true });
    assert.ok(denied.some(item => item.path.endsWith("/rpc/update_shared_event_snapshot")), "exercise a real database denial");
    assert.equal(result.ok, true);
    assert.equal(result.personalWorkspacePersisted, true);
    assert.equal(result.pending, true, "the older shared failure remains visible and queued");
    assert.ok(acknowledged.at(-1).events.some(event => event.id === "new-private-event"));
    const saved = (await db.query("select state from public.app_snapshots where id=$1", [workspaceId])).rows[0].state;
    assert.ok(saved.events.some(event => event.id === "new-private-event"));
    assert.equal(saved.events.find(event => event.id === oldEvent.id).name, oldEvent.name);
    assert.equal((await db.query("select state from public.app_snapshots where id=$1", [sharedId])).rows[0].state.events[0].name, oldEvent.name);
    const pending = JSON.parse(storage.getItem(`settle-friends-pending-sync:${workspaceId}`));
    assert.equal(pending.events.find(event => event.id === oldEvent.id).name, "Unauthorized pending rename");
    assert.deepEqual(pending.__pendingSync.selection, { eventIds: [oldEvent.id], deletedEventIds: [] });
    assert.ok(store.loadState().events.some(event => event.id === "new-private-event"));
  } finally {
    for (const [name, value] of Object.entries(globals)) {
      if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
    }
    await db.close();
  }
});
