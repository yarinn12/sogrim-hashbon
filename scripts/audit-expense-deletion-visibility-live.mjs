import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const databaseUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Database URL is required");

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  ssl: "require"
});

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];

try {
  const snapshots = await sql`
    select
      snapshot.id,
      snapshot.snapshot_kind,
      snapshot.updated_at,
      snapshot.state,
      account.id as owner_user_id,
      profile.display_name as owner_display_name
    from public.app_snapshots as snapshot
    left join auth.users as account
      on account.raw_user_meta_data ->> 'account_space_id' = snapshot.id
    left join public.user_profiles as profile on profile.user_id = account.id
    where snapshot.updated_at >= now() - interval '7 days'
      and pg_catalog.jsonb_typeof(snapshot.state -> 'events') = 'array'
    order by snapshot.updated_at desc
  `;

  const copiesByEventId = new Map();
  for (const snapshot of snapshots) {
    for (const event of list(snapshot.state?.events)) {
      const eventId = text(event?.id);
      if (!eventId) continue;
      const copy = {
        snapshotId: snapshot.id,
        snapshotKind: snapshot.snapshot_kind,
        snapshotUpdatedAt: snapshot.updated_at,
        ownerUserId: snapshot.owner_user_id ?? "",
        ownerDisplayName: snapshot.owner_display_name ?? "",
        eventId,
        eventName: text(event?.name),
        sharedSpaceId: text(event?.sharedSpaceId),
        expenses: list(event?.expenses).map((expense) => ({
          id: text(expense?.id),
          name: text(expense?.name),
          updatedAt: expense?.updatedAt ?? null
        })),
        deletedExpenses: list(event?.deletedExpenses).map((deletion) => ({
          id: text(deletion?.id),
          deletedAt: deletion?.deletedAt ?? null
        })),
        deletionActivities: list(event?.activityLog)
          .filter((activity) => activity?.kind === "expense-deleted")
          .map((activity) => ({
            entityId: text(activity?.entityId),
            label: text(activity?.label),
            occurredAt: activity?.occurredAt ?? null
          }))
      };
      const copies = copiesByEventId.get(eventId) ?? [];
      copies.push(copy);
      copiesByEventId.set(eventId, copies);
    }
  }

  const findings = [];
  const recentDeletions = [];
  for (const [eventId, copies] of copiesByEventId) {
    const canonicalCopies = copies.filter((copy) => copy.snapshotKind === "shared_event");
    const workspaceCopies = copies.filter((copy) => copy.snapshotKind !== "shared_event");
    const canonical = canonicalCopies[0] ?? null;

    for (const copy of copies) {
      const liveExpenseIds = new Set(copy.expenses.map((expense) => expense.id));
      for (const deletion of copy.deletedExpenses) {
        recentDeletions.push({
          eventId,
          eventName: copy.eventName,
          snapshotId: copy.snapshotId,
          snapshotKind: copy.snapshotKind,
          ownerUserId: copy.ownerUserId,
          ownerDisplayName: copy.ownerDisplayName,
          expenseId: deletion.id,
          expenseName: copy.deletionActivities.find(
            (activity) => activity.entityId === deletion.id
          )?.label ?? "",
          deletedAt: deletion.deletedAt,
          stillLiveInSameCopy: liveExpenseIds.has(deletion.id)
        });
        if (liveExpenseIds.has(deletion.id)) {
          findings.push({
            kind: "live-and-deleted-in-same-copy",
            eventId,
            expenseId: deletion.id,
            snapshotId: copy.snapshotId
          });
        }
      }
    }

    if (!canonical) continue;
    const canonicalDeletedIds = new Set(
      canonical.deletedExpenses.map((deletion) => deletion.id)
    );
    for (const workspace of workspaceCopies) {
      for (const deletion of workspace.deletedExpenses) {
        if (!canonicalDeletedIds.has(deletion.id)) {
          findings.push({
            kind: "workspace-deletion-missing-from-canonical",
            eventId,
            eventName: workspace.eventName,
            expenseId: deletion.id,
            workspaceId: workspace.snapshotId,
            ownerUserId: workspace.ownerUserId,
            ownerDisplayName: workspace.ownerDisplayName,
            deletedAt: deletion.deletedAt,
            canonicalSnapshotId: canonical.snapshotId
          });
        }
      }
      for (const deletion of canonical.deletedExpenses) {
        if (workspace.expenses.some((expense) => expense.id === deletion.id)) {
          findings.push({
            kind: "canonical-deletion-still-live-in-workspace",
            eventId,
            eventName: workspace.eventName,
            expenseId: deletion.id,
            workspaceId: workspace.snapshotId,
            ownerUserId: workspace.ownerUserId,
            ownerDisplayName: workspace.ownerDisplayName,
            deletedAt: deletion.deletedAt,
            canonicalSnapshotId: canonical.snapshotId
          });
        }
      }
    }
  }

  recentDeletions.sort((left, right) =>
    text(right.deletedAt).localeCompare(text(left.deletedAt))
  );

  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    readOnly: true,
    ok: findings.length === 0,
    snapshotCount: snapshots.length,
    eventCount: copiesByEventId.size,
    findings,
    recentDeletions: recentDeletions.slice(0, 50)
  }, null, 2));

  if (findings.length) process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
