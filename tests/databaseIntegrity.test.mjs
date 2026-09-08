import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { linkParticipantAccountInEvent, linkParticipantAccount, mergeParticipants } from "../src/domain/appActions.mjs";
import { buildSharedEventState, mergeSharedEventIntoState, mergeSharedEventWriteState, saveSharedEventState } from "../src/data/sharedEventStore.mjs";
import { appendEventActivity } from "../src/domain/eventActivityLog.mjs";
import { syncFriendProfile } from "../src/data/friendsStore.mjs";
import { staleSettlementFixture } from "./helpers/staleSettlementFixture.mjs";

// Real PostgreSQL/PLpgSQL, in memory only. No .env, network, production users,
// or credentials. Supabase Auth's host-owned schema is the only fixture shim.
let db;
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260906090000_enforce_payment_parties_and_note_timestamps.sql", import.meta.url), "utf8");
const migrationMarker = "-- Mandatory payment parties and finite note envelopes (2026-09-06).";
const attributionMarker = "-- Shared note and activity attribution (2026-09-06).";
const profileVersionMarker = "-- Monotonic public profile versions (2026-09-07).";
const accountLinkReceiptMarker = "-- An identity link is historical evidence.";
const accountLinkReceiptMigration = readFileSync(new URL("../supabase/migrations/20260908015000_preserve_committed_event_account_links.sql", import.meta.url), "utf8");
const profileVersionMigration = readFileSync(new URL("../supabase/migrations/20260907100000_monotonic_public_profile_versions.sql", import.meta.url), "utf8");
const profileVersionVerification = readFileSync(new URL("../supabase/verification/verify_20260907100000_monotonic_public_profile_versions.sql", import.meta.url), "utf8");
const attributionMigration = readFileSync(new URL("../supabase/migrations/20260906110000_shared_note_activity_attribution.sql", import.meta.url), "utf8");
const rolloutVerification = readFileSync(new URL("../supabase/verification/verify_20260906090000_payment_parties_and_note_timestamps.sql", import.meta.url), "utf8");
const attributionVerification = readFileSync(new URL("../supabase/verification/verify_20260906110000_shared_note_activity_attribution.sql", import.meta.url), "utf8");
before(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
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
  try {
    if (process.env.DATABASE_INTEGRITY_INSTALL_MODE === "upgrade") {
      await db.exec(schema.split(migrationMarker)[0]);
      await db.exec(migration);
      await db.exec(attributionMigration);
      await db.exec(profileVersionMigration);
    } else { await db.exec(schema); }
    await db.exec(accountLinkReceiptMigration);
  }
  catch (error) { throw new Error(`Local schema setup failed (${error.code}): ${error.message}`); }
}, { timeout: 60_000 });
after(async () => { await db?.close(); });

// Profile writes use the actual authenticated role and installed triggers.
// Their clocks are explicit and remain close to the fixture's current time.
async function withVersionedProfile(run) {
  const userId = "00000000-0000-4000-8000-000000000091";
  const times = [0, 1, 2, 3].map(step => new Date(Date.now() + 1000 + step * 1000).toISOString());
  await db.exec("begin");
  try {
    await db.query("insert into auth.users (id,email) values ($1::uuid,$2)", [userId, "profile-clock@example.invalid"]);
    await db.query(`update public.user_profiles set display_name='Original Name',avatar_preset='avatar-1',
      avatar_image='data:image/png;base64,b2xk',avatar_image_updated_at=$1::timestamptz,updated_at=$1::timestamptz
      where user_id=$2::uuid`, [times[0], userId]);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [userId]);
    await db.exec("set local role authenticated");
    const read = async () => (await db.query(`select display_name,avatar_preset,avatar_image,username,
      to_jsonb(updated_at) as version,to_jsonb(avatar_image_updated_at) as avatar_version
      from public.user_profiles where user_id=$1::uuid`, [userId])).rows[0];
    const patch = async fields => {
      const allowed = new Set(["display_name", "avatar_preset", "avatar_image", "avatar_image_updated_at", "updated_at"]);
      const entries = Object.entries(fields);
      assert.ok(entries.length && entries.every(([key]) => allowed.has(key)));
      await db.query(`update public.user_profiles set ${entries.map(([key], i) => `${key}=$${i + 1}`).join(",")}
        where user_id=$${entries.length + 1}::uuid`, [...entries.map(([,value]) => value), userId]);
      return read();
    };
    const fetchProfile = async (url, options) => {
      assert.equal(options.method, "PATCH");
      assert.equal(new URL(url).pathname, "/rest/v1/user_profiles");
      assert.equal(new URL(url).searchParams.get("user_id"), `eq.${userId}`);
      assert.equal(options.headers.authorization, "Bearer synthetic-profile-token");
      const row = await patch(JSON.parse(options.body));
      return new Response(JSON.stringify([{ user_id: userId, display_name: row.display_name,
        avatar_preset: row.avatar_preset, avatar_image: row.avatar_image, username: row.username,
        updated_at: row.version, avatar_image_updated_at: row.avatar_version }]), { status: 200 });
    };
    const config = { storage: { mode: "supabase", url: "https://profile-clock.example.invalid", anonKey: "synthetic-key",
      account: { userId, accessToken: "synthetic-profile-token" } } };
    await run({ times, read, patch, fetchProfile, config, userId });
  } finally { await db.exec("rollback"); }
}

for (const relation of ["older", "equal"]) {
  test(`SQL ${relation} profile writes cannot replace newer identity or regress its version`, async () => {
    await withVersionedProfile(async ({ times, patch }) => {
      await patch({ display_name: "Latest Name", avatar_preset: "avatar-3", updated_at: times[2] });
      const result = await patch({ display_name: "Obsolete Name", avatar_preset: "avatar-2", updated_at: times[relation === "older" ? 1 : 2] });
      assert.equal(result.display_name, "Latest Name");
      assert.equal(result.avatar_preset, "avatar-3");
      assert.equal(Date.parse(result.version), Date.parse(times[2]));
    });
  });
}

test("SQL an unchanged avatar payload cannot lower its version and enable a stale overwrite", async () => {
  await withVersionedProfile(async ({ times, patch }) => {
    await patch({ avatar_image: "data:image/png;base64,bmV3", avatar_image_updated_at: times[2], updated_at: times[2] });
    const unchanged = await patch({ avatar_image: "data:image/png;base64,bmV3", avatar_image_updated_at: times[0], updated_at: times[0] });
    assert.equal(Date.parse(unchanged.avatar_version), Date.parse(times[2]));
    const result = await patch({ avatar_image: "data:image/png;base64,b2xk", avatar_image_updated_at: times[1], updated_at: times[1] });
    assert.equal(result.avatar_image, "data:image/png;base64,bmV3");
  });
});

test("SQL a stale identity with a newer independent avatar preserves the name and accepts the avatar", async () => {
  await withVersionedProfile(async ({ times, patch }) => {
    await patch({ display_name: "Latest Name", avatar_preset: "avatar-3", updated_at: times[2] });
    const result = await patch({ display_name: "Obsolete Name", avatar_preset: "avatar-2", updated_at: times[1],
      avatar_image: "data:image/png;base64,bmV3", avatar_image_updated_at: times[3] });
    assert.equal(result.display_name, "Latest Name");
    assert.equal(result.avatar_preset, "avatar-3");
    assert.equal(result.avatar_image, "data:image/png;base64,bmV3");
    assert.equal(Date.parse(result.avatar_version), Date.parse(times[3]));
    assert.equal(Date.parse(result.version), Date.parse(times[2]));
  });
});

test("SQL newer profile identity and explicit avatar removal still work", async () => {
  await withVersionedProfile(async ({ times, patch }) => {
    const result = await patch({ display_name: "Latest Name", avatar_preset: "avatar-3", updated_at: times[1],
      avatar_image: null, avatar_image_updated_at: times[1] });
    assert.equal(result.display_name, "Latest Name");
    assert.equal(result.avatar_preset, "avatar-3");
    assert.equal(result.avatar_image, null);
    assert.equal(Date.parse(result.version), Date.parse(times[1]));
  });
});

test("SQL unversioned legacy identity changes cannot overwrite a versioned profile", async () => {
  await withVersionedProfile(async ({ patch }) => {
    const result = await patch({ display_name: "Unversioned Name", avatar_preset: "avatar-4" });
    assert.equal(result.display_name, "Original Name");
    assert.equal(result.avatar_preset, "avatar-1");
  });
});

test("SQL username changes cannot roll back the profile clock", async () => {
  await withVersionedProfile(async ({ times, patch, read }) => {
    await patch({ display_name: "Latest Name", updated_at: times[2] });
    await db.query("select public.set_friend_username($1)", ["profile_clock_new"]);
    const result = await read();
    assert.equal(result.username, "profile_clock_new");
    assert.equal(result.display_name, "Latest Name");
    assert.equal(Date.parse(result.version), Date.parse(times[2]));
  });
});

for (const field of ["updated_at", "avatar_image_updated_at"]) {
  for (const invalid of [null, "infinity", "-infinity"]) {
    test(`SQL profile ignores ${field}=${invalid} without poisoning a valid clock`, async () => {
      await withVersionedProfile(async ({ times, patch }) => {
        const result = await patch({ [field]: invalid,
          ...(field === "updated_at" ? { display_name: "Invalid Clock" } : { avatar_image: "data:image/png;base64,bmV3" }) });
        assert.equal(result.display_name, "Original Name");
        assert.equal(result.avatar_image, "data:image/png;base64,b2xk");
        assert.equal(Date.parse(result.version), Date.parse(times[0]));
        assert.equal(Date.parse(result.avatar_version), Date.parse(times[0]));
      });
    });
  }
}

test("SQL a newer identity still saves alongside an obsolete avatar removal", async () => {
  await withVersionedProfile(async ({ times, patch }) => {
    const result = await patch({ display_name: "Latest Name", updated_at: times[2],
      avatar_image: null, avatar_image_updated_at: times[0] });
    assert.equal(result.display_name, "Latest Name");
    assert.equal(result.avatar_image, "data:image/png;base64,b2xk");
    assert.equal(Date.parse(result.version), Date.parse(times[2]));
    assert.equal(Date.parse(result.avatar_version), Date.parse(times[0]));
  });
});

test("profile API delayed PATCH returns canonical newer data instead of committing an obsolete profile", async () => {
  await withVersionedProfile(async ({ times, config, fetchProfile, read }) => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let calls = 0;
    const transport = async (url, options) => {
      if (++calls === 1) await gate;
      return fetchProfile(url, options);
    };
    const oldRequest = syncFriendProfile(config, { displayName: "Obsolete Name", avatarPreset: "avatar-2", profileUpdatedAt: times[1] }, transport);
    try {
      const latest = await syncFriendProfile(config, { displayName: "Latest Name", avatarPreset: "avatar-3", profileUpdatedAt: times[2] }, transport);
      assert.equal(latest.display_name, "Latest Name");
    } finally { release(); }
    const oldReceipt = await oldRequest;
    assert.equal(oldReceipt.display_name, "Latest Name");
    assert.equal(oldReceipt.avatar_preset, "avatar-3");
    assert.equal(Date.parse(oldReceipt.updated_at), Date.parse(times[2]));
    assert.equal((await read()).display_name, "Latest Name");
    assert.equal(calls, 2);
  });
});

