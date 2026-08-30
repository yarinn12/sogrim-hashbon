import { splitEvenly, sumMoneyAmounts } from "./money.mjs";

const WHOLE_CURRENCY_UNIT = 100;

export function calculateSettlement(
  participants,
  expenses,
  { roundTransfers = false, directTransfers = false } = {}
) {
  const validParticipants = (participants ?? []).filter(
    (participant) => participant?.id
  );
  const ledger = buildSettlementLedger(validParticipants, expenses);
  const { balances, issues } = ledger;

  const transferBalances = roundTransfers
    ? roundSettlementBalances(balances)
    : balances;
  const transfers = directTransfers
    ? buildDirectTransfersFromBalances(
        transferBalances,
        buildDirectRoutePreferencesFromLedger(ledger.acceptedExpenses),
        roundTransfers ? WHOLE_CURRENCY_UNIT : 1
      )
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
  let paidHistoryTotal = 0;

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
    const nextFromBalance = safeMoneySum(
      outstandingBalances[transfer.fromParticipantId],
      transfer.amount
    );
    const nextToBalance = safeMoneySum(
      outstandingBalances[transfer.toParticipantId],
      -transfer.amount
    );
    if (nextFromBalance === null || nextToBalance === null) {
      return {
        ...settlement,
        transfers: (previousTransfers ?? []).map((item) => ({ ...item })),
        issues: [{
          transferId: transfer.id ?? "",
          reason: "unsafe-paid-history"
        }]
      };
    }
    const nextPaidHistoryTotal = safeMoneySum(paidHistoryTotal, transfer.amount);
    if (nextPaidHistoryTotal === null) {
      return {
        ...settlement,
        transfers: (previousTransfers ?? []).map((item) => ({ ...item })),
        issues: [{
          transferId: transfer.id ?? "",
          reason: "unsafe-paid-history"
        }]
      };
    }

    paidTransfers.push({ ...transfer, id, status: "paid" });
    paidHistoryTotal = nextPaidHistoryTotal;
    outstandingBalances[transfer.fromParticipantId] = nextFromBalance;
    outstandingBalances[transfer.toParticipantId] = nextToBalance;
  }

  if (!hasSafeBalancedExposure(outstandingBalances)) {
    return {
      ...settlement,
      transfers: (previousTransfers ?? []).map((item) => ({ ...item })),
      issues: [{ reason: "unsafe-paid-history" }]
    };
  }

  const pendingBalances = roundTransfers
    ? roundSettlementBalances(outstandingBalances)
    : outstandingBalances;
  const directRoutePreferences = directTransfers
    ? remainingDirectRoutePreferences(
        buildDirectRoutePreferences(participants, expenses),
        paidTransfers
      )
    : new Map();
  const pendingTransfers = buildOutstandingTransfers(
    pendingBalances,
    paidTransfers,
    previousTransfers,
    directTransfers,
    directRoutePreferences,
    roundTransfers ? WHOLE_CURRENCY_UNIT : 1
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
          amount: sumMoneyAmounts(
            routePaidTransfers.map((paidTransfer) => paidTransfer.amount)
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
  if (!hasSafeBalancedExposure(balances)) {
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
  if (entries.some(({ floorUnits }) => !Number.isSafeInteger(floorUnits))) {
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
    entries.map((entry) => {
      const roundedBalance =
        (entry.floorUnits + Number(incrementedParticipantIds.has(entry.participantId))) * unit;
      return [entry.participantId, roundedBalance === 0 ? 0 : roundedBalance];
    })
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

function buildDirectTransfersFromBalances(
  balances,
  routePreferences = new Map(),
  unit = 1
) {
  const remainingBalances = { ...(balances ?? {}) };
  const preferredTransfers = [];

  for (const [route, preferredAmount] of [...routePreferences.entries()].sort(
    (first, second) => second[1] - first[1]
  )) {
    const [fromParticipantId, toParticipantId] = route.split("\u0000");
    const amount = Math.floor(preferredAmount / unit) * unit;
    if (!isPositiveAgoraAmount(amount)) continue;

    preferredTransfers.push({
      id: transferIdFor({ fromParticipantId, toParticipantId, amount }),
      fromParticipantId,
      toParticipantId,
      amount,
      status: "pending"
    });
    remainingBalances[fromParticipantId] = sumMoneyAmounts([
      remainingBalances[fromParticipantId] ?? 0,
      amount
    ]);
    remainingBalances[toParticipantId] = sumMoneyAmounts([
      remainingBalances[toParticipantId] ?? 0,
      -amount
    ]);
  }

  const remainingEntries = Object.entries(remainingBalances)
    .filter(([, balance]) => balance !== 0)
    .map(([participantId, balance]) => ({ participantId, balance }));

  return netTransfersByRoute([
    ...preferredTransfers,
    ...buildGreedyTransfers(remainingEntries)
  ]);
}

function remainingDirectRoutePreferences(routePreferences, paidTransfers) {
  const remaining = new Map(routePreferences ?? []);
  for (const transfer of paidTransfers ?? []) {
    if (!settlementTransferRoute(transfer) || !isPositiveAgoraAmount(transfer.amount)) {
      continue;
    }
    const route = settlementTransferRoute(transfer);
    const preferredAmount = remaining.get(route) ?? 0;
    const nextAmount = Math.max(0, preferredAmount - transfer.amount);
    if (nextAmount > 0) remaining.set(route, nextAmount);
    else remaining.delete(route);
  }
  return remaining;
}

function buildDirectRoutePreferences(participants, expenses) {
  const knownParticipantIds = new Set(
    (participants ?? []).map((participant) => participant?.id).filter(Boolean)
  );
  const acceptedExpenses = [];

  for (const expense of expenses ?? []) {
    const normalizedExpense = normalizeExpenseForSettlement(
      expense,
      knownParticipantIds
    );
    if (normalizedExpense.issue) continue;

    const shares = splitEvenly(
      normalizedExpense.total,
      normalizedExpense.sharedByParticipantIds
    );
    acceptedExpenses.push({ normalizedExpense, shares });
  }

  return buildDirectRoutePreferencesFromLedger(acceptedExpenses);
}

function buildDirectRoutePreferencesFromLedger(acceptedExpenses) {
  const routeAmounts = new Map();

  for (const { normalizedExpense, shares } of acceptedExpenses ?? []) {
    const participantIds = new Set([
      ...normalizedExpense.sharedByParticipantIds,
      ...normalizedExpense.payers.map((payer) => payer.participantId)
    ]);
    const expenseBalances = Object.fromEntries(
      [...participantIds].map((participantId) => [participantId, 0])
    );
    for (const [participantId, share] of Object.entries(shares)) {
      expenseBalances[participantId] -= share;
    }
    for (const payer of normalizedExpense.payers) {
      expenseBalances[payer.participantId] += payer.amount;
    }

    for (const transfer of buildGreedyTransfers(
      Object.entries(expenseBalances)
        .filter(([, balance]) => balance !== 0)
        .map(([participantId, balance]) => ({ participantId, balance }))
    )) {
      if (!addNettedRoutePreference(routeAmounts, transfer)) return new Map();
    }
  }

  return routeAmounts;
}

function addNettedRoutePreference(routeAmounts, transfer) {
  const route = settlementTransferRoute(transfer);
  if (!route || !isPositiveAgoraAmount(transfer.amount)) return true;
  const reverseRoute = `${transfer.toParticipantId}\u0000${transfer.fromParticipantId}`;
  const reverseAmount = routeAmounts.get(reverseRoute) ?? 0;
  const canceledAmount = Math.min(reverseAmount, transfer.amount);

  if (canceledAmount > 0) {
    const remainingReverseAmount = reverseAmount - canceledAmount;
    if (remainingReverseAmount > 0) {
      routeAmounts.set(reverseRoute, remainingReverseAmount);
    } else {
      routeAmounts.delete(reverseRoute);
    }
  }

  const remainingAmount = transfer.amount - canceledAmount;
  if (remainingAmount > 0) {
    const combinedAmount = safeMoneySum(
      routeAmounts.get(route) ?? 0,
      remainingAmount
    );
    if (combinedAmount === null) return false;
    routeAmounts.set(route, combinedAmount);
  }
  return true;
}

function buildOutstandingTransfers(
  balances,
  paidTransfers,
  previousTransfers,
  directTransfers,
  directRoutePreferences = new Map(),
  directTransferUnit = 1
) {
  const buildTransfers = directTransfers
    ? (candidateBalances) =>
        buildDirectTransfersFromBalances(
          candidateBalances,
          directRoutePreferences,
          directTransferUnit
        )
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
  const unchangedPreviousPlan = preserveExactPreviousPendingPlan(
    balances,
    blockedRoutes,
    previousTransfers
  );
  if (unchangedPreviousPlan) return unchangedPreviousPlan;

  let preferred = baseline;
  if (
    blockedRoutes.size === 0 ||
    !baseline.some((transfer) =>
      blockedRoutes.has(settlementTransferRoute(transfer))
    )
  ) {
    preferred = baseline;
  } else {
    const rerouted = buildTransfersAvoidingRoutes(
      balances,
      blockedRoutes,
      buildTransfers
    );
    preferred = amountOnRoutes(rerouted, blockedRoutes) <
        amountOnRoutes(baseline, blockedRoutes)
      ? rerouted
      : baseline;
  }

  if (directTransfers) return preferred;

  const stableCandidate = buildTransfersFavoringPreviousRoutes(
    balances,
    blockedRoutes,
    previousTransfers,
    buildTransfers
  );
  const preferredOverlap = previousRouteOverlap(preferred, previousTransfers);
  const stableOverlap = previousRouteOverlap(stableCandidate, previousTransfers);
  const doesNotReintroduceBlockedRoutes =
    amountOnRoutes(stableCandidate, blockedRoutes) <=
    amountOnRoutes(preferred, blockedRoutes);

  return stableOverlap > preferredOverlap &&
      stableCandidate.length <= preferred.length + 1 &&
      doesNotReintroduceBlockedRoutes
    ? stableCandidate
    : preferred;
}

function preserveExactPreviousPendingPlan(
  balances,
  blockedRoutes,
  previousTransfers
) {
  const remainingBalances = { ...(balances ?? {}) };
  const pendingTransfers = [];
  const routes = new Set();

  for (const transfer of previousTransfers ?? []) {
    if (transfer?.status === "paid") continue;
    const route = settlementTransferRoute(transfer);
    if (
      !route ||
      routes.has(route) ||
      routes.has(`${transfer.toParticipantId}\u0000${transfer.fromParticipantId}`) ||
      blockedRoutes.has(route) ||
      !isPositiveAgoraAmount(transfer.amount) ||
      !Object.hasOwn(remainingBalances, transfer.fromParticipantId) ||
      !Object.hasOwn(remainingBalances, transfer.toParticipantId) ||
      transfer.fromParticipantId === transfer.toParticipantId
    ) {
      return null;
    }
    routes.add(route);

    const nextFromBalance = safeMoneySum(
      remainingBalances[transfer.fromParticipantId],
      transfer.amount
    );
    const nextToBalance = safeMoneySum(
      remainingBalances[transfer.toParticipantId],
      -transfer.amount
    );
    if (nextFromBalance === null || nextToBalance === null) return null;

    remainingBalances[transfer.fromParticipantId] = nextFromBalance;
    remainingBalances[transfer.toParticipantId] = nextToBalance;
    pendingTransfers.push({
      ...transfer,
      id: transfer.id || transferIdFor(transfer),
      status: "pending"
    });
  }

  return Object.values(remainingBalances).every((balance) => balance === 0)
    ? pendingTransfers
    : null;
}

function buildTransfersFavoringPreviousRoutes(
  balances,
  blockedRoutes,
  previousTransfers,
  buildTransfers
) {
  const remainingBalances = { ...(balances ?? {}) };
  const preservedTransfers = [];

  for (const previousTransfer of previousTransfers ?? []) {
    const route = settlementTransferRoute(previousTransfer);
    if (
      previousTransfer?.status === "paid" ||
      !route ||
      blockedRoutes.has(route) ||
      !isPositiveAgoraAmount(previousTransfer.amount)
    ) {
      continue;
    }

    const debtorAmount = Math.max(
      0,
      -(remainingBalances[previousTransfer.fromParticipantId] ?? 0)
    );
    const creditorAmount = Math.max(
      0,
      remainingBalances[previousTransfer.toParticipantId] ?? 0
    );
    const amount = Math.min(
      previousTransfer.amount,
      debtorAmount,
      creditorAmount
    );
    if (!isPositiveAgoraAmount(amount)) continue;

    preservedTransfers.push({
      id: transferIdFor({ ...previousTransfer, amount }),
      fromParticipantId: previousTransfer.fromParticipantId,
      toParticipantId: previousTransfer.toParticipantId,
      amount,
      status: "pending"
    });
    remainingBalances[previousTransfer.fromParticipantId] = sumMoneyAmounts([
      remainingBalances[previousTransfer.fromParticipantId],
      amount
    ]);
    remainingBalances[previousTransfer.toParticipantId] = sumMoneyAmounts([
      remainingBalances[previousTransfer.toParticipantId],
      -amount
    ]);
  }

  const remainingTransfers = blockedRoutes.size
    ? buildTransfersAvoidingRoutes(
        remainingBalances,
        blockedRoutes,
        buildTransfers
      )
    : buildTransfers(remainingBalances);
  return combineTransfersByRoute([
    ...preservedTransfers,
    ...remainingTransfers
  ]);
}

function previousRouteOverlap(transfers, previousTransfers) {
  const previousRoutes = new Set(
    (previousTransfers ?? [])
      .filter((transfer) => transfer?.status !== "paid")
      .map(settlementTransferRoute)
      .filter(Boolean)
  );
  return amountOnRoutes(transfers, previousRoutes);
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
    remainingBalances[transfer.fromParticipantId] = sumMoneyAmounts([
      remainingBalances[transfer.fromParticipantId],
      transfer.amount
    ]);
    remainingBalances[transfer.toParticipantId] = sumMoneyAmounts([
      remainingBalances[transfer.toParticipantId],
      -transfer.amount
    ]);
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
      existing.amount = sumMoneyAmounts([existing.amount, transfer.amount]);
      existing.id = transferIdFor(existing);
      continue;
    }
    combined.set(route, { ...transfer });
  }
  return [...combined.values()];
}

function netTransfersByRoute(transfers) {
  const routeAmounts = new Map();
  for (const transfer of transfers ?? []) {
    addNettedRoutePreference(routeAmounts, transfer);
  }
  return [...routeAmounts.entries()].map(([route, amount]) => {
    const [fromParticipantId, toParticipantId] = route.split("\u0000");
    return {
      id: transferIdFor({ fromParticipantId, toParticipantId, amount }),
      fromParticipantId,
      toParticipantId,
      amount,
      status: "pending"
    };
  });
}

function amountOnRoutes(transfers, routes) {
  return sumMoneyAmounts(
    (transfers ?? []).flatMap((transfer) =>
      routes.has(settlementTransferRoute(transfer))
        ? [transfer.amount]
        : []
    )
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

  return sumMoneyAmounts((transfers ?? [])
    .filter((transfer) => transfer?.status !== "paid")
    .map((transfer) => {
      const amount = Number.isSafeInteger(transfer?.amount) ? transfer.amount : 0;
      if (transfer?.toParticipantId === participantId) return amount;
      if (transfer?.fromParticipantId === participantId) return -amount;
      return 0;
    }));
}

export function buildParticipantSettlementBreakdown(participants, expenses, participantId) {
  const ledger = buildSettlementLedger(participants, expenses);
  const expenseShares = [];
  const issues = [...ledger.issues];
  let paidTotal = 0;
  let shareTotal = 0;

  for (const { expense, normalizedExpense, shares } of ledger.acceptedExpenses) {
    const participantPaid = sumMoneyAmounts(
      normalizedExpense.payers
        .filter((payer) => payer.participantId === participantId)
        .map((payer) => payer.amount)
    );
    const participantShare = shares[participantId] ?? 0;

    if (participantPaid === 0 && participantShare === 0) continue;

    paidTotal = sumMoneyAmounts([paidTotal, participantPaid]);
    shareTotal = sumMoneyAmounts([shareTotal, participantShare]);
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

function buildSettlementLedger(participants, expenses) {
  const validParticipants = (participants ?? []).filter(
    (participant) => participant?.id
  );
  const knownParticipantIds = new Set(
    validParticipants.map((participant) => participant.id)
  );
  let balances = Object.fromEntries(
    validParticipants.map((participant) => [participant.id, 0])
  );
  let grossTotal = 0;
  const acceptedExpenses = [];
  const issues = [];

  for (const expense of expenses ?? []) {
    const normalizedExpense = normalizeExpenseForSettlement(
      expense,
      knownParticipantIds
    );
    if (normalizedExpense.issue) {
      issues.push({
        expenseId: expense?.id ?? "",
        reason: normalizedExpense.issue
      });
      continue;
    }

    const nextGrossTotal = safeMoneySum(grossTotal, normalizedExpense.total);
    if (nextGrossTotal === null) {
      issues.push({
        expenseId: expense?.id ?? "",
        reason: "unsafe-event-total"
      });
      continue;
    }

    const shares = splitEvenly(
      normalizedExpense.total,
      normalizedExpense.sharedByParticipantIds
    );
    const nextBalances = { ...balances };
    let unsafeBalance = false;

    for (const [participantId, share] of Object.entries(shares)) {
      const nextBalance = safeMoneySum(nextBalances[participantId] ?? 0, -share);
      if (nextBalance === null) {
        unsafeBalance = true;
        break;
      }
      nextBalances[participantId] = nextBalance;
    }

    if (!unsafeBalance) {
      for (const payer of normalizedExpense.payers) {
        const nextBalance = safeMoneySum(
          nextBalances[payer.participantId] ?? 0,
          payer.amount
        );
        if (nextBalance === null) {
          unsafeBalance = true;
          break;
        }
        nextBalances[payer.participantId] = nextBalance;
      }
    }

    if (unsafeBalance || !hasSafeBalancedExposure(nextBalances)) {
      issues.push({
        expenseId: expense?.id ?? "",
        reason: "unsafe-balance-total"
      });
      continue;
    }

    balances = nextBalances;
    grossTotal = nextGrossTotal;
    acceptedExpenses.push({ expense, normalizedExpense, shares });
  }

  return { balances, acceptedExpenses, issues };
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

  let paidTotal;
  try {
    paidTotal = sumMoneyAmounts(payers.map((payer) => payer.amount));
  } catch {
    return { issue: "unsafe-payer-total" };
  }
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

function safeMoneySum(...amounts) {
  try {
    return sumMoneyAmounts(amounts);
  } catch {
    return null;
  }
}

function hasSafeBalancedExposure(balances) {
  let credits = 0;
  let debts = 0;
  for (const balance of Object.values(balances ?? {})) {
    if (!Number.isSafeInteger(balance)) return false;
    if (balance > 0) {
      credits = safeMoneySum(credits, balance);
      if (credits === null) return false;
    } else if (balance < 0) {
      debts = safeMoneySum(debts, -balance);
      if (debts === null) return false;
    }
  }
  return credits === debts;
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
