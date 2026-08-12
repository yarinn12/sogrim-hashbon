import { splitEvenly } from "./money.mjs";

const WHOLE_CURRENCY_UNIT = 100;

export function calculateSettlement(
  participants,
  expenses,
  { roundTransfers = false } = {}
) {
  const validParticipants = (participants ?? []).filter(
    (participant) => participant?.id
  );
  const knownParticipantIds = new Set(
    validParticipants.map((participant) => participant.id)
  );
  const balances = Object.fromEntries(
    validParticipants.map((participant) => [participant.id, 0])
  );
  const issues = [];

  for (const expense of expenses ?? []) {
    const normalizedExpense = normalizeExpenseForSettlement(expense, knownParticipantIds);
    if (normalizedExpense.issue) {
      issues.push({
        expenseId: expense?.id ?? "",
        reason: normalizedExpense.issue
      });
      continue;
    }

    const shares = splitEvenly(
      normalizedExpense.total,
      normalizedExpense.sharedByParticipantIds
    );

    for (const [participantId, share] of Object.entries(shares)) {
      balances[participantId] = (balances[participantId] ?? 0) - share;
    }

    for (const payer of normalizedExpense.payers) {
      balances[payer.participantId] =
        (balances[payer.participantId] ?? 0) + payer.amount;
    }
  }

  const transferBalances = roundTransfers
    ? roundSettlementBalances(balances)
    : balances;
  const transfers = buildTransfersFromBalances(transferBalances);

  return { balances, transfers, issues };
}

export function reconcileSettlementTransfers(
  participants,
  expenses,
  previousTransfers = [],
  { roundTransfers = false } = {}
) {
  const settlement = calculateSettlement(participants, expenses);
  if (settlement.issues.length) {
    return {
      ...settlement,
      transfers: (previousTransfers ?? []).map((transfer) => ({ ...transfer }))
    };
  }

  const knownParticipantIds = new Set(
    (participants ?? []).map((participant) => participant.id).filter(Boolean)
  );
  const outstandingBalances = { ...settlement.balances };
  const paidTransfers = [];
  const usedTransferIds = new Set();
  const appliedPaymentKeys = new Set();

  for (const transfer of previousTransfers ?? []) {
    if (
      transfer?.status !== "paid" ||
      !isPositiveAgoraAmount(transfer.amount) ||
      !knownParticipantIds.has(transfer.fromParticipantId) ||
      !knownParticipantIds.has(transfer.toParticipantId) ||
      transfer.fromParticipantId === transfer.toParticipantId
    ) {
      continue;
    }

    const paymentKey = paidTransferKey(transfer);
    if (appliedPaymentKeys.has(paymentKey)) continue;
    appliedPaymentKeys.add(paymentKey);

    const id = uniqueTransferId(
      String(transfer.id || transferIdFor(transfer)),
      usedTransferIds,
      "history"
    );
    paidTransfers.push({ ...transfer, id, status: "paid" });
    outstandingBalances[transfer.fromParticipantId] += transfer.amount;
    outstandingBalances[transfer.toParticipantId] -= transfer.amount;
  }

  const pendingBalances = roundTransfers
    ? roundSettlementBalances(outstandingBalances)
    : outstandingBalances;
  const pendingTransfers = buildTransfersFromBalances(pendingBalances).map(
    (transfer) => ({
      ...transfer,
      id: uniqueTransferId(transfer.id, usedTransferIds, "remaining")
    })
  );

  return {
    balances: settlement.balances,
    outstandingBalances,
    transfers: [...paidTransfers, ...pendingTransfers],
    issues: []
  };
}

export function usesRoundedSettlementTransfers(event) {
  return event?.roundSettlementTransfers !== false;
}