test("profile API a delayed image retry cannot resurrect a later explicit removal", async () => {
  await withVersionedProfile(async ({ times, config, fetchProfile, read }) => {
    const oldProfile = { displayName: "Original Name", avatarPreset: "avatar-1", profileUpdatedAt: times[1],
      avatarImage: "data:image/png;base64,bmV3", avatarImageUpdatedAt: times[1] };
    await syncFriendProfile(config, oldProfile, fetchProfile);
    await syncFriendProfile(config, { ...oldProfile, avatarImage: "", avatarImageUpdatedAt: times[2], profileUpdatedAt: times[2] }, fetchProfile);
    const retryReceipt = await syncFriendProfile(config, oldProfile, fetchProfile);
    assert.equal(retryReceipt.avatar_image, null);
    assert.equal((await read()).avatar_image, null);
    assert.equal(Date.parse(retryReceipt.avatar_image_updated_at), Date.parse(times[2]));
  });
});

test("SQL profile migration is idempotent and leaves existing rows and permissions unchanged", async () => {
  await withVersionedProfile(async ({ read }) => {
    const original = await read();
    await db.exec("reset role");
    const permissions = async () => ({
      policies: (await db.query("select * from pg_catalog.pg_policies where schemaname='public' and tablename='user_profiles' order by policyname")).rows,
      grants: (await db.query("select grantee,privilege_type from information_schema.table_privileges where table_schema='public' and table_name='user_profiles' order by grantee,privilege_type")).rows
    });
    const before = await permissions();
    await db.exec(profileVersionMigration);
    await db.exec(profileVersionMigration);
    assert.deepEqual(await permissions(), before);
    await db.exec("set local role authenticated");
    assert.deepEqual(await read(), original);
  });
});

test("SQL profile version protection does not authorize editing another account", async () => {
  await withVersionedProfile(async ({ userId, times }) => {
    await db.exec("reset role");
    const otherId = "00000000-0000-4000-8000-000000000092";
    await db.query("insert into auth.users (id,email) values ($1::uuid,$2)", [otherId, "other-profile@example.invalid"]);
    const previous = (await db.query("select * from public.user_profiles where user_id=$1::uuid", [otherId])).rows[0];
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [userId]);
    await db.exec("set local role authenticated");
    const result = await db.query("update public.user_profiles set display_name=$1,updated_at=$2::timestamptz where user_id=$3::uuid returning user_id", ["Not Authorized", times[2], otherId]);
    assert.equal(result.rows.length, 0);
    await db.exec("reset role");
    assert.deepEqual((await db.query("select * from public.user_profiles where user_id=$1::uuid", [otherId])).rows[0], previous);
  });
});

test("SQL profile rollout verification accepts the installed guard without changing data", async () => {
  await withVersionedProfile(async ({ read }) => {
    const original = await read();
    await db.exec("reset role");
    const result = await db.exec(profileVersionVerification);
    assert.equal(result.at(-1).rows[0].verification_status, "ready");
    assert.deepEqual(await read(), original);
  });
});

test("SQL profile rollout verification rejects a disabled guard", async () => {
  await withVersionedProfile(async () => {
    await db.exec("reset role");
    await db.exec("alter table public.user_profiles disable trigger preserve_versioned_profile_avatar");
    await assert.rejects(db.exec(profileVersionVerification), /Profile version trigger is absent, disabled/);
  });
});

test("SQL profile rollout verification rejects invalid historical clocks without exporting profiles", async () => {
  await withVersionedProfile(async ({ userId }) => {
    await db.exec("reset role");
    await db.exec("alter table public.user_profiles disable trigger preserve_versioned_profile_avatar");
    await db.query("update public.user_profiles set avatar_image_updated_at='infinity'::timestamptz where user_id=$1::uuid", [userId]);
    await db.exec("alter table public.user_profiles enable trigger preserve_versioned_profile_avatar");
    await assert.rejects(db.exec(profileVersionVerification), /Rollout blocked: 1 profiles have invalid historical version clocks/);
  });
});

const ids = Object.fromEntries(["admin", "sender", "recipient", "other"].map((name, index) =>
  [name, `account-00000000-0000-4000-8000-00000000000${index + 1}`]));
const transferId = "transfer-probe";
function state() {
  return { participants: Object.values(ids).map(id => ({ id, kind: "user", displayName: id, accountLinked: true })),
    currentParticipantId: "", groups: [], deletedEvents: [], deletedParticipants: [],
    events: [{ id: "integrity-probe", name: "Synthetic event", currency: "ILS", eventType: "standard",
      participantIds: Object.values(ids), adminIds: [ids.admin], createdByParticipantId: ids.admin,
      adminsCanEditOnly: false, locked: false, expenses: [], notes: [], deletedNotes: [],
      transfers: [{ id: transferId, fromParticipantId: ids.sender, toParticipantId: ids.recipient, amount: 100, status: "pending" }],
      transferStatusUpdates: [] }] };
}
function markPaid(baseline, actor) {
  const candidate = structuredClone(baseline), at = new Date().toISOString();
  Object.assign(candidate.events[0].transfers[0], {
    status: "paid", markedPaidByParticipantId: actor, markedPaidAt: at, statusUpdatedAt: at
  });
  candidate.events[0].transferStatusUpdates = [{ id: transferId, status: "paid", updatedAt: at, markedAt: at, markedPaidByParticipantId: actor }];
  return candidate;
}
async function authorized(previous, candidate, actor, legacy = false) {
  const args = legacy ? "$1::jsonb,$2::jsonb,$3::text" : "$1::jsonb,$2::jsonb,$3::text,$4::text";
  const parameters = [JSON.stringify(previous), JSON.stringify(candidate), actor];
  if (!legacy) parameters.push("integrity-probe-space");
  return (await db.query(`select private.has_authorized_transfer_status_changes(${args}) as ok`, parameters)).rows[0].ok;
}
for (const legacy of [false, true]) {
  test(`SQL ${legacy ? "legacy" : "current"} payment guard rejects unrelated member`, async () => {
    const previous = state();
    assert.equal(await authorized(previous, markPaid(previous, ids.other), ids.other, legacy), false);
  });
  for (const role of ["sender", "recipient", "admin"]) {
    test(`SQL ${legacy ? "legacy" : "current"} payment guard allows ${role}`, async () => {
      const previous = state();
      assert.equal(await authorized(previous, markPaid(previous, ids[role]), ids[role], legacy), true);
    });
  }
}

function noteState(value = "2026-09-04T00:00:00Z") {
  const result = state();
  result.events[0].notes = [{ id: "note-probe", title: "Synthetic note", body: "Body",
    createdAt: value, updatedAt: value, createdByParticipantId: ids.sender, updatedByParticipantId: ids.sender }];
  return result;
}
async function validNotes(candidate) {
  return (await db.query("select private.has_valid_shared_event_notes($1::jsonb) as ok", [JSON.stringify(candidate)])).rows[0].ok;
}
for (const value of ["infinity", "-infinity", null, 42]) {
  test(`SQL notes reject malformed envelope ${JSON.stringify(value)} without field clocks`, async () => {
    assert.equal(await validNotes(noteState(value)), false);
  });
}
for (const field of ["createdAt", "updatedAt"]) {
  test(`SQL notes require ${field} even for legacy notes`, async () => {
    const candidate = noteState();
    delete candidate.events[0].notes[0][field];
    assert.equal(await validNotes(candidate), false);
  });
}
test("SQL notes retain valid legacy dates, timezone offsets and fractional precision", async () => {
  for (const value of ["2026-09-04T00:00:00Z", "2026-09-04T03:00:00.123456+03:00", "2026-09-04T00:00:00.123456789Z"]) {
    assert.equal(await validNotes(noteState(value)), true, value);
  }
});

test("SQL deletion normalization does not launder negative infinity", async () => {
  const deletion = { id: "note-probe", deletedAt: "-infinity", deletedByParticipantId: ids.sender };
  const normalized = (await db.query("select private.rebase_note_deletion_timestamp($1::jsonb, $2::text) as value",
    [JSON.stringify(deletion), "2026-09-04T00:00:00Z"])).rows[0].value;
  assert.deepEqual(normalized, deletion);
  const candidate = state();
  candidate.events[0].deletedNotes = [normalized];
  assert.equal(await validNotes(candidate), false);
});

// Exercise the public RPC as the real authenticated database role, including
// canonical membership, CAS, and every installed trigger (none are disabled).
const snapshotId = "integrity-probe-space";
const spaceKey = "synthetic-test-only-space-key-0001";
async function withSnapshot(actor, run, prepare = value => value) {
  await db.exec("begin");
  try {
    for (const participant of Object.values(ids)) {
      await db.query("insert into auth.users (id,email) values ($1::uuid,$2)",
        [participant.slice(8), `${participant}@example.invalid`]);
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [participant.slice(8)]);
      await db.query(`insert into public.app_snapshots (id,access_key_hash,owner_user_id,state)
        values ($1,encode(extensions.digest($2,'sha256'),'hex'),$3::uuid,$4::jsonb)`,
        [`workspace-${participant.slice(-1)}`, spaceKey, participant.slice(8), JSON.stringify({
          currentParticipantId: participant, participants: [{ id: participant, kind: "user", displayName: "Synthetic account" }],
          groups: [], events: [], deletedEvents: []
        })]);
    }
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [ids.admin.slice(8)]);
    let baseline = state();
    baseline.events[0].expenses = [{ id: "expense-probe", title: "Synthetic expense", total: 200,
      payers: [{ participantId: ids.recipient, amount: 200 }], sharedByParticipantIds: [ids.sender, ids.recipient],
      createdByParticipantId: ids.admin }];
    baseline = await prepare(baseline);
    await db.query(`insert into public.app_snapshots (id,access_key_hash,snapshot_kind,state)
      values ($1,encode(extensions.digest($2,'sha256'),'hex'),'shared_event',$3::jsonb)`,
      [snapshotId, spaceKey, JSON.stringify(baseline)]);
    for (const participant of Object.values(ids)) {
      await db.query(`insert into private.shared_snapshot_members (snapshot_id,user_id,participant_id,role)
        values ($1,$2::uuid,$3,$4) on conflict (snapshot_id,user_id) do nothing`,
        [snapshotId, participant.slice(8), participant, participant === ids.admin ? "admin" : "member"]);
    }
    // JSON preserves PostgreSQL's microsecond CAS token; JS Date would truncate it.
    const initial = (await db.query("select state, to_jsonb(updated_at) as version from public.app_snapshots where id=$1", [snapshotId])).rows[0];
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [actor.slice(8)]);
    await db.exec("set local role authenticated");
    const save = async (candidate, version = initial.version) => {
      try {
        return (await db.query(`select public.update_shared_event_snapshot($1,$2,$3::timestamptz,$4::jsonb) as value`,
          [snapshotId, spaceKey, version, JSON.stringify(candidate)])).rows[0].value;
      } catch (error) {
        // Do not print PGlite's original query or fixture payload on failures.
        throw Object.assign(new Error(error.message), { code: error.code });
      }
    };
    await run(initial.state, save);
  } catch (error) {
    if (error.code && error.query) throw Object.assign(new Error(error.message), { code: error.code });
    throw error;
  } finally { await db.exec("rollback"); }
}
test("SQL full member note write and conflict retry ignore a replica-only membership clock", async () => {
  await withSnapshot(ids.sender, async (previous, save) => {
    const local = structuredClone(previous), at = new Date().toISOString();
    local.events[0].membershipUpdatedAt = at;
    local.events[0].sharedSpaceId = snapshotId;
    local.events[0].sharedSpaceKey = spaceKey;
    local.events[0].notes = [{ id: "member-clock-note", title: "Member note", body: "Synthetic body",
      createdAt: at, updatedAt: at, createdByParticipantId: ids.sender, updatedByParticipantId: ids.sender }];
    let writes = 0;
    const writtenClocks = [];
    const response = value => ({ ok: true, status: 200, json: async () => value });
    const result = await saveSharedEventState({ storage: { mode: "supabase", url: "https://sync-test.invalid",
      table: "app_snapshots", anonKey: "synthetic", account: { userId: ids.sender.slice(8), accessToken: "synthetic-token" } } },
      local, "integrity-probe", async (url, options = {}) => {
        if (url.includes("/rpc/update_shared_event_snapshot")) {
          const body = JSON.parse(options.body);
          writes++;
          // Exercise the final wire payload, including its projection and retry.
          writtenClocks.push(body.p_state.events[0].membershipUpdatedAt);
          if (writes === 1) return response({ status: "conflict" });
          return response(await save(body.p_state, body.p_expected_updated_at));
        }
        assert.equal(options.method ?? "GET", "GET");
        const row = (await db.query("select state,to_jsonb(updated_at) as updated_at from public.app_snapshots where id=$1", [snapshotId])).rows[0];
        return response([row]);
      });
    assert.equal(writes, 2);
    assert.deepEqual(writtenClocks, [previous.events[0].membershipUpdatedAt, previous.events[0].membershipUpdatedAt]);
    assert.equal(result.events[0].notes[0].id, "member-clock-note");
    assert.equal((await db.query("select state->'events'->0->'notes' as notes from public.app_snapshots where id=$1", [snapshotId])).rows[0].notes[0].id, "member-clock-note");
  }, value => {
    delete value.deletedEvents;
    value.events[0].membershipUpdatedAt = "2026-08-29T00:00:00.000Z";
    value.events[0].expenses = [];
    value.events[0].transfers = [];
    return value;
  });
});

