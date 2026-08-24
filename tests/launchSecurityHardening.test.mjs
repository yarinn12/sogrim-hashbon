import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const schema = await readFile("supabase/schema.sql", "utf8");
const migration = await readFile(
  "supabase/migrations/20260819213100_launch_security_hardening.sql",
  "utf8"
);
const verification = await readFile(
  "supabase/verification/verify_20260819213100_launch_security_hardening.sql",
  "utf8"
);
const financialIntegrityMigration = await readFile(
  "supabase/migrations/20260820120000_harden_shared_financial_integrity.sql",
  "utf8"
);
const financialIntegrityVerification = await readFile(
  "supabase/verification/verify_20260820120000_harden_shared_financial_integrity.sql",
  "utf8"
);
const pairwiseSettlementMigration = await readFile(
  "supabase/migrations/20260823193000_allow_pairwise_direct_reimbursements.sql",
  "utf8"
);
const pairwiseSettlementVerification = await readFile(
  "supabase/verification/verify_20260823193000_allow_pairwise_direct_reimbursements.sql",
  "utf8"
);
const app = await readFile("src/app.mjs", "utf8");

test("launch hardening binds personal snapshots to one authenticated account", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /commit;\s*$/);
  assert.match(migration, /app_snapshots_state_size_check/);
  assert.match(migration, /create or replace function private\.guard_personal_snapshot_write/);
  assert.match(migration, /currentParticipantId/);
  assert.match(migration, /pg_catalog\.jsonb_set\([\s\S]*?account-/);
  assert.match(migration, /A personal workspace already exists for this account/);
  assert.match(schema, /create trigger guard_personal_snapshot_write/);
  assert.match(verification, /A personal workspace still points at another account/);
});

