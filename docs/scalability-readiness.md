# Scalability readiness

The operational scaling decision record, provider responsibilities, paid-tier
triggers and migration gates are maintained in
[`infrastructure-scaling-plan-he.md`](./infrastructure-scaling-plan-he.md).

## Current model

- Each signed-in account owns one `app_snapshots` row.
- Each shared event also owns a separate `app_snapshots` row.
- Writes use optimistic concurrency through the row `updated_at` value.
- Conflicting writes are merged client-side and retried with bounded backoff.
- Unsynced state is kept locally so a temporary conflict or outage does not discard the edit.
- Reads and policies use indexed identifiers (`app_snapshots.id` is the primary key).

This isolates unrelated accounts and events well. The hot spot is a single event that many
people edit at exactly the same time because they all update the same JSON row.

## Repeatable client benchmark

Run:

```powershell
npm.cmd run qa:scale
```

The enforced budgets cover:

- one event with 50 participants and 1,000 expenses;
- one established account with 50 events and 2,500 total expenses.

The script also reports a non-blocking ceiling probe with 100 events and 5,000 expenses.
That scenario is intentionally not a supported production budget because the complete
snapshot approaches the practical storage and transfer ceiling of a mobile WebView.

Run the concurrent-editor gate with the full local capacity suite:

```powershell
npm.cmd run qa:capacity
```

This additionally simulates 10, 25 and 50 editors adding unique expenses from
stale copies of the same shared event. Every expense must survive the merge. The
staging-only network procedure and its production safety locks are documented in
[`capacity-testing-he.md`](./capacity-testing-he.md).

## Current safeguards

- Only changed shared events are written during a normal save.
- Shared-event reads are capped at six simultaneous requests.
- Shared-event writes are capped at three simultaneous requests.
- Cloud conflicts retry up to four times with randomized exponential backoff.
- Long expense ledgers use deferred off-screen rendering.
- Money is stored as integer minor units, so scale does not introduce floating-point drift.

## Before a broad public launch

1. Run a staging load test against a separate Supabase project at 50, 100, and 250
   concurrent clients. Do not load-test the production database.
2. Record p50, p95, and p99 latency, conflict rate, failed-save rate, database CPU,
   PostgREST connections, and payload size.
3. Alert on repeated cloud conflicts, save failures, and snapshots above 2 MB.
4. Move from whole-event JSON snapshots to normalized event, participant, expense,
   payer, share, and transfer rows before events regularly exceed 1,000 expenses or
   the same event regularly has many simultaneous editors.

## Mandatory escalation signals

- Warn at 1.5 MB per snapshot and treat 2 MB as an urgent normalization signal.
- Investigate when p95 save latency exceeds 1.5 seconds; act before 2.5 seconds.
- Start row-level migration work when hourly save-conflict rate exceeds 1%.
- Keep database connection usage below 75% of the active compute limit.
- Stop a rollout when API failures exceed 1% for five minutes.
- Review or upgrade a provider before a metered resource exceeds 85% of its
  allowance; alert at 70%.

These are action thresholds rather than promises of failure. They preserve enough
headroom to diagnose and change capacity without doing emergency work against the
production database.

The normalized model is the long-term path to row-level writes, database transactions,
pagination, and high-contention collaboration without rewriting a complete event.