test("SQL stale settlement retry preserves the canonical transfer plan at the final write and acknowledgement", async () => {
  const fixture=staleSettlementFixture({owner:ids.admin,peer:ids.sender,third:ids.recipient,fourth:ids.other});
  await withSnapshot(ids.other,async (previous,save)=>{
    const local=structuredClone(previous);
    local.currentParticipantId=ids.other;
    local.participants=fixture.stale.participants;
    Object.assign(local.events[0],{expenses:fixture.stale.events[0].expenses,transfers:fixture.stale.events[0].transfers,
      participantIds:fixture.stale.events[0].participantIds,sharedSpaceId:snapshotId,sharedSpaceKey:spaceKey});
    const response=value=>({ok:true,status:200,json:async()=>value});
    let writes=0;
    const result=await saveSharedEventState({storage:{mode:'supabase',url:'https://stable-plan.invalid',table:'app_snapshots',anonKey:'synthetic',
      account:{userId:ids.other.slice(8),accessToken:'synthetic-token'}}},local,'integrity-probe',async (url,options={})=>{
      if(url.includes('/rpc/update_shared_event_snapshot')) {
        writes++;
        const body=JSON.parse(options.body);
        assert.deepEqual(body.p_state.events[0].transfers,previous.events[0].transfers,'the final wire payload must not replace a valid canonical plan');
        assert.equal(body.p_state.events[0].expenses.length,4);
        if(writes===1)return response({status:'conflict'});
        return response(await save(body.p_state,body.p_expected_updated_at));
      }
      assert.equal(options.method??'GET','GET');
      return response((await db.query('select state,to_jsonb(updated_at) as updated_at from public.app_snapshots where id=$1',[snapshotId])).rows);
    });
    assert.equal(writes,2);
    assert.deepEqual(result.events[0].transfers,previous.events[0].transfers);
    const stored=(await db.query('select state from public.app_snapshots where id=$1',[snapshotId])).rows[0].state;
    assert.deepEqual(stored.events[0].transfers,previous.events[0].transfers);
    assert.equal(stored.events[0].expenses.length,4);
  },previous=>{
    // Shared-event transport omits the personal workspace's deletedEvents index.
    // Match that actual canonical shape, as the other member wire tests do.
    delete previous.deletedEvents;
    previous.participants=fixture.canonical.participants;
    previous.events[0]={...previous.events[0],...fixture.canonical.events[0],id:'integrity-probe'};
    return previous;
  });
});

test("SQL full account link retry moves guest debt and reaches the target personal index", async () => {
  const guest = "guest-link-transport";
  await withSnapshot(ids.admin, async (previous, save) => {
    // Established members already have canonical note projections. A roster-only
    // link must not rewrite each entire workspace just to mirror identical notes.
    await db.exec("reset role");
    await db.query("select private.sync_shared_event_notes_to_workspaces($1,$2::jsonb,clock_timestamp())", [snapshotId, JSON.stringify(previous)]);
    const workspaceVersionsBefore = (await db.query("select id,to_jsonb(updated_at) as version from public.app_snapshots where snapshot_kind='workspace' order by id")).rows;
    assert.equal(workspaceVersionsBefore.length,4);
    await db.exec("set local role authenticated");
    const local = structuredClone(previous);
    local.currentParticipantId = ids.admin;
    local.groups = [{id:"unrelated-local-group",memberIds:[guest],adminIds:[ids.admin]}];
    local.events[0].sharedSpaceId = snapshotId;
    local.events[0].sharedSpaceKey = spaceKey;
    const linked = linkParticipantAccountInEvent(local, "integrity-probe", guest, ids.sender);
    let writes = 0;
    const config = {storage:{mode:"supabase",url:"https://link-test.invalid",table:"app_snapshots",anonKey:"synthetic",
      account:{userId:ids.admin.slice(8),accessToken:"synthetic-token"}}};
    const result = await saveSharedEventState(config, linked, "integrity-probe", async (url,options={}) => {
      const response = value => ({ok:true,status:200,json:async()=>value});
      if(url.includes("/rpc/update_shared_event_snapshot")) {
        writes++;
        const body = JSON.parse(options.body), event = body.p_state.events[0];
        assert.equal(event.participantIds.includes(guest),false);
        assert.equal(event.expenses[0].payers[0].participantId,ids.sender);
        assert.equal(event.expenses[0].total,200);
        assert.equal(event.transfers[0].id,`opaque-debt-${guest}`,"record IDs are opaque, not participant references");
        assert.equal(event.transfers[0].toParticipantId,ids.sender);
        assert.equal(event.transfers[0].amount,100);
        if(writes===1) return response({status:"conflict"});
        return response(await save(body.p_state,body.p_expected_updated_at));
      }
      assert.equal(options.method??"GET","GET");
      return response((await db.query("select state,to_jsonb(updated_at) as updated_at from public.app_snapshots where id=$1",[snapshotId])).rows);
    });
    assert.equal(writes,2);
    assert.equal(result.events[0].participantIds.includes(guest),false);
    await db.exec("reset role");
    const workspaceVersionsAfter = (await db.query("select id,to_jsonb(updated_at) as version from public.app_snapshots where snapshot_kind='workspace' order by id")).rows;
    assert.deepEqual(workspaceVersionsAfter,workspaceVersionsBefore,"a guest link with unchanged notes must not rewrite personal workspaces");
    const targetState=(await db.query("select state from public.app_snapshots where owner_user_id=$1::uuid and snapshot_kind='workspace'",[ids.sender.slice(8)])).rows[0].state;
    const targetEvent=targetState.events.find(e=>e.id==="integrity-probe");
    assert.ok(targetEvent,"the linked member can discover the event through their personal index");
    assert.equal(targetEvent.participantIds.includes(ids.sender),true);
    // The personal index discovers the event; its embedded copy is not eagerly
    // replaced on every canonical edit. Exercise the recipient's authorized
    // canonical read and real hydration before checking the visible membership.
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[ids.sender.slice(8)]);
    await db.exec("set local role authenticated");
    const readable=(await db.query("select state from public.app_snapshots where id=$1",[snapshotId])).rows;
    assert.equal(readable.length,1);
    const hydrated=mergeSharedEventIntoState(targetState,readable[0].state,{id:snapshotId,key:spaceKey});
    assert.equal(hydrated.events.find(e=>e.id==="integrity-probe").participantIds.includes(guest),false);
  }, previous => {
    previous.participants.push({id:guest,kind:"guest",displayName:"Offline person"});
    const event=previous.events[0];event.participantIds.push(guest);
    event.expenses=[{id:"guest-expense",title:"Synthetic expense",total:200,payers:[{participantId:guest,amount:200}],
      sharedByParticipantIds:[guest,ids.recipient],createdByParticipantId:guest}];
    event.transfers=[{id:`opaque-debt-${guest}`,fromParticipantId:ids.recipient,toParticipantId:guest,amount:100,status:"pending"}];
    return previous;
  });
});