test("friendship, reports and referral rewards use authoritative shared membership", () => {
  assert.match(migration, /private\.shared_snapshot_members as member/);
  assert.match(migration, /snapshot\.snapshot_kind = 'shared_event'/);
  assert.match(migration, /private\.is_active_shared_event_member\(normalized_space_id, actor_id\)/);
  assert.match(migration, /private\.shared_event_qualification_activity/);
  assert.match(migration, /activity\.recorded_at >= referral\.claimed_at/);
  assert.doesNotMatch(
    functionSource(schema, "public.request_friendship_from_event"),
    /jsonb_array_elements/
  );
  assert.doesNotMatch(
    functionSource(schema, "public.submit_user_report"),
    /jsonb_array_elements/
  );
  assert.match(
    functionSource(schema, "public.qualify_referral"),
    /private\.shared_event_qualification_activity/
  );
  assert.match(app, /const sharedSpaceId = String\(getEvent\(eventId\)\?\.sharedSpaceId/);
  assert.match(app, /result\.mode !== "cloud"/);
  assert.match(app, /detail: \{ eventId: sharedSpaceId, kind \}/);
});

test("shared transfer totals and payment attribution are enforced at the table boundary", () => {
  assert.match(migration, /private\.has_valid_shared_event_transfer_totals/);
  assert.match(migration, /private\.has_authorized_transfer_status_changes/);
  assert.match(migration, /Shared event transfers do not match its expenses/);
  assert.match(migration, /A new expense must be attributed to its authenticated creator/);
  assert.match(migration, /Expense creator attribution is immutable/);
  assert.match(migration, /markedPaidByParticipantId'[\s\S]*p_actor_participant_id/);
  assert.match(migration, /create trigger guard_shared_event_financial_integrity/);
  assert.match(schema, /create trigger guard_shared_event_financial_integrity/);
  assert.match(verification, /A forged settlement amount is accepted/);
  assert.match(verification, /A forged payment attribution is accepted/);
  assert.match(verification, /transaction|verification_status|ready/);
});

test("forward shared financial hardening closes synthetic settlement and referral gaps", () => {
  assert.match(financialIntegrityMigration, /^begin;/);
  assert.match(financialIntegrityMigration, /commit;\s*$/);

  const validator = functionSource(
    financialIntegrityMigration,
    "private.is_valid_shared_event_financials"
  );
  assert.match(validator, /participants'\) > 500/);
  assert.match(validator, /expenses'[\s\S]*?> 2000/);
  assert.match(validator, /transfers'[\s\S]*?> 2000/);
  assert.match(validator, /transferStatusUpdates'[\s\S]*?> 2000/);
  assert.match(validator, /deletedExpenses'[\s\S]*?> 2000/);
  assert.doesNotMatch(validator, /> (?:5000|10000)/);

  const accountLinkGuard = functionSource(
    financialIntegrityMigration,
    "private.is_account_linked_shared_participant"
  );
  assert.match(accountLinkGuard, /jsonb_typeof\(p_state -> 'participants'\) = 'array'/);
  assert.match(accountLinkGuard, /else '\[\]'::jsonb/);
  assert.match(accountLinkGuard, /accountLinked/);

  const totalsGuard = functionSource(
    financialIntegrityMigration,
    "private.has_valid_shared_event_transfer_totals"
  );
  assert.match(totalsGuard, /outstanding_balances ->> from_id\)::numeric >= 0/);
  assert.match(totalsGuard, /outstanding_balances ->> to_id\)::numeric <= 0/);
  assert.match(totalsGuard, /where item\.value ->> 'status' = 'paid'/);
  assert.match(totalsGuard, /where item\.value ->> 'status' = 'pending'/);

  const statusGuard = functionSource(
    financialIntegrityMigration,
    "private.has_authorized_transfer_status_changes"
  );
  assert.match(statusGuard, /old_record ->> 'fromParticipantId'/);
  assert.match(statusGuard, /old_record ->> 'toParticipantId'/);
  assert.match(statusGuard, /old_record -> 'amount' is distinct from new_record -> 'amount'/);
  assert.match(statusGuard, /transfer_record is null/);
  assert.match(
    statusGuard,
    /transfer_record ->> 'status'[\s\S]*?new_record ->> 'status'/
  );

  const tableGuard = functionSource(
    financialIntegrityMigration,
    "private.guard_shared_event_financial_integrity"
  );
  assert.match(tableGuard, /tg_op = 'INSERT'/);
  assert.match(tableGuard, /is_account_linked_shared_participant/);
  assert.match(tableGuard, /account-linked expense/);
  assert.match(tableGuard, /current_transfer/);
  assert.match(tableGuard, /previous_transfer/);

  for (const name of [
    "private.is_account_linked_shared_participant",
    "private.is_valid_shared_event_financials",
    "private.has_authorized_transfer_status_changes",
    "private.guard_shared_event_financial_integrity"
  ]) {
    assert.equal(functionSource(schema, name), functionSource(financialIntegrityMigration, name));
  }
  assert.equal(
    functionSource(schema, "private.has_valid_shared_event_transfer_totals"),
    functionSource(pairwiseSettlementMigration, "private.has_valid_shared_event_transfer_totals")
  );
  assert.match(pairwiseSettlementMigration, /directSettlementTransfers/);
  assert.match(pairwiseSettlementVerification, /balanced pairwise direct reimbursement/);
  assert.match(pairwiseSettlementVerification, /crossing route is accepted in optimized mode/);
  assert.match(pairwiseSettlementVerification, /unbalanced direct reimbursement/);

  assert.match(financialIntegrityVerification, /synthetic reverse settlement route/);
  assert.match(financialIntegrityVerification, /cyclic settlement route/);
  assert.match(financialIntegrityVerification, /split settlement route/);
  assert.match(financialIntegrityVerification, /orphan transfer status update/);
  assert.match(financialIntegrityVerification, /same-ID transfer amount mutation/);
  assert.match(financialIntegrityVerification, /500-participant practical cap/);
  assert.match(financialIntegrityVerification, /2000-record practical cap/);
  assert.match(financialIntegrityVerification, /verification_status/);
});

function functionSource(sql, qualifiedName) {
  const marker = `create or replace function ${qualifiedName}`;
  const start = sql.indexOf(marker);
  assert.notEqual(start, -1, `${qualifiedName} is missing`);
  const end = sql.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `${qualifiedName} is incomplete`);
  return sql.slice(start, end + 4);
}
