import { splitEvenly } from "./money.mjs";

const WHOLE_CURRENCY_UNIT = 100;

export function calculateSettlement(
  participants,
  expenses,
  { roundTransfers = false, directTransfers = false } = {}
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
  const transfers = directTransfers
    ? buildDirectTransfersFromBalances(transferBalances)
    : buildTransfersFromBalances(transferBalances);

  return { balances, transfers, issues };
}

export function reconcileSettlementTransfers(
  participants,
  expenses,
  previousTransfers = [],
  { roundTransfers = false, directTransfers = false } = {}
) {
  const settlement = calculateSettlement(participants, expenses, {
    roundTransfers: directTransfers && roundTransfers,
    directTransfers
  });
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
  const pendingTransfers = buildOutstandingTransfers(
    pendingBalances,
    paidTransfers,
    directTransfers
  ).map(
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

export function groupSettlementTransfersForDisplay(transfers = []) {
  const paidByRoute = new Map();
  const pendingCountByRoute = new Map();
  const emittedPaidRoutes = new Set();

  for (const transfer of transfers) {
    const route = settlementTransferRoute(transfer);
    if (!route) continue;
    if (transfer.status === "paid") {
      const paidTransfers = paidByRoute.get(route) ?? [];
      paidTransfers.push(transfer);
      paidByRoute.set(route, paidTransfers);
      continue;
    }
    pendingCountByRoute.set(route, (pendingCountByRoute.get(route) ?? 0) + 1);
  }

  return transfers.flatMap((transfer) => {
    const route = settlementTransferRoute(transfer);
    const hasSinglePendingRemainder = route && pendingCountByRoute.get(route) === 1;
    const routePaidTransfers = route ? paidByRoute.get(route) ?? [] : [];

    if (transfer.status === "paid" && hasSinglePendingRemainder) return [];

    if (
      transfer.status === "paid" &&
      route &&
      !pendingCountByRoute.has(route) &&
      routePaidTransfers.length > 1
    ) {
      if (emittedPaidRoutes.has(route)) return [];
      emittedPaidRoutes.add(route);
      return [{
        transfer: {
          ...transfer,
          amount: routePaidTransfers.reduce(
            (sum, paidTransfer) => sum + paidTransfer.amount,
            0
          )
        },
        paidHistory: [],
        groupedPaidTransfers: [...routePaidTransfers]
      }];
    }

    return [{
      transfer,
      paidHistory:
        transfer.status !== "paid" && hasSinglePendingRemainder
          ? [...(paidByRoute.get(route) ?? [])]
          : [],
      groupedPaidTransfers: []
    }];
  });
}

export function usesRoundedSettlementTransfers(event) {
  return event?.roundSettlementTransfers !== false;
}

export function usesDirectSettlementTransfers(event) {
  return event?.directSettlementTransfers === true;
}

export function settlementOptionsForEvent(event) {
  return {
    roundTransfers: usesRoundedSettlementTransfers(event),
    directTransfers: usesDirectSettlementTransfers(event)
  };
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

function buildDirectTransfersFromBalances(balances) {
  const entries = Object.entries(balances ?? {})
    .filter(([, balance]) => balance !== 0)
    .map(([participantId, balance]) => ({ participantId, balance }));
  return buildGreedyTransfers(entries);
}

function buildOutstandingTransfers(balances, paidTransfers, directTransfers) {
  const buildTransfers = directTransfers
    ? buildDirectTransfersFromBalances
    : buildTransfersFromBalances;
  const baseline = buildTransfers(balances);
  const blockedRoutes = new Set(
    (paidTransfers ?? []).flatMap((transfer) => {
      if (!settlementTransferRoute(transfer)) return [];
      return [
        `${transfer.toParticipantId}\u0000${transfer.fromParticipantId}`
      ];
    })
  );

  if (
    blockedRoutes.size === 0 ||
    !baseline.some((transfer) =>
      blockedRoutes.has(settlementTransferRoute(transfer))
    )
  ) {
    return baseline;
  }

  const rerouted = buildTransfersAvoidingRoutes(
    balances,
    blockedRoutes,
    buildTransfers
  );
  return amountOnRoutes(rerouted, blockedRoutes) <
      amountOnRoutes(baseline, blockedRoutes)
    ? rerouted
    : baseline;
}

function buildTransfersAvoidingRoutes(balances, blockedRoutes, buildTransfers) {
  const debtors = Object.entries(balances ?? {})
    .filter(([, balance]) => balance < 0)
    .map(([participantId, balance]) => ({
      participantId,
      amount: Math.abs(balance)
    }));
  const creditors = Object.entries(balances ?? {})
    .filter(([, balance]) => balance > 0)
    .map(([participantId, balance]) => ({ participantId, amount: balance }));
  if (!debtors.length || !creditors.length) return [];

  const source = 0;
  const debtorOffset = 1;
  const creditorOffset = debtorOffset + debtors.length;
  const sink = creditorOffset + creditors.length;
  const graph = Array.from({ length: sink + 1 }, () => []);
  const routeEdges = [];
  const addEdge = (from, to, capacity) => {
    const forward = {
      to,
      capacity,
      initialCapacity: capacity,
      reverseIndex: graph[to].length
    };
    const reverse = {
      to: from,
      capacity: 0,
      initialCapacity: 0,
      reverseIndex: graph[from].length
    };
    graph[from].push(forward);
    graph[to].push(reverse);
    return forward;
  };

  debtors.forEach((debtor, debtorIndex) => {
    addEdge(source, debtorOffset + debtorIndex, debtor.amount);
  });
  creditors.forEach((creditor, creditorIndex) => {
    addEdge(creditorOffset + creditorIndex, sink, creditor.amount);
  });
  debtors.forEach((debtor, debtorIndex) => {
    creditors.forEach((creditor, creditorIndex) => {
      const route = `${debtor.participantId}\u0000${creditor.participantId}`;
      if (blockedRoutes.has(route)) return;
      routeEdges.push({
        fromParticipantId: debtor.participantId,
        toParticipantId: creditor.participantId,
        edge: addEdge(
          debtorOffset + debtorIndex,
          creditorOffset + creditorIndex,
          Math.min(debtor.amount, creditor.amount)
        )
      });
    });
  });

  runMaximumFlow(graph, source, sink);
  const allowedTransfers = routeEdges.flatMap((routeEdge) => {
    const amount = routeEdge.edge.initialCapacity - routeEdge.edge.capacity;
    if (!isPositiveAgoraAmount(amount)) return [];
    return [{
      id: transferIdFor({ ...routeEdge, amount }),
      fromParticipantId: routeEdge.fromParticipantId,
      toParticipantId: routeEdge.toParticipantId,
      amount,
      status: "pending"
    }];
  });
  const remainingBalances = { ...(balances ?? {}) };
  for (const transfer of allowedTransfers) {
    remainingBalances[transfer.fromParticipantId] += transfer.amount;
    remainingBalances[transfer.toParticipantId] -= transfer.amount;
  }

  return combineTransfersByRoute([
    ...allowedTransfers,
    ...buildTransfers(remainingBalances)
  ]);
}

function runMaximumFlow(graph, source, sink) {
  while (true) {
    const level = Array(graph.length).fill(-1);
    const queue = [source];
    level[source] = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const node = queue[cursor];
      for (const edge of graph[node]) {
        if (edge.capacity <= 0 || level[edge.to] >= 0) continue;
        level[edge.to] = level[node] + 1;
        queue.push(edge.to);
      }
    }
    if (level[sink] < 0) return;

    const nextEdge = Array(graph.length).fill(0);
    const sendFlow = (node, available) => {
      if (node === sink) return available;
      while (nextEdge[node] < graph[node].length) {
        const edge = graph[node][nextEdge[node]];
        if (edge.capacity > 0 && level[edge.to] === level[node] + 1) {
          const sent = sendFlow(edge.to, Math.min(available, edge.capacity));
          if (sent > 0) {
            edge.capacity -= sent;
            graph[edge.to][edge.reverseIndex].capacity += sent;
            return sent;
          }
        }
        nextEdge[node] += 1;
      }
      return 0;
    };

    while (sendFlow(source, Number.MAX_SAFE_INTEGER) > 0) {}
  }
}

function combineTransfersByRoute(transfers) {
  const combined = new Map();
  for (const transfer of transfers ?? []) {
    const route = settlementTransferRoute(transfer);
    if (!route || !isPositiveAgoraAmount(transfer.amount)) continue;
    const existing = combined.get(route);
    if (existing) {
      existing.amount += transfer.amount;
      existing.id = transferIdFor(existing);
      continue;
    }
    combined.set(route, { ...transfer });
  }
  return [...combined.values()];
}

function amountOnRoutes(transfers, routes) {
  return (transfers ?? []).reduce(
    (sum, transfer) =>
      routes.has(settlementTransferRoute(transfer))
        ? sum + transfer.amount
        : sum,
    0
  );
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

function settlementTransferRoute(transfer) {
  if (!transfer?.fromParticipantId || !transfer?.toParticipantId) return "";
  return `${transfer.fromParticipantId}\u0000${transfer.toParticipantId}`;
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