// The invite path has its own transactional boundary: membership, canonical
test("SQL stale client retry after a committed account link keeps the receipt and new work", async () => {
  const guest="guest-link-stale-client";
  await withSnapshot(ids.admin,async (previous,save)=>{
    const local={...structuredClone(previous),currentParticipantId:ids.admin};
    local.events[0].sharedSpaceId=snapshotId;local.events[0].sharedSpaceKey=spaceKey;
    local.events[0].participantAccountLinks=[];
    const linked=buildSharedEventState(linkParticipantAccountInEvent(local,"integrity-probe",guest,ids.sender),"integrity-probe");
    await save(linked);
    const proof=linked.events[0].participantAccountLinks[0];
    const at=new Date(Date.now()+1000).toISOString();
    local.events[0].expenses.push({id:"offline-expense-after-link",name:"Offline taxi",total:200,
      payers:[{participantId:guest,amount:200}],sharedByParticipantIds:[guest,ids.recipient],
      updatedAt:at,createdByParticipantId:ids.admin});
    local.events[0].notes=[{id:"offline-note-after-link",title:"Offline note",body:"Keep this new work",createdAt:at,updatedAt:at,
      createdByParticipantId:ids.admin,updatedByParticipantId:ids.admin}];
    let writes=0;
    const response=value=>({ok:true,status:200,json:async()=>value});
    const result=await saveSharedEventState({storage:{mode:"supabase",url:"https://stale-link.invalid",table:"app_snapshots",anonKey:"synthetic",
      account:{userId:ids.admin.slice(8),accessToken:"synthetic-token"}}},local,"integrity-probe",async (url,options={})=>{
      if(url.includes("/rpc/update_shared_event_snapshot")){
        const body=JSON.parse(options.body),event=body.p_state.events[0];writes++;
        assert.deepEqual(event.participantAccountLinks,[proof],"final wire payload must retain the committed receipt");
        assert.equal(event.participantIds.includes(guest),false);
        assert.equal(event.expenses.find(e=>e.id==="offline-expense-after-link").payers[0].participantId,ids.sender);
        if(writes===1)return response({status:"conflict"});
        return response(await save(body.p_state,body.p_expected_updated_at));
      }
      assert.equal(options.method??"GET","GET");
      return response((await db.query("select state,to_jsonb(updated_at) as updated_at from public.app_snapshots where id=$1",[snapshotId])).rows);
    });
    assert.equal(writes,2);
    const canonical=(await db.query("select state from public.app_snapshots where id=$1",[snapshotId])).rows[0].state;
    assert.equal(canonical.events[0].expenses.reduce((sum,e)=>sum+e.total,0),400);
    assert.equal(canonical.events[0].notes[0].body,"Keep this new work");
    const paid=canonical.events[0].transfers.find(transfer=>transfer.id==="stable-debt-before-link");
    assert.equal(paid.status,"paid");assert.equal(paid.amount,100);
    assert.equal(paid.fromParticipantId,ids.admin);assert.equal(paid.toParticipantId,ids.sender);
    assert.equal(paid.markedPaidByParticipantId,ids.admin);
    assert.equal(paid.paidAt,"2026-08-29T00:00:00.000Z");
    const unrelated={...structuredClone(previous.events[0]),id:"unrelated-guest-event"};
    const hydrated=mergeSharedEventIntoState({...local,events:[...local.events,unrelated]},canonical,{id:snapshotId,key:spaceKey});
    assert.deepEqual(hydrated.events.find(e=>e.id==="integrity-probe").participantAccountLinks,[proof]);
    assert.equal(hydrated.events.find(e=>e.id==="integrity-probe").participantIds.includes(guest),false);
    assert.equal(hydrated.events.find(e=>e.id==="unrelated-guest-event").participantIds.includes(guest),true);
    assert.deepEqual(result.events[0].participantAccountLinks,[proof]);
  },previous=>{
    previous.participants.push({id:guest,kind:"guest",displayName:"Offline person"});
    previous.events[0].participantIds.push(guest);
    previous.events[0].expenses=[{id:"existing-guest-expense",name:"Existing taxi",total:200,payers:[{participantId:guest,amount:200}],
      sharedByParticipantIds:[guest,ids.admin],createdByParticipantId:ids.admin}];
    previous.events[0].transfers=[{id:"stable-debt-before-link",fromParticipantId:ids.admin,toParticipantId:guest,amount:100,status:"paid",
      paidAt:"2026-08-29T00:00:00.000Z",markedPaidByParticipantId:ids.admin}];
    return previous;
  });
});

for (const [hasTransfer, commitTiming] of [
  [false, "before read"], [false, "during CAS retry"],
  [true, "before read"], [true, "during CAS retry"]
]) {
  test(`SQL competing account links cannot move debt to a different target ${commitTiming} (transfer=${hasTransfer})`, async () => {
    const guest = "guest-competing-link";
    await withSnapshot(ids.admin, async (previous, save) => {
      const local = { ...structuredClone(previous), currentParticipantId: ids.admin };
      local.events[0].sharedSpaceId = snapshotId;
      local.events[0].sharedSpaceKey = spaceKey;
      const winner = buildSharedEventState(linkParticipantAccountInEvent(local, "integrity-probe", guest, ids.sender), "integrity-probe");
      const loser = linkParticipantAccountInEvent(local, "integrity-probe", guest, ids.other);
      // The later local clock must not turn a conflicting identity decision
      // into an ordinary expense edit after its receipt has been overwritten.
      loser.events[0].expenses[0].updatedAt = new Date(Date.now() + 1000).toISOString();
      let committed = false, writes = 0;
      const commitWinner = async () => {
        const receipt = await save(winner);
        assert.equal(receipt.status, "updated");
        committed = true;
      };
      if (commitTiming === "before read") await commitWinner();
      let failure;
      try {
        await saveSharedEventState({ storage: { mode: "supabase", url: "https://competing-link.invalid",
          table: "app_snapshots", anonKey: "synthetic", account: { userId: ids.admin.slice(8), accessToken: "synthetic" } } },
        loser, "integrity-probe", async (url, options = {}) => {
          const response = value => ({ ok: true, status: 200, json: async () => value });
          if (url.includes("/rpc/update_shared_event_snapshot")) {
            writes++;
            const body = JSON.parse(options.body);
            if (!committed) await commitWinner();
            await db.exec("savepoint competing_link_request");
            try {
              const result = await save(body.p_state, body.p_expected_updated_at);
              await db.exec("release savepoint competing_link_request");
              return response(result);
            } catch (error) {
              await db.exec("rollback to savepoint competing_link_request");
              await db.exec("release savepoint competing_link_request");
              throw error;
            }
          }
          assert.equal(options.method ?? "GET", "GET");
          return response((await db.query("select state,to_jsonb(updated_at) as updated_at from public.app_snapshots where id=$1", [snapshotId])).rows);
        });
      } catch (error) { failure = error; }
      const stored = (await db.query("select state from public.app_snapshots where id=$1", [snapshotId])).rows[0].state;
      assert.equal(stored.events[0].expenses[0].payers[0].participantId, ids.sender,
        "the committed guest-to-account decision must keep its debt owner");
      assert.deepEqual(stored.events[0].participantAccountLinks, winner.events[0].participantAccountLinks);
      assert.equal(stored.events[0].expenses[0].total, 200);
      assert.equal(failure?.code, "SHARED_EVENT_ACCOUNT_LINK_CONFLICT");
      assert.equal(failure.status, 409);
      assert.equal(writes, commitTiming === "before read" ? 0 : 1,
        "stop before sending any payload that disguises the conflicting link");
    }, previous => {
      previous.participants.push({ id: guest, kind: "guest", displayName: "Offline person" });
      previous.events[0].participantIds.push(guest);
      previous.events[0].expenses = [{ id: "competing-guest-expense", title: "Synthetic taxi", total: 200,
        payers: [{ participantId: guest, amount: 200 }], sharedByParticipantIds: [guest, ids.recipient], createdByParticipantId: ids.admin }];
      previous.events[0].transfers = hasTransfer ? [{ id: "competing-guest-debt", fromParticipantId: ids.recipient,
        toParticipantId: guest, amount: 100, status: "pending" }] : [];
      return previous;
    });
  });
}

for (const sameGuest of [false, true]) {
  test(`SQL compatible simultaneous links keep all receipts and money (same guest=${sameGuest})`, async () => {
    const guest = "guest-compatible-first", secondGuest = "guest-compatible-second";
    await withSnapshot(ids.admin, async (previous, save) => {
      const local = { ...structuredClone(previous), currentParticipantId: ids.admin };
      Object.assign(local.events[0], { sharedSpaceId: snapshotId, sharedSpaceKey: spaceKey });
      const first = buildSharedEventState(linkParticipantAccountInEvent(local, "integrity-probe", guest, ids.sender), "integrity-probe");
      const second = linkParticipantAccountInEvent(local, "integrity-probe", sameGuest ? guest : secondGuest, sameGuest ? ids.sender : ids.other);
      // Both devices chose their links from the original roster, before either
      // receipt existed. Only different decisions for the SAME guest conflict.
      await save(first);
      let writes = 0;
      const result = await saveSharedEventState({ storage: { mode: "supabase", url: "https://compatible-link.invalid",
        table: "app_snapshots", anonKey: "synthetic", account: { userId: ids.admin.slice(8), accessToken: "synthetic" } } },
      second, "integrity-probe", async (url, options = {}) => {
        const response = value => ({ ok: true, status: 200, json: async () => value });
        if (url.includes("/rpc/update_shared_event_snapshot")) {
          writes++;
          const body = JSON.parse(options.body);
          return response(await save(body.p_state, body.p_expected_updated_at));
        }
        assert.equal(options.method ?? "GET", "GET");
        return response((await db.query("select state,to_jsonb(updated_at) as updated_at from public.app_snapshots where id=$1", [snapshotId])).rows);
      });
      const canonical = (await db.query("select state from public.app_snapshots where id=$1", [snapshotId])).rows[0].state;
      assert.equal(writes, 1);
      for (const event of [result.events[0], canonical.events[0]]) {
        assert.equal(event.participantAccountLinks.length, sameGuest ? 1 : 2);
        assert.deepEqual(event.participantAccountLinks.find(link => link.sourceParticipantId === guest), first.events[0].participantAccountLinks[0]);
        assert.equal(event.expenses.reduce((sum, expense) => sum + expense.total, 0), 400);
        assert.deepEqual(event.expenses.map(expense => expense.payers[0].participantId), [ids.sender, sameGuest ? secondGuest : ids.other]);
        assert.equal(event.participantIds.includes(guest), false);
        assert.equal(event.participantIds.includes(secondGuest), sameGuest);
      }
    }, previous => {
      for (const id of [guest, secondGuest]) previous.participants.push({ id, kind: "guest", displayName: id });
      previous.events[0].participantIds.push(guest, secondGuest);
      previous.events[0].expenses = [guest, secondGuest].map((id, index) => ({ id: `compatible-expense-${index}`,
        title: "Synthetic taxi", total: 200, payers: [{ participantId: id, amount: 200 }],
        sharedByParticipantIds: [id, ids.recipient], createdByParticipantId: ids.admin }));
      previous.events[0].transfers = [];
      return previous;
    });
  });
}

test("SQL committed account links survive stale receipt arrays and reject guest resurrection", async () => {
  const guest = "guest-link-receipt";
  await withSnapshot(ids.admin, async (previous, save) => {
    const local = {...structuredClone(previous),currentParticipantId:ids.admin};
    const linked = buildSharedEventState(linkParticipantAccountInEvent(local,"integrity-probe",guest,ids.sender),"integrity-probe");
    let receipt = await save(linked);
    const proof = linked.events[0].participantAccountLinks[0];
    const stale = structuredClone(linked);
    stale.events[0].participantAccountLinks = [];
    receipt = await save(stale,receipt.updatedAt);
    const row = (await db.query("select state from public.app_snapshots where id=$1",[snapshotId])).rows[0];
    assert.deepEqual(row.state.events[0].participantAccountLinks,[proof],"an older client cannot erase a committed identity receipt");
    for (const mutate of [
      value => { value.events[0].participantIds.push(guest);value.participants.push(previous.participants.find(p=>p.id===guest)); },
      value => { value.events[0].participantAccountLinks[0].targetParticipantId=ids.other; }
    ]) {
      const changed=structuredClone(row.state);mutate(changed);
      await db.exec("savepoint invalid_link_write");
      await assert.rejects(save(changed,receipt.updatedAt),{code:"42501"});
      await db.exec("rollback to savepoint invalid_link_write");
    }
  }, previous => {
    previous.participants.push({id:guest,kind:"guest",displayName:"Offline person"});
    previous.events[0].participantIds.push(guest);
    return previous;
  });
});

