import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAccountEntryReloadLedger } from '../e2e/helpers/accountEntryReloadEvidence.mjs';

const ORIGIN = 'https://account-entry-e2e.supabase.co';
const PATH = '/rest/v1/app_snapshots';

function ledger({ boundaryStart, navigationStart, navigationCommit, boundaryEnd }) {
  const reload = {
    oldDocumentId: 'old-document', finalDocumentId: 'new-document', finalReady: true,
    boundaryStart, navigationStart, navigationCommit, boundaryEnd
  };
  const attempts = new Map([['acknowledged-write', {
    method: 'PATCH', finished: navigationStart - 3,
    response: { status: 200 }
  }]]);
  const accountRequests = new Map([['acknowledged-account', {
    finished: navigationStart - 4, status: 200
  }]]);
  const record = {
    external: [], unmatchedRequests: [], runtimeErrors: [], pageErrors: [],
    reloadDiagnostics: []
  };
  const context = {
    origin: ORIGIN, browserName: 'webkit', attempts, accountRequests,
    reloads: [reload], runtimeErrors: record.runtimeErrors
  };
  return { record, context };
}

function addUnissuedSnapshot({ record, context }, { id, sequence, errorSequence, method, query }) {
  const url = `${ORIGIN}${PATH}?${query}&__qa_account_attempt=${id}`;
  context.attempts.set(`prior-${id}`, {
    id: `prior-${id}`, url: `${ORIGIN}${PATH}?${query}&__qa_account_attempt=prior-${id}`,
    documentId: 'old-document', method, sequence: context.reloads[0].boundaryStart + 2,
    response: { status: 200, allowOrigin: '*' },
    finished: context.reloads[0].navigationStart - 2
  });
  context.attempts.set(id, {
    id, url, documentId: 'old-document', method, sequence
  });
  const message = `Fetch API cannot load ${url} due to access control checks.`;
  const error = {
    name: 'Fetch API cannot load https', message: message.slice('Fetch API cannot load https:/'.length),
    stack: `${message}\n    at unknown (web-inspector://bootstrap.js:1269:32)`,
    sequence: errorSequence
  };
  record.pageErrors.push(error);
  return error;
}

test('iPad CI ledger: unissued shared-event read immediately before navigation is identified', () => {
  const fixture = ledger({ boundaryStart: 249, navigationStart: 291, navigationCommit: 293, boundaryEnd: 540 });
  const error = addUnissuedSnapshot(fixture, {
    id: 'ipad-read', sequence: 290, errorSequence: 292, method: 'GET',
    query: 'snapshot_kind=eq.shared_event&select=id%2Cstate%2Cupdated_at&order=id.asc&limit=500'
  });
  const diagnostics = assertAccountEntryReloadLedger(fixture.record, fixture.context);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].id, 'ipad-read');
  assert.equal(diagnostics[0].raw, error);
  assert.deepEqual(fixture.record.pageErrors, [error]);
});

test('iPhone CI ledger: both distinct unissued snapshot operations are retained', () => {
  const fixture = ledger({ boundaryStart: 252, navigationStart: 280, navigationCommit: 285, boundaryEnd: 532 });
  const patch = addUnissuedSnapshot(fixture, {
    id: 'iphone-patch', sequence: 281, errorSequence: 283, method: 'PATCH',
    query: 'id=eq.space-account-entry&updated_at=eq.2026-10-01T08%3A00%3A01.000Z&select=updated_at'
  });
  const read = addUnissuedSnapshot(fixture, {
    id: 'iphone-read', sequence: 282, errorSequence: 284, method: 'GET',
    query: 'id=eq.space-account-entry&select=updated_at'
  });
  const diagnostics = assertAccountEntryReloadLedger(fixture.record, fixture.context);
  assert.deepEqual(diagnostics.map(item => item.id), ['iphone-patch', 'iphone-read']);
  assert.deepEqual(diagnostics.map(item => item.raw), [patch, read]);
});

function signedOutLedger() {
  const fixture = ledger({ boundaryStart: 240, navigationStart: 246, navigationCommit: 250, boundaryEnd: 510 });
  fixture.context.reloads[0].kind = 'signout';
  fixture.context.attempts.clear();
  fixture.context.accountRequests.clear();
  fixture.context.accountRequests.set('logout', {
    path: '/auth/v1/logout', method: 'POST', status: 200,
    allowOrigin: '*', finished: 244
  });
  const error = addUnissuedSnapshot(fixture, {
    id: 'signout-read', sequence: 247, errorSequence: 248, method: 'GET',
    query: 'id=eq.space-synthetic&select=state%2Cupdated_at'
  });
  fixture.context.attempts.delete('prior-signout-read');
  return { fixture, error };
}

test('iPhone sign-out CI trace: old-document workspace read cancelled by acknowledged logout', () => {
  const { fixture, error } = signedOutLedger();
  const diagnostics = assertAccountEntryReloadLedger(fixture.record, fixture.context);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].raw, error);
  assert.equal(diagnostics[0].reason, 'webkit-unissued-signout-fetch');
  assert.deepEqual(fixture.record.pageErrors, [error]);
});

test('sign-out diagnostic still rejects missing logout, pending writes and real requests', () => {
  for (const mutation of [
    fixture => fixture.context.accountRequests.clear(),
    fixture => { fixture.context.accountRequests.get('logout').status = 503; },
    fixture => { fixture.context.attempts.get('signout-read').request = { sequence: 247 }; },
    fixture => { fixture.context.attempts.set('pending-write', {
      documentId: 'old-document', method: 'PATCH', sequence: 245
    }); },
    fixture => { fixture.context.reloads[0].finalReady = false; }
  ]) {
    const { fixture } = signedOutLedger();
    mutation(fixture);
    assert.throws(() => assertAccountEntryReloadLedger(fixture.record, fixture.context));
  }
});

test('real failures and missing causal proof stay failures', () => {
  const create = () => ledger({ boundaryStart: 249, navigationStart: 291, navigationCommit: 293, boundaryEnd: 540 });
  for (const mutation of [
    fixture => { fixture.context.attempts.get('probe').request = { sequence: 291 }; },
    fixture => { fixture.record.pageErrors[0].sequence = 300; },
    fixture => { fixture.record.pageErrors[0].stack = 'Error: JavaScript failed'; },
    fixture => { fixture.context.accountRequests.clear(); },
    fixture => { fixture.context.attempts.delete('prior-probe'); },
    fixture => { fixture.context.browserName = 'chromium'; },
    fixture => { fixture.record.runtimeErrors.push({ message: 'actual JavaScript error' }); }
  ]) {
    const fixture = create();
    addUnissuedSnapshot(fixture, {
      id: 'probe', sequence: 290, errorSequence: 292, method: 'GET',
      query: 'id=eq.space-account-entry&select=updated_at'
    });
    mutation(fixture);
    assert.throws(() => assertAccountEntryReloadLedger(fixture.record, fixture.context));
    assert.equal(fixture.record.pageErrors.length, 1);
  }
});