export function roundSettlementBalances(
  balances,
  unit = WHOLE_CURRENCY_UNIT
) {
  if (!Number.isSafeInteger(unit) || unit <= 0) {
    return { ...(balances ?? {}) };
  }

  const entries = Object.entries(balances ?? {}).map(
    ([participantId, balance], index) => {
      const floorUnits = Math.floor(balance / unit);
      return {
        participantId,
        index,
        floorUnits,
        remainder: balance - floorUnits * unit
      };
    }
  );
  const totalBalance = Object.values(balances ?? {}).reduce(
    (sum, balance) => sum + balance,
    0
  );
  if (totalBalance !== 0 || entries.some(({ floorUnits }) => !Number.isSafeInteger(floorUnits))) {
    return { ...(balances ?? {}) };
  }

  const unitsToDistribute = -entries.reduce(
    (sum, entry) => sum + entry.floorUnits,
    0
  );
  const incrementedParticipantIds = new Set(
    [...entries]
      .sort((first, second) =>
        second.remainder - first.remainder || first.index - second.index
      )
      .slice(0, unitsToDistribute)
      .map((entry) => entry.participantId)
  );

  return Object.fromEntries(
    entries.map((entry) => [
      entry.participantId,
      (entry.floorUnits + Number(incrementedParticipantIds.has(entry.participantId))) * unit
    ])
  );
}

function buildTransfersFromBalances(balances) {
  const entries = Object.entries(balances)
    .filter(([, balance]) => balance !== 0)
    .map(([participantId, balance]) => ({ participantId, balance }));
  const greedyTransfers = buildGreedyTransfers(entries);
  if (entries.length < 4 || entries.length > 12) return greedyTransfers;

  const optimalGroups = findMaximumZeroSumPartition(entries);
  const minimumTransferCount = entries.length - optimalGroups.length;
  if (greedyTransfers.length <= minimumTransferCount) return greedyTransfers;

  return optimalGroups.flatMap((group) => buildGreedyTransfers(group));
}

function buildGreedyTransfers(entries) {
  const debtors = entries
    .filter(({ balance }) => balance < 0)
    .map(({ participantId, balance }) => ({
      participantId,
      amount: Math.abs(balance)
    }));

  const creditors = entries
    .filter(({ balance }) => balance > 0)
    .map(({ participantId, balance }) => ({
      participantId,
      amount: balance
    }));

  const transfers = [];

  while (debtors.some((debtor) => debtor.amount > 0)) {
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const debtor = debtors.find((item) => item.amount > 0);
    const creditor = creditors.find((item) => item.amount > 0);

    if (!debtor || !creditor) break;

    const amount = Math.min(debtor.amount, creditor.amount);
    transfers.push({
      id: `transfer-${debtor.participantId}-${creditor.participantId}-${amount}`,
      fromParticipantId: debtor.participantId,
      toParticipantId: creditor.participantId,
      amount,
      status: "pending"
    });

    debtor.amount -= amount;
    creditor.amount -= amount;
  }

  return transfers;
}

function findMaximumZeroSumPartition(entries) {
  const fullMask = (1 << entries.length) - 1;
  const sums = new Array(fullMask + 1).fill(0);
  for (let mask = 1; mask <= fullMask; mask += 1) {
    const bit = mask & -mask;
    const index = Math.log2(bit);
    sums[mask] = sums[mask ^ bit] + entries[index].balance;
  }

  const memo = new Map([[0, []]]);
  const solve = (mask) => {
    if (memo.has(mask)) return memo.get(mask);

    const requiredBit = mask & -mask;
    let best = null;
    for (let subset = mask; subset > 0; subset = (subset - 1) & mask) {
      if ((subset & requiredBit) === 0 || sums[subset] !== 0) continue;
      const remainingGroups = solve(mask ^ subset);
      if (!remainingGroups) continue;
      const candidate = [subset, ...remainingGroups];
      if (!best || candidate.length > best.length) best = candidate;
    }

    memo.set(mask, best);
    return best;
  };

  return (solve(fullMask) ?? [fullMask]).map((mask) =>
    entries.filter((_, index) => (mask & (1 << index)) !== 0)
  );
}

export function pendingBalanceForParticipant(transfers, participantId) {
  if (!participantId) return 0;

  return (transfers ?? [])
    .filter((transfer) => transfer?.status !== "paid")
    .reduce((balance, transfer) => {
      const amount = Number.isInteger(transfer?.amount) ? transfer.amount : 0;
      if (transfer?.toParticipantId === participantId) return balance + amount;
      if (transfer?.fromParticipantId === participantId) return balance - amount;
      return balance;
    }, 0);
}