// The invite path has its own transactional boundary: membership, canonical
// participant and personal index must all commit, or none of them may remain.
async function withOpenInvite(run, { workspace = true, expired = false, closed = false } = {}) {
  await withSnapshot(ids.admin, async (_initial, save) => {
    await db.exec("reset role");
    const userId = "00000000-0000-4000-8000-000000000095";
    const participantId = `account-${userId}`;
    const token = "a".repeat(64);
    await db.query("insert into auth.users (id,email) values ($1::uuid,$2)",
      [userId, "invite-join@example.invalid"]);
    if (workspace) {
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [userId]);
      await db.query(`insert into public.app_snapshots (id,access_key_hash,owner_user_id,state)
        values ('invite-workspace',encode(extensions.digest($1,'sha256'),'hex'),$2::uuid,$3::jsonb)`,
        [spaceKey, userId, JSON.stringify({ currentParticipantId: participantId,
          participants: [{ id: participantId, kind: "user", displayName: "Invite member" }],
          groups: [], events: [], deletedEvents: [] })]);
    }
    const inviteId = (await db.query(`insert into public.event_invite_tokens
      (event_id,kind,token_hash,space_id,space_key,created_by,expires_at)
      values ('integrity-probe','open',$1,$2,$3,$4::uuid,$5::timestamptz) returning id`,
      [token, snapshotId, spaceKey, ids.admin.slice(8),
        new Date(Date.now() + (expired ? -60_000 : 60_000)).toISOString()])).rows[0].id;
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [ids.admin.slice(8)]);
    await db.query("select set_config('request.jwt.claim.role','service_role',true)");
    await db.exec("set local role service_role");
    const redeem = async (hash = token) => (await db.query(
      "select public.redeem_event_invite_membership($1::uuid,$2,$3::uuid) as value",
      [inviteId, hash, userId])).rows[0].value;
    const inspect = async () => {
      await db.exec("reset role");
      const shared = (await db.query("select state,to_jsonb(updated_at) as version from public.app_snapshots where id=$1", [snapshotId])).rows[0];
      const members = (await db.query("select participant_id,status from private.shared_snapshot_members where snapshot_id=$1 and user_id=$2::uuid", [snapshotId,userId])).rows;
      const personal = (await db.query("select state from public.app_snapshots where id='invite-workspace'")).rows[0]?.state;
      const receipt = (await db.query("select last_redeemed_at from public.event_invite_tokens where id=$1::uuid", [inviteId])).rows[0];
      await db.exec("set local role service_role");
      return { shared, members, personal, receipt };
    };
    await run({ userId, participantId, redeem, inspect, save });
  }, value => {
    value.events[0].locked = closed;
    return value;
  });
}

test("SQL invite redemption makes membership, canonical data and personal index readable together", async () => {
  await withOpenInvite(async ({ userId, participantId, redeem, inspect, save }) => {
    const result = await redeem();
    assert.equal(result.status, "joined");
    assert.equal(result.canonicalParticipantReady, true);
    assert.equal(result.workspaceIndexed, true);
    const committed = await inspect();
    assert.deepEqual(committed.members, [{ participant_id: participantId, status: "active" }]);
    assert.ok(committed.shared.state.events[0].participantIds.includes(participantId));
    assert.equal(committed.personal.events[0].sharedSpaceId, snapshotId);
    assert.deepEqual(committed.personal.events[0].expenses, committed.shared.state.events[0].expenses);
    assert.ok(committed.receipt.last_redeemed_at);
    // Verify actual RLS visibility and a first note write by the new member.
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [userId]);
    await db.query("select set_config('request.jwt.claim.role','authenticated',true)");
    await db.exec("set local role authenticated");
    const readable = (await db.query("select id from public.app_snapshots where id in ($1,'invite-workspace')", [snapshotId])).rows;
    assert.equal(readable.length, 2);
    const candidate = structuredClone(committed.shared.state);
    const at = new Date().toISOString();
    candidate.events[0].notes = [{ id: "joined-member-note", title: "First note", body: "After joining",
      createdAt: at, updatedAt: at, createdByParticipantId: participantId, updatedByParticipantId: participantId }];
    assert.equal((await save(candidate, committed.shared.version)).status, "updated");
  });
});

test("SQL repeated invite redemption does not duplicate members, events or canonical writes", async () => {
  await withOpenInvite(async ({ redeem, inspect }) => {
    await redeem();
    const first = await inspect();
    assert.equal((await redeem()).status, "existing");
    const second = await inspect();
    assert.equal(second.shared.version, first.shared.version);
    assert.deepEqual(second.shared.state, first.shared.state);
    assert.equal(second.members.length, 1);
    assert.equal(second.personal.events.filter(event => event.id === "integrity-probe").length, 1);
    assert.equal((await db.query("select current_setting('request.jwt.claim.sub') as id")).rows[0].id, ids.admin.slice(8));
  });
});

for (const [name, options, badHash, code] of [
  ["missing workspace", { workspace: false }, false, "P0002"],
  ["expired link", { expired: true }, false, "42501"],
  ["closed event", { closed: true }, false, "42501"],
  ["wrong token", {}, true, "42501"]
]) {
  test(`SQL invite rejection for ${name} leaves no partial join or receipt`, async () => {
    await withOpenInvite(async ({ redeem, inspect }) => {
      const before = await inspect();
      await db.exec("savepoint invite_attempt");
      await assert.rejects(redeem(badHash ? "b".repeat(64) : undefined), { code });
      await db.exec("rollback to savepoint invite_attempt");
      assert.deepEqual(await inspect(), before);
    }, options);
  });
}

test("SQL authenticated RPC rejects payment status from an unrelated active member", async () => {
  await withSnapshot(ids.other, async (previous, save) => {
    await assert.rejects(save(markPaid(previous, ids.other)), { code: "42501", message: "Shared event payment status attribution is invalid" });
  });
});
for (const role of ["sender", "recipient", "admin"]) {
  test(`SQL authenticated RPC allows payment status from ${role}`, async () => {
    await withSnapshot(ids[role], async (previous, save) => {
      assert.equal((await save(markPaid(previous, ids[role]))).status, "updated");
    });
  });
}
test("SQL authenticated RPC keeps CAS conflicts instead of overwriting newer data", async () => {
  await withSnapshot(ids.sender, async (previous, save) => {
    const candidate = markPaid(previous, ids.sender);
    assert.equal((await save(candidate)).status, "updated");
    assert.equal((await save(candidate)).status, "conflict");
  });
});

test("SQL fresh schema and incremental migration install exactly the same definitions", () => {
  assert.equal(schema.slice(schema.indexOf(migrationMarker), schema.indexOf(attributionMarker)).trim(), migration.trim());
  assert.equal(schema.slice(schema.indexOf(attributionMarker), schema.indexOf(profileVersionMarker)).trim(), attributionMigration.trim());
  assert.equal(schema.slice(schema.indexOf(profileVersionMarker),schema.indexOf(accountLinkReceiptMarker)).trim(), profileVersionMigration.trim());
  assert.equal(schema.slice(schema.indexOf(accountLinkReceiptMarker)).trim(), accountLinkReceiptMigration.slice(accountLinkReceiptMigration.indexOf(accountLinkReceiptMarker),accountLinkReceiptMigration.lastIndexOf("commit;")).trim());
});
test("SQL rollout checks preserve enabled triggers and function privileges", async () => {
  await db.exec(rolloutVerification);
  await db.exec(attributionVerification);
});
test("SQL integrity migration can be reapplied without dropping guards or privileges", async () => {
  await db.exec(migration);
  await db.exec(migration);
  await db.exec(attributionMigration);
  await db.exec(attributionMigration);
  await db.exec(attributionVerification);
  const privileges = (await db.query(`select
    has_function_privilege('authenticated','private.can_update_transfer_payment(jsonb,text,text)','execute') as helper,
    has_function_privilege('anon','public.update_shared_event_snapshot(text,text,timestamptz,jsonb)','execute') as anonymous,
    has_function_privilege('authenticated','public.update_shared_event_snapshot(text,text,timestamptz,jsonb)','execute') as member`)).rows[0];
  assert.deepEqual(privileges, { helper: false, anonymous: false, member: true });
});
test("SQL payment guard leaves unrelated historical receipts unchanged", async () => {
  const previous = markPaid(state(), ids.sender);
  const candidate = structuredClone(previous);
  candidate.events[0].notes = noteState().events[0].notes;
  assert.equal(await authorized(previous, candidate, ids.other), true);
});
test("SQL payment guard accepts new pending settlement transfers without status edits", async () => {
  const previous = state(), candidate = structuredClone(previous);
  candidate.events[0].transfers.push({ id: "new-transfer", fromParticipantId: ids.other, toParticipantId: ids.admin, amount: 1, status: "pending" });
  assert.equal(await authorized(previous, candidate, ids.other), true);
});
test("SQL payment authority cannot come from newly claimed admins or endpoints", async () => {
  const previous = state();
  for (const change of [candidate => candidate.events[0].adminIds.push(ids.other),
    candidate => { candidate.events[0].transfers[0].fromParticipantId = ids.other; }]) {
    const candidate = markPaid(previous, ids.other);
    change(candidate);
    assert.equal(await authorized(previous, candidate, ids.other), false);
  }
});
test("SQL payment guard rejects inactive parties and null actors", async () => {
  const previous = state();
  previous.events[0].inactiveParticipantIds = [ids.sender];
  assert.equal(await authorized(previous, markPaid(previous, ids.sender), ids.sender), false);
  assert.equal(await authorized(state(), markPaid(state(), ids.sender), null), false);
});
test("SQL payment guard checks changed journals even when transfer fields are unchanged", async () => {
  const previous = markPaid(state(), ids.sender), candidate = structuredClone(previous);
  candidate.events[0].transferStatusUpdates[0].markedPaidByParticipantId = ids.other;
  assert.equal(await authorized(previous, candidate, ids.other), false);
});
test("SQL payment guard checks transfer fields even when the status journal is unchanged", async () => {
  const previous = markPaid(state(), ids.sender), candidate = structuredClone(previous);
  candidate.events[0].transfers[0].markedPaidByParticipantId = ids.other;
  assert.equal(await authorized(previous, candidate, ids.other), false);
});
for (const malformed of ["infinity", "-infinity", null, "not-a-date"]) {
  test(`SQL RPC rejects malformed new note clock ${JSON.stringify(malformed)}`, async () => {
    await withSnapshot(ids.sender, async (previous, save) => {
      previous.events[0].notes = noteState(malformed).events[0].notes;
      await assert.rejects(save(previous), { code: "22023", message: "Shared event notes are invalid" });
    });
  });
}
test("SQL note clocks reject reversed chronology and malformed per-field clocks", async () => {
  for (const modify of [note => { note.updatedAt = "2020-01-01T00:00:00Z"; },
    note => { note.fieldUpdatedAt = { title: "infinity", body: note.updatedAt, pinned: note.updatedAt }; },
    note => { note.fieldUpdatedAt = {}; }]) {
    const candidate = noteState();
    modify(candidate.events[0].notes[0]);
    assert.equal(await validNotes(candidate), false);
  }
});
test("SQL deletion clocks reject missing, non-string and infinite values", async () => {
  for (const value of [undefined, null, 42, "infinity", "-infinity", "invalid"]) {
    const candidate = state();
    candidate.events[0].deletedNotes = [{ id: "deleted-note", deletedAt: value, deletedByParticipantId: ids.sender }];
    assert.equal(await validNotes(candidate), false, String(value));
  }
});
test("SQL RPC note create/edit/delete is mirrored to all member workspaces atomically", async () => {
  await withSnapshot(ids.sender, async (previous, save) => {
    const candidate = structuredClone(previous);
    // Old finite timestamps remain valid for changes queued offline.
    candidate.events[0].notes = noteState("2020-01-01T00:00:00Z").events[0].notes;
    let result = await save(candidate);
    assert.equal(result.status, "updated");
    candidate.events[0].notes[0].body = "Offline edit";
    candidate.events[0].notes[0].updatedAt = "2020-01-02T00:00:00Z";
    result = await save(candidate, result.updatedAt);
    assert.equal(result.status, "updated");
    await db.exec("reset role");
    let mirrors = (await db.query("select state #> '{events,0,notes}' as notes from public.app_snapshots where owner_user_id is not null")).rows;
    assert.equal(mirrors.length, 4);
    assert.ok(mirrors.every(row => row.notes?.[0]?.body === "Offline edit"));
    await db.exec("set local role authenticated");
    candidate.events[0].notes = [];
    candidate.events[0].deletedNotes = [{ id: "note-probe", deletedAt: "2020-01-01T12:00:00Z", deletedByParticipantId: ids.sender }];
    result = await save(candidate, result.updatedAt);
    assert.equal(result.status, "updated");
    // A repeated older tombstone must preserve the server's committed receipt.
    result = await save(candidate, result.updatedAt);
    assert.equal(result.status, "updated");
    await db.exec("reset role");
    mirrors = (await db.query("select state #> '{events,0,notes}' as notes, state #> '{events,0,deletedNotes}' as deletions from public.app_snapshots where owner_user_id is not null")).rows;
    assert.ok(mirrors.every(row => row.notes?.length === 0 && row.deletions?.length === 1));
    assert.ok(mirrors.every(row => row.deletions[0].deletedAt === "2020-01-02T00:00:00Z"));
  });
});
test("SQL RPC does not normalize an invalid deletion into a valid clock", async () => {
  await withSnapshot(ids.sender, async (previous, save) => {
    previous.events[0].notes = noteState().events[0].notes;
    const result = await save(previous);
    previous.events[0].notes = [];
    previous.events[0].deletedNotes = [{ id: "note-probe", deletedAt: "-infinity", deletedByParticipantId: ids.sender }];
    await assert.rejects(save(previous, result.updatedAt), { code: "22023", message: "Shared event notes are invalid" });
  });
});
test("SQL RPC cannot be used by a removed member", async () => {
  await withSnapshot(ids.sender, async (previous, save) => {
    await db.exec("reset role");
    await db.query("update private.shared_snapshot_members set status='removed' where snapshot_id=$1 and participant_id=$2", [snapshotId, ids.sender]);
    await db.exec("set local role authenticated");
    await assert.rejects(save(markPaid(previous, ids.sender)), { code: "42501", message: "Shared event update is not authorized" });
  });
});

