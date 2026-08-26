import { resolve } from "node:path";
import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";
import { PRODUCT_METRIC_NAMES } from "../src/domain/productMetrics.mjs";

const root = process.cwd();
loadEnvFile(resolve(root, ".env.local"));
loadEnvFile(resolve(root, ".env"));

const databaseUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Supabase database URL is not configured");

const requestedDays = Number(process.argv[2] ?? 7);
const days = Number.isSafeInteger(requestedDays) && requestedDays >= 1 && requestedDays <= 90
  ? requestedDays
  : 7;
const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  ssl: "require"
});

try {
  const counts = await sql`
    select event_name, pg_catalog.count(*)::integer as count
    from public.product_metrics
    where received_at >= pg_catalog.now() - pg_catalog.make_interval(days => ${days})
    group by event_name
  `;
  const errors = await sql`
    select platform, app_version, build_number, screen, detail, pg_catalog.count(*)::integer as count
    from public.product_metrics
    where event_name = 'client_error'
      and received_at >= pg_catalog.now() - pg_catalog.make_interval(days => ${days})
    group by platform, app_version, build_number, screen, detail
    order by count desc
    limit 10
  `;
  const operationFailures = await sql`
    select platform, app_version, build_number, screen, detail, pg_catalog.count(*)::integer as count
    from public.product_metrics
    where event_name = 'operation_failure'
      and received_at >= pg_catalog.now() - pg_catalog.make_interval(days => ${days})
    group by platform, app_version, build_number, screen, detail
    order by count desc
    limit 10
  `;
  const deferredOperations = await sql`
    select platform, app_version, build_number, screen, detail, pg_catalog.count(*)::integer as count
    from public.product_metrics
    where event_name = 'operation_deferred'
      and received_at >= pg_catalog.now() - pg_catalog.make_interval(days => ${days})
    group by platform, app_version, build_number, screen, detail
    order by count desc
    limit 10
  `;
  const [sessionHealth] = await sql`
    select
      pg_catalog.count(distinct session_id)::integer as sessions,
      pg_catalog.count(distinct session_id) filter (
        where event_name in ('client_error', 'operation_failure')
      )::integer as affected_sessions
    from public.product_metrics
    where session_id is not null
      and received_at >= pg_catalog.now() - pg_catalog.make_interval(days => ${days})
  `;
  const releaseHealth = await sql`
    select
      platform,
      app_version,
      build_number,
      pg_catalog.count(distinct session_id)::integer as sessions,
      pg_catalog.count(distinct session_id) filter (
        where event_name in ('client_error', 'operation_failure')
      )::integer as affected_sessions
    from public.product_metrics
    where session_id is not null
      and received_at >= pg_catalog.now() - pg_catalog.make_interval(days => ${days})
    group by platform, app_version, build_number
    order by sessions desc
  `;
  const totals = Object.fromEntries(PRODUCT_METRIC_NAMES.map((name) => [name, 0]));
  for (const row of counts) totals[row.event_name] = Number(row.count) || 0;

  const report = {
    windowDays: days,
    collectedEvents: Object.values(totals).reduce((sum, count) => sum + count, 0),
    counts: totals,
    completionRates: {
      eventCreation: rate(totals.event_created, totals.event_creation_started),
      firstExpense: rate(totals.expense_created, totals.expense_started),
      inviteJoin: rate(totals.invite_joined, totals.invite_shared)
    },
    clientErrorsPerAppReady: rate(totals.client_error, totals.app_ready),
    operationFailuresPerAppReady: rate(totals.operation_failure, totals.app_ready),
    sessionHealth: healthSummary(sessionHealth),
    releaseHealth: releaseHealth.map(healthSummary),
    topTechnicalErrors: errors.map((row) => ({
      platform: row.platform,
      appVersion: row.app_version,
      buildNumber: Number(row.build_number) || 0,
      screen: row.screen,
      technicalClass: row.detail,
      count: Number(row.count) || 0
    })),
    topOperationFailures: operationFailures.map(operationSummary),
    topDeferredOperations: deferredOperations.map(operationSummary)
  };

  console.log(JSON.stringify(report, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}

function rate(numerator, denominator) {
  if (!denominator) return null;
  return Number((numerator / denominator).toFixed(3));
}

function healthSummary(row = {}) {
  const sessions = Number(row.sessions) || 0;
  const affectedSessions = Number(row.affected_sessions) || 0;
  return {
    ...(row.platform ? {
      platform: row.platform,
      appVersion: row.app_version,
      buildNumber: Number(row.build_number) || 0
    } : {}),
    sessions,
    affectedSessions,
    errorFreeSessionRate: sessions
      ? Number(((sessions - affectedSessions) / sessions).toFixed(4))
      : null
  };
}

function operationSummary(row = {}) {
  const [operation = "unknown", failureClass = "legacy"] = String(row.detail ?? "").split(":");
  return {
    platform: row.platform,
    appVersion: row.app_version,
    buildNumber: Number(row.build_number) || 0,
    screen: row.screen,
    operation,
    failureClass,
    count: Number(row.count) || 0
  };
}
