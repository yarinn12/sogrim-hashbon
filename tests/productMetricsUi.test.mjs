import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("privacy-safe product metrics load before the app and cover the key funnel", async () => {
  const [index, app, transport] = await Promise.all([
    readFile("index.html", "utf8"),
    readFile("src/app.mjs", "utf8"),
    readFile("src/data/productMetrics.mjs", "utf8")
  ]);

  assert.ok(
    index.indexOf("publicProductMetricsLayer.mjs") < index.indexOf("src/app.mjs"),
    "the error listener must be ready before the application module"
  );
  for (const eventName of [
    "event_creation_started",
    "event_created",
    "expense_started",
    "expense_created",
    "settlement_opened",
    "invite_shared",
    "invite_joined",
    "transfer_marked_paid"
  ]) {
    assert.match(app, new RegExp(`emitProductMetric\\(\"${eventName}\"`));
  }
  assert.match(transport, /loadStoredAccountSession/);
  assert.match(transport, /keepalive: true/);
  assert.match(transport, /const sessionId = createProductMetricId/);
  assert.doesNotMatch(transport, /userId|email|eventId|expenseId|amount|displayName/);
});

test("product metrics schema is anonymous and locked behind the server role", async () => {
  const [schema, deployScript] = await Promise.all([
    readFile("supabase/schema.sql", "utf8"),
    readFile("scripts/apply-supabase-schema.mjs", "utf8")
  ]);
  const tableStart = schema.indexOf("create table if not exists public.product_metrics");
  const tableEnd = schema.indexOf("create or replace function public.delete_account_data", tableStart);
  const productMetricsSchema = schema.slice(tableStart, tableEnd);

  assert.ok(tableStart >= 0);
  assert.doesNotMatch(productMetricsSchema, /user_id|account_id|email/);
  assert.match(productMetricsSchema, /session_id uuid/);
  assert.match(productMetricsSchema, /force row level security/);
  assert.match(
    productMetricsSchema,
    /revoke all on table public\.product_metrics from public, anon, authenticated/
  );
  assert.match(
    productMetricsSchema,
    /grant select, insert, delete on table public\.product_metrics to service_role/
  );
  assert.match(deployScript, /product_metrics_rls_ready/);
  assert.match(deployScript, /product_metrics_client_locked/);
  assert.match(deployScript, /product_metrics_anonymous_ready/);
});