function pendingReceipt(candidate) {
  const at = new Date().toISOString();
  candidate.events[0].transfers = state().events[0].transfers;
  candidate.events[0].transfers[0].statusUpdatedAt = at;
  candidate.events[0].transferStatusUpdates = [{ id: transferId, status: "pending", updatedAt: at, markedAt: at }];
  return candidate;
}
for (const role of ["sender", "recipient", "admin"]) {
  test(`SQL ${role} can undo a locally generated payment before its first commit`, async () => {
    await withSnapshot(ids[role], async (previous, save) => {
      assert.equal((await save(pendingReceipt(previous))).status, "updated");
    }, previous => { previous.events[0].transfers = []; return previous; });
  });
}
test("SQL new pending receipt exception does not authorize unrelated members", async () => {
  await withSnapshot(ids.other, async (previous, save) => {
    await assert.rejects(save(pendingReceipt(previous)), { code: "42501" });
  }, previous => { previous.events[0].transfers = []; return previous; });
});
test("SQL new pending receipt exception cannot create a paid transfer", async () => {
  await withSnapshot(ids.admin, async (previous, save) => {
    previous.events[0].transfers = state().events[0].transfers;
    await assert.rejects(save(markPaid(previous, ids.admin)), { code: "42501" });
  }, previous => { previous.events[0].transfers = []; return previous; });
});
test("SQL new pending receipt exception rejects a paid attribution on a pending record", async () => {
  const previous = state();
  previous.events[0].transfers = [];
  const candidate = pendingReceipt(structuredClone(previous));
  candidate.events[0].transferStatusUpdates[0].markedPaidByParticipantId = ids.admin;
  assert.equal(await authorized(previous, candidate, ids.admin), false);
});
test("SQL new pending receipt exception fails closed with absent endpoint fields", async () => {
  const previous = state();
  previous.events[0].transfers = [];
  const candidate = pendingReceipt(structuredClone(previous));
  delete candidate.events[0].transfers[0].fromParticipantId;
  delete candidate.events[0].transfers[0].toParticipantId;
  assert.equal(await authorized(previous, candidate, ids.other), false);
});

test("SQL guarded guest-account linking preserves historical payment identity", async () => {
  const guest = "guest-link-probe";
  await withSnapshot(ids.admin, async (previous, save) => {
    const candidate = structuredClone(previous), event = candidate.events[0];
    const linkedAt = new Date().toISOString();
    event.participantIds = event.participantIds.filter(id => id !== guest);
    event.inactiveParticipantIds = [guest];
    event.participantAccountLinks = [{ sourceParticipantId: guest, targetParticipantId: ids.sender,
      linkedByParticipantId: ids.admin, linkedAt }];
    event.expenses[0].sharedByParticipantIds = [ids.sender, ids.recipient];
    event.transfers[0].fromParticipantId = ids.sender;
    event.transfers[0].updatedAt = linkedAt;
    await db.exec("reset role");
    assert.equal(await authorized(previous, candidate, ids.admin), true);
    // The legacy overload cannot claim a privileged account-link without ID.
    assert.equal(await authorized(previous, candidate, ids.admin, true), false);
    const forged = structuredClone(candidate);
    forged.events[0].participantAccountLinks[0].linkedByParticipantId = ids.other;
    assert.equal(await authorized(previous, forged, ids.other), false);
    await db.exec("set local role authenticated");
    assert.equal((await save(candidate)).status, "updated");
  }, previous => {
    previous.participants.push({ id: guest, kind: "user", displayName: "Synthetic guest", accountLinked: false });
    previous.events[0].participantIds.push(guest);
    previous.events[0].expenses[0].sharedByParticipantIds = [guest, ids.recipient];
    previous.events[0].transfers[0].fromParticipantId = guest;
    return markPaid(previous, ids.admin);
  });
});
test("SQL involved member can pay and undo in an admin-edit-only closed event", async () => {
  await withSnapshot(ids.sender, async (previous, save) => {
    const paid = markPaid(previous, ids.sender);
    paid.events[0].activityLog = [{ id: "activity-paid-probe", kind: "transfer-paid", entityId: transferId,
      actorParticipantId: ids.sender, fromParticipantId: ids.sender, toParticipantId: ids.recipient,
      occurredAt: paid.events[0].transferStatusUpdates[0].updatedAt }];
    const result = await save(paid);
    assert.equal(result.status, "updated");
    const pending = pendingReceipt(structuredClone(paid));
    pending.events[0].activityLog.push({ id: "activity-pending-probe", kind: "transfer-pending", entityId: transferId,
      actorParticipantId: ids.sender, fromParticipantId: ids.sender, toParticipantId: ids.recipient,
      occurredAt: pending.events[0].transferStatusUpdates[0].updatedAt });
    assert.equal((await save(pending, result.updatedAt)).status, "updated");
  }, previous => {
    previous.events[0].adminsCanEditOnly = true;
    previous.events[0].locked = true;
    return previous;
  });
});
test("SQL rollout refuses existing malformed notes without deleting or repairing them", async () => {
  await withSnapshot(ids.admin, async (previous, save) => {
    // Reproduce a legacy row using the actual pre-migration validators, inside
    // this rollback-only transaction. No triggers or membership checks bypassed.
    const oldSchema = schema.split(migrationMarker)[0];
    await db.exec("reset role");
    for (const name of ["has_valid_note_field_clocks", "has_valid_shared_event_notes"]) {
      const start = oldSchema.lastIndexOf(`create or replace function private.${name}(`);
      assert.ok(start >= 0);
      await db.exec(oldSchema.slice(start, oldSchema.indexOf("\n$$;", start) + 4));
    }
    await db.exec("set local role authenticated");
    const invalidNote = noteState("infinity").events[0].notes[0];
    invalidNote.createdByParticipantId = ids.admin;
    invalidNote.updatedByParticipantId = ids.admin;
    previous.events[0].notes = [invalidNote];
    assert.equal((await save(previous)).status, "updated");
    await db.exec("reset role");
    await db.exec(migration);
    await assert.rejects(db.exec(rolloutVerification), {
      code: "P0001", message: "Rollout blocked: 1 shared snapshots need note-data review"
    });
  });
});

