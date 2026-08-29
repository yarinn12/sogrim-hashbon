import { createHash, randomBytes } from "node:crypto";
import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const apply = process.argv.includes("--apply");
const databaseUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Database URL is required");

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  ssl: "require"
});

try {
  const candidates = await sql`
    select
      users.id as user_id,
      users.raw_user_meta_data as metadata,
      nullif(users.raw_user_meta_data ->> 'account_space_id', '') as configured_space_id,
      configured.owner_user_id as configured_owner_user_id,
      configured.id is not null as configured_snapshot_exists,
      coalesce(owned.owned_count, 0)::integer as owned_count,
      coalesce(referenced.reference_count, 0)::integer as reference_count,
      coalesce(shared_memberships.membership_count, 0)::integer as membership_count,
      coalesce(shared_references.reference_count, 0)::integer as shared_reference_count
    from auth.users as users
    left join public.app_snapshots as configured
      on configured.id = users.raw_user_meta_data ->> 'account_space_id'
    left join lateral (
      select count(*) as owned_count
      from public.app_snapshots as snapshot
      where snapshot.owner_user_id = users.id
        and snapshot.snapshot_kind = 'workspace'
    ) as owned on true
    left join lateral (
      select count(*) as reference_count
      from public.app_snapshots as snapshot
      where snapshot.snapshot_kind = 'workspace'
        and exists (
          select 1
          from jsonb_array_elements(coalesce(snapshot.state -> 'participants', '[]'::jsonb)) as participant
          where participant ->> 'authSubject' = users.id::text
        )
    ) as referenced on true
    left join lateral (
      select count(*) as membership_count
      from private.shared_snapshot_members as member
      where member.user_id = users.id
    ) as shared_memberships on true
    left join lateral (
      select count(*) as reference_count
      from public.app_snapshots as snapshot
      where snapshot.snapshot_kind = 'shared_event'
        and exists (
          select 1
          from jsonb_array_elements(
            case
              when jsonb_typeof(snapshot.state -> 'participants') = 'array'
                then snapshot.state -> 'participants'
              else '[]'::jsonb
            end
          ) as participant
          where participant ->> 'id' = 'account-' || users.id::text
        )
    ) as shared_references on true
    where users.confirmed_at is not null
      and not exists (
        select 1
        from public.app_snapshots as existing_workspace
        where existing_workspace.owner_user_id = users.id
          and existing_workspace.snapshot_kind = 'workspace'
      )
      and (
        configured.id is null
        or configured.owner_user_id is distinct from users.id
      )
    order by users.created_at
  `;

  const unsafe = candidates.filter((candidate) => (
    candidate.owned_count !== 0 ||
    candidate.reference_count !== 0 ||
    candidate.membership_count !== 0 ||
    candidate.shared_reference_count !== 0
  ));
  if (unsafe.length) {
    throw new Error(`Refusing repair: ${unsafe.length} account(s) have possible recoverable history`);
  }

  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", repairable: candidates.length, unsafe: 0 }));
    process.exitCode = candidates.length ? 2 : 0;
  } else {
    await sql.begin(async (transaction) => {
      for (const candidate of candidates) {
        const workspaceId = `space-account-repair-${randomBytes(12).toString("hex")}`;
        const workspaceKey = randomBytes(32).toString("base64url");
        const accessKeyHash = createHash("sha256").update(workspaceKey).digest("hex");
        const metadata = candidate.metadata && typeof candidate.metadata === "object"
          ? candidate.metadata
          : {};
        const displayName = String(
          metadata.username || metadata.full_name || metadata.name || "משתמש"
        ).trim() || "משתמש";
        const participantId = `account-${candidate.user_id}`;
        const state = {
          currentParticipantId: participantId,
          participants: [{
            id: participantId,
            displayName,
            kind: "user",
            authSubject: candidate.user_id
          }],
          friendContacts: [],
          groups: [],
          events: [],
          deletedEvents: []
        };

        // Run the guarded insert with the same authenticated subject the RLS
        // and ownership trigger expect. This preserves the production guard.
        await transaction`select set_config('request.jwt.claim.sub', ${candidate.user_id}, true)`;

        await transaction`
          insert into public.app_snapshots (
            id, access_key_hash, owner_user_id, snapshot_kind, state, updated_at
          ) values (
            ${workspaceId}, ${accessKeyHash}, ${candidate.user_id}, 'workspace',
            ${transaction.json(state)}, now()
          )
        `;
        await transaction`
          update auth.users
          set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || ${transaction.json({
            account_space_id: workspaceId,
            account_space_key: workspaceKey
          })},
          updated_at = now()
          where id = ${candidate.user_id}
        `;
      }
    });

    console.log(JSON.stringify({ mode: "apply", repaired: candidates.length }));
  }
} finally {
  await sql.end({ timeout: 5 });
}
