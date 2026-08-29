import { resolve } from "node:path";
import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";

const root = process.cwd();
loadEnvFile(resolve(root, ".env.local"));
loadEnvFile(resolve(root, ".env"));

const strict = process.argv.includes("--strict");
const databaseUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Supabase database URL is not configured");

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  ssl: "require"
});

try {
  const [rpcStatus] = await sql`
    select pg_catalog.to_regprocedure(
      'public.admin_operational_health(integer)'
    ) is not null as available,
    pg_catalog.to_regprocedure(
      'public.admin_shared_event_index_health()'
    ) is not null as event_index_available,
    pg_catalog.to_regprocedure(
      'public.admin_connected_event_publication_health()'
    ) is not null as event_publication_available
  `;
  const policies = await sql`
    select
      class.relname as table_name,
      class.relrowsecurity as rls_enabled,
      class.relforcerowsecurity as rls_forced
    from pg_catalog.pg_class as class
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname in (
        'app_snapshots',
        'broadcast_notification_deliveries',
        'notification_inbox',
        'product_metrics',
        'push_devices'
      )
    order by class.relname
  `;
  const [sharedEventIdentity] = await sql`
    select
      index_row.indisunique,
      index_row.indisvalid,
      index_row.indpred is not null as has_predicate
    from pg_catalog.pg_index as index_row
    where index_row.indexrelid = pg_catalog.to_regclass(
      'public.app_snapshots_shared_event_event_id_uidx'
    )
  `;
  const [productMetricClock] = await sql`
    select
      pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(
          'public.reserve_product_metric_batch(uuid,integer,integer,integer)'::regprocedure
        ),
        'current_timestamp_value timestamptz'
      ) > 0 as unambiguous
  `;
  let health = null;
  let eventIndexHealth = null;
  let eventPublicationHealth = null;
  if (rpcStatus?.available) {
    const [row] = await sql`
      select public.admin_operational_health(30) as health
    `;
    health = row?.health ?? null;
  }
  if (rpcStatus?.event_index_available) {
    const [row] = await sql`
      select public.admin_shared_event_index_health() as health
    `;
    eventIndexHealth = row?.health ?? null;
  }
  if (rpcStatus?.event_publication_available) {
    const [row] = await sql`
      select public.admin_connected_event_publication_health() as health
    `;
    eventPublicationHealth = row?.health ?? null;
  }

  const expectedTables = 5;
  const protectedTables = policies.filter(
    (policy) => policy.rls_enabled && policy.rls_forced
  ).length;
  const checks = {
    operationalRpc: Boolean(rpcStatus?.available),
    protectedOperationalTables:
      policies.length === expectedTables && protectedTables === expectedTables,
    accountWorkspaceContinuity:
      Number(health?.dataContinuity?.accountsWithoutWorkspace ?? -1) === 0,
    sharedEventMembershipContinuity:
      Number(health?.dataContinuity?.eventsWithoutActiveMembers ?? -1) === 0,
    sharedEventPersonalIndexContinuity:
      Number(
        eventIndexHealth?.activeMembershipsMissingPersonalIndex ?? -1
      ) === 0,
    connectedEventPublicationContinuity:
      Number(
        eventPublicationHealth?.activeUnsharedMultiAccountCreatorEvents ?? -1
      ) === 0,
    uniqueSharedEventIdentity:
      Boolean(sharedEventIdentity?.indisunique) &&
      Boolean(sharedEventIdentity?.indisvalid) &&
      Boolean(sharedEventIdentity?.has_predicate),
    noStalePushReservations:
      Number(health?.pushDelivery?.stalePending ?? -1) === 0,
    productMetricRateLimitClock: Boolean(productMetricClock?.unambiguous),
    snapshotStreamPresent: Boolean(health?.dataContinuity?.latestSnapshotAt)
  };
  const failedChecks = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);

  console.log(JSON.stringify({
    ok: failedChecks.length === 0,
    strict,
    checkedAt: new Date().toISOString(),
    checks,
    failedChecks,
    summary: {
      latestSnapshotAt: health?.dataContinuity?.latestSnapshotAt ?? null,
      accountsWithoutWorkspace: Number(
        health?.dataContinuity?.accountsWithoutWorkspace ?? 0
      ),
      eventsWithoutActiveMembers: Number(
        health?.dataContinuity?.eventsWithoutActiveMembers ?? 0
      ),
      activeMembershipsMissingPersonalIndex: Number(
        eventIndexHealth?.activeMembershipsMissingPersonalIndex ?? 0
      ),
      activeUnsharedMultiAccountCreatorEvents: Number(
        eventPublicationHealth?.activeUnsharedMultiAccountCreatorEvents ?? 0
      ),
      duplicateSharedEventIds: sharedEventIdentity?.indisvalid ? 0 : null,
      stalePushReservations: Number(health?.pushDelivery?.stalePending ?? 0),
      failuresLast24Hours: Number(health?.telemetry?.failuresLast24Hours ?? 0),
      deferredLast24Hours: Number(health?.telemetry?.deferredLast24Hours ?? 0)
    }
  }, null, 2));

  if (strict && failedChecks.length) process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