async function withExistingNote(actor, run) {
  await withSnapshot(ids.sender, async (previous, save) => {
    previous.events[0].notes = noteState().events[0].notes;
    const receipt = await save(previous);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [actor.slice(8)]);
    await run(previous, (candidate, version = receipt.updatedAt) => save(candidate, version));
  });
}
for (const field of ["createdAt", "createdByParticipantId", "updatedByParticipantId"]) {
  test(`SQL note attribution rejects admin forgery of ${field}`, async () => {
    await withExistingNote(ids.admin, async (previous, save) => {
      const note = previous.events[0].notes[0];
      note.body = "Admin edit";
      note.updatedAt = "2026-09-05T00:00:00Z";
      note.updatedByParticipantId = ids.admin;
      note[field] = field === "createdAt" ? "2026-09-03T00:00:00Z" : ids.recipient;
      await assert.rejects(save(previous), { code: "42501" });
    });
  });
}
test("SQL note attribution rejects a new note forged by an admin", async () => {
  await withSnapshot(ids.admin, async (previous, save) => {
    previous.events[0].notes = noteState().events[0].notes;
    await assert.rejects(save(previous), { code: "42501" });
  });
});
test("SQL note attribution rejects a forged admin deletion", async () => {
  await withExistingNote(ids.admin, async (previous, save) => {
    previous.events[0].notes = [];
    previous.events[0].deletedNotes = [{ id: "note-probe", deletedAt: "2026-09-05T00:00:00Z", deletedByParticipantId: ids.recipient }];
    await assert.rejects(save(previous), { code: "42501" });
  });
});
test("SQL note attribution keeps legitimate admin edit/delete and creator identity", async () => {
  await withExistingNote(ids.admin, async (previous, save) => {
    previous.events[0].notes[0].body = "Legitimate admin edit";
    previous.events[0].notes[0].updatedAt = "2026-09-05T00:00:00Z";
    previous.events[0].notes[0].updatedByParticipantId = ids.admin;
    const receipt = await save(previous);
    assert.equal(receipt.status, "updated");
    previous.events[0].notes = [];
    previous.events[0].deletedNotes = [{ id: "note-probe", deletedAt: "2026-09-05T01:00:00Z", deletedByParticipantId: ids.admin }];
    assert.equal((await save(previous, receipt.updatedAt)).status, "updated");
  });
});
test("SQL note attribution preserves admin offline create-then-edit before first sync", async () => {
  await withSnapshot(ids.admin, async (previous, save) => {
    const note = noteState("2020-01-01T00:00:00Z").events[0].notes[0];
    Object.assign(note, { createdByParticipantId: ids.admin, updatedByParticipantId: ids.admin, updatedAt: "2020-01-02T00:00:00Z" });
    previous.events[0].notes = [note];
    assert.equal((await save(previous)).status, "updated");
  });
});
for (const field of ["createdByParticipantId", "updatedByParticipantId", "deletedByParticipantId"]) {
  test(`SQL initial note attribution rejects another account in ${field}`, async () => {
    await assert.rejects(withSnapshot(ids.admin, async () => {}, previous => {
      if (field === "deletedByParticipantId") {
        previous.events[0].deletedNotes = [{ id: "note-old", deletedAt: "2020-01-01T00:00:00Z", deletedByParticipantId: ids.recipient }];
      } else {
        const note = noteState().events[0].notes[0];
        note.createdByParticipantId = ids.admin; note.updatedByParticipantId = ids.admin;
        note[field] = ids.recipient;
        previous.events[0].notes = [note];
      }
      return previous;
    }), { code: "42501" });
  });
}
function activity(actor, id = "activity-attribution-probe", time = "2026-09-04T00:00:00.000Z") {
  return { id, kind: "expense-updated", actorParticipantId: actor, entityId: "expense-probe", occurredAt: time, label: "Synthetic action" };
}
test("SQL activity attribution rejects new foreign actor", async () => {
  await withSnapshot(ids.other, async (previous, save) => {
    previous.events[0].activityLog = [activity(ids.sender)];
    await assert.rejects(save(previous), { code: "42501" });
  });
});
test("SQL activity attribution rejects rewriting a committed record", async () => {
  await withSnapshot(ids.sender, async (previous, save) => {
    previous.events[0].activityLog = [activity(ids.sender)];
    const receipt = await save(previous);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [ids.other.slice(8)]);
    previous.events[0].activityLog[0].kind = "participant-removed";
    await assert.rejects(save(previous, receipt.updatedAt), { code: "42501" });
  });
});
test("SQL activity attribution preserves foreign history and the writer's offline batch", async () => {
  await withSnapshot(ids.sender, async (previous, save) => {
    previous.events[0].activityLog = [activity(ids.sender)];
    const receipt = await save(previous);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [ids.other.slice(8)]);
    for (const [index, kind] of ["expense-created", "expense-updated", "expense-deleted"].entries()) {
      previous.events[0] = appendEventActivity(previous.events[0], { ...activity(ids.other, `offline-action-${index}`, `2026-09-05T00:00:0${index}.000Z`), kind });
    }
    assert.equal((await save(previous, receipt.updatedAt)).status, "updated");
  });
});
test("SQL initial activity attribution rejects another linked account", async () => {
  await assert.rejects(withSnapshot(ids.admin, async () => {}, previous => {
    previous.events[0].activityLog = [activity(ids.recipient)];
    return previous;
  }), { code: "42501" });
});
for (const useWriteMerge of [false, true]) {
  test(`SQL note attribution retains guest linking ${useWriteMerge ? "through client write merge" : "directly"}`, async () => {
    const guest = "guest-note-author";
    await withSnapshot(ids.admin, async (previous, save) => {
      let local = structuredClone(previous);
      local.currentParticipantId = ids.admin;
      local = linkParticipantAccountInEvent(local, "integrity-probe", guest, ids.sender);
      let candidate = buildSharedEventState(local, "integrity-probe");
      if (useWriteMerge) candidate = buildSharedEventState(mergeSharedEventWriteState(previous, candidate,
        { storage: { account: { userId: ids.admin.slice(8) } } }), "integrity-probe");
      assert.equal(candidate.events[0].notes[0].createdByParticipantId, ids.sender);
      assert.equal(candidate.events[0].deletedNotes[0].deletedByParticipantId, ids.sender);
      assert.equal((await save(candidate)).status, "updated");
      await db.exec("reset role");
      const stored = (await db.query("select state from public.app_snapshots where id=$1", [snapshotId])).rows[0].state;
      assert.equal(stored.events[0].notes[0].createdByParticipantId, ids.sender);
      assert.equal(stored.events[0].deletedNotes[0].deletedByParticipantId, ids.sender);
    }, previous => {
      previous.participants.push({ id: guest, kind: "user", displayName: "Offline guest", accountLinked: false });
      previous.events[0].participantIds.push(guest);
      const note = noteState().events[0].notes[0];
      note.createdByParticipantId = guest; note.updatedByParticipantId = guest;
      note.fieldUpdatedAt = { title: note.updatedAt, body: note.updatedAt, pinned: note.updatedAt };
      previous.events[0].notes = [note];
      previous.events[0].deletedNotes = [{ id: "guest-deleted-note", deletedAt: "2026-09-04T00:00:00Z", deletedByParticipantId: guest }];
      previous.events[0].activityLog = [activity(guest)];
      return previous;
    });
  });
}

for (const mutation of ["actor", "kind", "label", "entity", "time"]) {
  test(`SQL committed activity cannot change ${mutation} even for its author`, async () => {
    await withSnapshot(ids.sender, async (previous, save) => {
      previous.events[0].activityLog = [activity(ids.sender)];
      const receipt = await save(previous), entry = previous.events[0].activityLog[0];
      const field = { actor: "actorParticipantId", kind: "kind", label: "label", entity: "entityId", time: "occurredAt" }[mutation];
      entry[field] = { actor: ids.recipient, kind: "participant-left", label: "Forged label", entity: "another-expense", time: "2026-09-05T00:00:00.000Z" }[mutation];
      await assert.rejects(save(previous, receipt.updatedAt), { code: "42501" });
    });
  });
}
for (const malformed of ["duplicate-id", "missing-id", "missing-actor", "null-actor", "unknown-kind", "infinite-time"]) {
  test(`SQL new activity rejects ${malformed}`, async () => {
    await withSnapshot(ids.sender, async (previous, save) => {
      const entry = activity(ids.sender);
      previous.events[0].activityLog = [entry];
      if (malformed === "duplicate-id") previous.events[0].activityLog.push({ ...entry });
      if (malformed === "missing-id") delete entry.id;
      if (malformed === "missing-actor") delete entry.actorParticipantId;
      if (malformed === "null-actor") entry.actorParticipantId = null;
      if (malformed === "unknown-kind") entry.kind = "made-up";
      if (malformed === "infinite-time") entry.occurredAt = "infinity";
      await assert.rejects(save(previous), { code: "42501" });
    });
  });
}
test("SQL activity allows harmless equivalent timestamp spellings", async () => {
  await withSnapshot(ids.sender, async (previous, save) => {
    previous.events[0].activityLog = [activity(ids.sender)];
    const receipt = await save(previous);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [ids.other.slice(8)]);
    previous.events[0].activityLog[0].occurredAt = "2026-09-04T03:00:00+03:00";
    assert.equal((await save(previous, receipt.updatedAt)).status, "updated");
  });
});
function history(count) {
  return Array.from({ length: count }, (_, index) => activity(ids.admin, `history-${index}`,
    new Date(Date.UTC(2020, 0, 1, 0, 0, index)).toISOString()));
}