export function buildParticipantSettlementBreakdown(participants, expenses, participantId) {
  const knownParticipantIds = new Set(
    (participants ?? []).map((participant) => participant.id).filter(Boolean)
  );
  const expenseShares = [];
  const issues = [];
  let paidTotal = 0;
  let shareTotal = 0;

  for (const expense of expenses ?? []) {
    const normalizedExpense = normalizeExpenseForSettlement(expense, knownParticipantIds);
    if (normalizedExpense.issue) {
      issues.push({
        expenseId: expense?.id ?? "",
        reason: normalizedExpense.issue
      });
      continue;
    }

    const shares = splitEvenly(
      normalizedExpense.total,
      normalizedExpense.sharedByParticipantIds
    );
    const participantPaid = normalizedExpense.payers
      .filter((payer) => payer.participantId === participantId)
      .reduce((sum, payer) => sum + payer.amount, 0);
    const participantShare = shares[participantId] ?? 0;

    if (participantPaid === 0 && participantShare === 0) continue;

    paidTotal += participantPaid;
    shareTotal += participantShare;
    expenseShares.push({
      expenseId: expense?.id ?? "",
      name: expense?.name ?? "הוצאה",
      total: normalizedExpense.total,
      participantPaid,
      participantShare,
      participantCount: normalizedExpense.sharedByParticipantIds.length
    });
  }

  return {
    participantId,
    paidTotal,
    shareTotal,
    balance: paidTotal - shareTotal,
    expenseShares,
    issues
  };
}

function normalizeExpenseForSettlement(expense, knownParticipantIds) {
  if (!expense || !isPositiveAgoraAmount(expense.total)) {
    return { issue: "invalid-total" };
  }

  const sharedByParticipantIds = uniqueIds(expense.sharedByParticipantIds ?? []);
  if (sharedByParticipantIds.length === 0) {
    return { issue: "missing-shared-participants" };
  }

  const payers = Array.isArray(expense.payers) ? expense.payers : [];
  if (payers.length === 0) {
    return { issue: "missing-payers" };
  }

  const payerParticipantIds = payers.map((payer) => payer.participantId);
  if (uniqueIds(payerParticipantIds).length !== payerParticipantIds.length) {
    return { issue: "duplicate-payers" };
  }

  if (sharedByParticipantIds.some((participantId) => !knownParticipantIds.has(participantId))) {
    return { issue: "participant-not-in-event" };
  }

  if (payers.some((payer) => !knownParticipantIds.has(payer.participantId))) {
    return { issue: "participant-not-in-event" };
  }

  if (payers.some((payer) => !isPositiveAgoraAmount(payer.amount))) {
    return { issue: "invalid-payer-amount" };
  }

  const paidTotal = payers.reduce((sum, payer) => sum + payer.amount, 0);
  if (paidTotal !== expense.total) {
    return { issue: "payer-total-mismatch" };
  }

  return {
    total: expense.total,
    payers,
    sharedByParticipantIds
  };
}

function uniqueIds(ids) {
  return [...new Set(ids.filter(Boolean))];
}

function isPositiveAgoraAmount(amount) {
  return Number.isSafeInteger(amount) && amount > 0;
}

function paidTransferKey(transfer) {
  if (transfer.id) return `id:${transfer.id}`;
  return [
    "legacy",
    transfer.fromParticipantId,
    transfer.toParticipantId,
    transfer.amount,
    transfer.markedPaidAt ?? ""
  ].join(":");
}

function transferIdFor(transfer) {
  return `transfer-${transfer.fromParticipantId}-${transfer.toParticipantId}-${transfer.amount}`;
}

function uniqueTransferId(preferredId, usedIds, suffix) {
  const baseId = preferredId || "transfer";
  let id = baseId;
  let index = 1;
  while (usedIds.has(id)) {
    id = `${baseId}-${suffix}-${index}`;
    index += 1;
  }
  usedIds.add(id);
  return id;
}