const writeConfig = { storage: { account: { userId: ids.admin.slice(8) } } };
const guestAuthor = "guest-note-author";
function guestHistory(previous, clocks = false) {
  previous.participants.push({ id: guestAuthor, kind: "user", displayName: "Offline guest", accountLinked: false });
  previous.events[0].participantIds.push(guestAuthor);
  const note = noteState().events[0].notes[0];
  Object.assign(note, { createdByParticipantId: guestAuthor, updatedByParticipantId: guestAuthor });
  if (clocks) note.fieldUpdatedAt = { title: note.updatedAt, body: note.updatedAt, pinned: note.updatedAt };
  previous.events[0].notes = [note];
  previous.events[0].deletedNotes = [{ id: "guest-deleted-note", deletedAt: note.updatedAt, deletedByParticipantId: guestAuthor }];
  previous.events[0].activityLog = [activity(guestAuthor)];
  return previous;
}
for (const mutation of ["unrelated-note-author", "activity-label", "activity-actor", "missing-link-proof"]) {
  test(`SQL guest linking does not launder ${mutation}`, async () => {
    await withSnapshot(ids.admin, async (previous, save) => {
      const local = structuredClone(previous); local.currentParticipantId = ids.admin;
      const candidate = buildSharedEventState(linkParticipantAccountInEvent(local, "integrity-probe", guestAuthor, ids.sender), "integrity-probe");
      if (mutation === "unrelated-note-author") candidate.events[0].notes[1].createdByParticipantId = ids.recipient;
      if (mutation === "activity-label") candidate.events[0].activityLog[0].label = "Unrelated forged content";
      if (mutation === "activity-actor") candidate.events[0].activityLog[0].actorParticipantId = ids.recipient;
      if (mutation === "missing-link-proof") {
        candidate.events[0].participantAccountLinks = [];
        candidate.deletedParticipants = [];
        candidate.events[0].participantAliases = { [guestAuthor]: ids.sender };
      }
      await assert.rejects(save(candidate), { code: "42501" });
    }, previous => {
      guestHistory(previous);
      previous.events[0].notes.push({ ...noteState().events[0].notes[0], id: "unrelated-note",
        createdByParticipantId: ids.admin, updatedByParticipantId: ids.admin });
      return previous;
    });
  });
}
for (const mutation of ["member-actor", "connected-source", "missing-tombstone", "renamed-history", "different-names"]) {
  test(`SQL global guest merge rejects ${mutation}`, async () => {
    await withSnapshot(mutation === "member-actor" ? ids.other : ids.admin, async (previous, save) => {
      const local = structuredClone(previous); local.currentParticipantId = ids.admin;
      const candidate = buildSharedEventState(mergeParticipants(local, guestAuthor, "guest-duplicate"), "integrity-probe");
      if (mutation === "missing-tombstone") candidate.deletedParticipants = [];
      if (mutation === "renamed-history") candidate.events[0].activityLog[0].label = "Forged content";
      if (mutation === "different-names" || mutation === "connected-source") {
        // Old names are canonical evidence, not a value the new payload can change.
        await db.exec("reset role");
        const oldState = structuredClone(previous);
        if (mutation === "different-names") oldState.participants.find(p => p.id === "guest-duplicate").displayName = "Different name";
        else oldState.participants.find(p => p.id === guestAuthor).accountLinked = true;
        assert.equal((await db.query("select private.authorized_shared_attribution_remap($1,$2::jsonb,$3::jsonb,$4) as value",
          [snapshotId, JSON.stringify(oldState), JSON.stringify(candidate), ids.admin])).rows[0].value, null);
        return;
      }
      await assert.rejects(save(candidate), { code: "42501" });
    }, previous => {
      guestHistory(previous);
      previous.participants.push({ id: "guest-duplicate", kind: "user", displayName: "Offline guest", accountLinked: false });
      previous.events[0].participantIds.push("guest-duplicate");
      return previous;
    });
  });
}
test("SQL attribution rollout stops on malformed historical activity without repair", async () => {
  await withSnapshot(ids.admin, async (previous) => {
    await db.exec("reset role");
    await db.exec(attributionMigration);
    await db.exec("savepoint before_rollout_check");
    await assert.rejects(db.exec(attributionVerification), /historical note\/activity review/);
    await db.exec("rollback to savepoint before_rollout_check");
    const stored = (await db.query("select state from public.app_snapshots where id=$1", [snapshotId])).rows[0].state;
    assert.deepEqual(stored.events[0].activityLog, previous.events[0].activityLog);
  }, async previous => {
    // Reproduce historical acceptance inside this rollback-only fixture.
    await db.exec("create or replace function private.has_valid_shared_activity_shape(p_activity jsonb) returns boolean language sql immutable as $$ select true; $$");
    previous.events[0].activityLog = [{ ...activity(ids.admin), extraLegacyField: true }]; return previous;
  });
});
test("SQL initial activity rejects an account actor omitted from participants", async () => {
  await assert.rejects(withSnapshot(ids.admin, async () => {}, previous => {
    previous.events[0].activityLog = [activity("account-00000000-0000-4000-8000-000000000099")];
    return previous;
  }), { code: "42501" });
});
for (const clocks of [false, true]) {
  for (const staleRetry of [false, true]) {
    test(`SQL event-scoped guest link preserves ${clocks ? "field-clock" : "legacy"} history on ${staleRetry ? "stale retry" : "first merge"}`, async () => {
      await withSnapshot(ids.admin, async (previous, save) => {
        const local = structuredClone(previous);
        local.currentParticipantId = ids.admin;
        local.groups = [{ id: "another-local-group", memberIds: [guestAuthor], adminIds: [ids.admin] }];
        const linked = buildSharedEventState(linkParticipantAccountInEvent(local, "integrity-probe", guestAuthor, ids.sender), "integrity-probe");
        assert.equal(linked.deletedParticipants.length, 0, "event-scoped link must not delete a guest used elsewhere");
        let candidate, version;
        if (staleRetry) {
          const receipt = await save(linked);
          assert.equal(receipt.status, "updated");
          version = receipt.updatedAt;
          candidate = buildSharedEventState(mergeSharedEventWriteState(linked, previous, writeConfig), "integrity-probe");
        } else {
          candidate = buildSharedEventState(mergeSharedEventWriteState(previous, linked, writeConfig), "integrity-probe");
        }
        assert.equal(candidate.events[0].notes[0].createdByParticipantId, ids.sender);
        assert.equal(candidate.events[0].notes[0].updatedByParticipantId, ids.sender);
        assert.equal(candidate.events[0].deletedNotes[0].deletedByParticipantId, ids.sender);
        assert.equal(candidate.events[0].activityLog[0].actorParticipantId, ids.sender);
        assert.equal((await save(candidate, version)).status, "updated");
      }, previous => guestHistory(previous, clocks));
    });
  }
}
test("SQL global guest-account linking preserves legacy note and activity history", async () => {
  await withSnapshot(ids.admin, async (previous, save) => {
    const local = structuredClone(previous); local.currentParticipantId = ids.admin;
    const linked = buildSharedEventState(linkParticipantAccount(local, guestAuthor, ids.sender), "integrity-probe");
    const candidate = buildSharedEventState(mergeSharedEventWriteState(previous, linked, writeConfig), "integrity-probe");
    assert.equal(candidate.events[0].notes[0].createdByParticipantId, ids.sender);
    assert.equal(candidate.events[0].activityLog[0].actorParticipantId, ids.sender);
    assert.equal((await save(candidate)).status, "updated");
  }, previous => guestHistory(previous));
});
test("SQL duplicate guest matching retains Hebrew marks and Unicode name normalization", async () => {
  await withSnapshot(ids.admin, async (previous, save) => {
    const local = structuredClone(previous); local.currentParticipantId = ids.admin;
    const merged = buildSharedEventState(mergeParticipants(local, guestAuthor, "guest-duplicate"), "integrity-probe");
    const candidate = buildSharedEventState(mergeSharedEventWriteState(previous, merged, writeConfig), "integrity-probe");
    assert.equal(candidate.events[0].notes[0].createdByParticipantId, "guest-duplicate");
    assert.equal((await save(candidate)).status, "updated");
  }, previous => {
    guestHistory(previous);
    previous.participants.find(p => p.id === guestAuthor).displayName = "  דָּנִי   Ａ  ";
    previous.participants.push({ id: "guest-duplicate", kind: "user", displayName: "דני a", accountLinked: false });
    previous.events[0].participantIds.push("guest-duplicate"); return previous;
  });
});
test("SQL write merge preserves raw committed activity when normalizing new records", async () => {
  await withSnapshot(ids.admin, async (previous, save) => {
    const local = structuredClone(previous);
    local.events[0] = appendEventActivity(local.events[0], activity(ids.admin, "new-action", "2026-09-05T00:00:00Z"));
    const candidate = buildSharedEventState(mergeSharedEventWriteState(previous, local, writeConfig), "integrity-probe");
    assert.deepEqual(candidate.events[0].activityLog.find(e => e.id === "precise-history"), previous.events[0].activityLog[0]);
    assert.equal((await save(candidate)).status, "updated");
  }, previous => {
    previous.events[0].activityLog = [{ ...activity(ids.admin, "precise-history", "2026-09-04T00:00:00.123456Z"), label: "Ｆｏｏ  " }];
    return previous;
  });
});
for (const mergedWrite of [false, true]) {
  test(`SQL duplicate offline guest merge retains history ${mergedWrite ? "through write merge" : "directly"}`, async () => {
    await withSnapshot(ids.admin, async (previous, save) => {
      const local = structuredClone(previous); local.currentParticipantId = ids.admin;
      let candidate = buildSharedEventState(mergeParticipants(local, guestAuthor, "guest-duplicate"), "integrity-probe");
      if (mergedWrite) candidate = buildSharedEventState(mergeSharedEventWriteState(previous, candidate, writeConfig), "integrity-probe");
      assert.equal(candidate.events[0].notes[0].createdByParticipantId, "guest-duplicate");
      assert.equal((await save(candidate)).status, "updated");
    }, previous => {
      guestHistory(previous);
      previous.participants.push({ id: "guest-duplicate", kind: "user", displayName: "Offline guest", accountLinked: false });
      previous.events[0].participantIds.push("guest-duplicate");
      return previous;
    });
  });
}
for (const timestamp of ["2026-09-04T00:00:00.123456Z", "2026-09-04T03:00:00.999999999+03:00"]) {
  test(`SQL activity accepts browser millisecond serialization of ${timestamp}`, async () => {
    await withSnapshot(ids.admin, async (previous, save) => {
      // Older deployed clients normalize timestamps before every shared save.
      previous.events[0].activityLog[0].occurredAt = new Date(timestamp).toISOString();
      assert.equal((await save(previous)).status, "updated");
    }, previous => { previous.events[0].activityLog = [activity(ids.admin, "precise-history", timestamp)]; return previous; });
  });
}
for (const count of [99, 100]) {
  test(`SQL activity retains the newest 100 entries from ${count} committed records`, async () => {
    await withSnapshot(ids.other, async (previous, save) => {
      previous.events[0] = appendEventActivity(previous.events[0], activity(ids.other, "new-own-action"));
      assert.equal(previous.events[0].activityLog.length, 100);
      assert.equal((await save(previous)).status, "updated");
    }, previous => { previous.events[0].activityLog = history(count); return previous; });
  });
}
test("SQL activity bounded retention can prune an old close without changing close rules", async () => {
  await withSnapshot(ids.other, async (previous, save) => {
    previous.events[0] = appendEventActivity(previous.events[0], activity(ids.other, "new-own-action"));
    assert.equal((await save(previous)).status, "updated");
  }, previous => {
    previous.events[0].activityLog = history(100);
    previous.events[0].activityLog[0].kind = "event-closed";
    return previous;
  });
});
test("SQL activity cannot discard history below the retention limit", async () => {
  await withSnapshot(ids.other, async (previous, save) => {
    previous.events[0].activityLog = [];
    await assert.rejects(save(previous), { code: "42501" });
  }, previous => { previous.events[0].activityLog = history(2); return previous; });
});
test("SQL activity cannot prune a newer record while retaining older history", async () => {
  await withSnapshot(ids.other, async (previous, save) => {
    previous.events[0].activityLog.pop();
    previous.events[0].activityLog.push(activity(ids.other, "new-own-action"));
    await assert.rejects(save(previous), { code: "42501" });
  }, previous => { previous.events[0].activityLog = history(100); return previous; });
});
test("SQL activity still requires an actual admin close transition", async () => {
  await withSnapshot(ids.admin, async (previous, save) => {
    previous.events[0].activityLog = [{ ...activity(ids.admin), kind: "event-closed" }];
    await assert.rejects(save(previous), { code: "42501", message: "Event close activity must match an admin close transition" });
  });
});
test("SQL activity accepts an actual close and still blocks later note edits", async () => {
  await withExistingNote(ids.admin, async (previous, save) => {
    const at = new Date().toISOString();
    Object.assign(previous.events[0], { locked: true, closedAt: at, statusUpdatedAt: at,
      activityLog: [{ ...activity(ids.admin, "actual-close", at), kind: "event-closed" }] });
    const receipt = await save(previous);
    assert.equal(receipt.status, "updated");
    previous.events[0].notes[0].body = "Cannot edit after closing";
    previous.events[0].notes[0].updatedAt = at;
    previous.events[0].notes[0].updatedByParticipantId = ids.admin;
    await assert.rejects(save(previous, receipt.updatedAt), { code: "42501", message: "Closed event notes and account links cannot be changed" });
  });
});
test("SQL attribution does not obstruct account-deletion anonymization", async () => {
  await withExistingNote(ids.sender, async (previous, save) => {
    previous.events[0].activityLog = [activity(ids.sender)];
    assert.equal((await save(previous)).status, "updated");
    await db.exec("reset role");
    // GoTrue's server-side deletion has no end-user JWT in the database. The
    // API authenticates the user first, then uses its admin credential.
    await db.query("select set_config('request.jwt.claim.sub','',true)");
    await db.query("delete from auth.users where id=$1::uuid", [ids.recipient.slice(8)]);
    const canonical = (await db.query("select state from public.app_snapshots where id=$1", [snapshotId])).rows[0].state;
    assert.equal(canonical.events[0].notes[0].createdByParticipantId, ids.sender);
    assert.deepEqual(canonical.events[0].activityLog, previous.events[0].activityLog);
  });
});
