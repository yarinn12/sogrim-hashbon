import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { assertValidSharedStatePayload } from '../src/server/stateValidation.mjs';
import { calculateSettlement } from '../src/domain/settlement.mjs';

async function emittedState(file, title, runBeforeEach = true) {
  const hooks = [], cases = [], sentinel = new Error('Captured actual fixture payload'); let captured;
  const register = (name, callback) => cases.push({ name, callback });
  Object.assign(register, { beforeEach(callback) { hooks.push(callback); }, afterEach() {}, use() {} });
  const capture = async value => { captured = JSON.parse(JSON.stringify(value)); throw sentinel; };
  const context = createContext({ test: register, expect() { throw new Error('UI reached before schema check'); }, structuredClone, calculateSettlement,
    resetLocalQaStateFresh: async () => {}, writeLocalQaStateFresh: (_origin, value) => capture(value) });
  const text = readFileSync(new URL('../e2e/'+file, import.meta.url), 'utf8');
  runInContext(text.replace(/^import .*;\r?\n/gm, ''), context, { filename: file });
  const selected = title ? cases.find(item => item.name === title) : cases[0]; assert.ok(selected);
  const args = { baseURL: 'http://127.0.0.1:1', page: { on() {} }, request: { post: async () => {}, put: (_path, options) => capture(options.data) } };
  const info = { title: selected.name, project: { metadata: {} } }; let outcome;
  try { if (runBeforeEach) for (const hook of hooks) await hook(args, info); await selected.callback(args, info); } catch (error) { outcome = error; }
  assert.equal(outcome, sentinel, 'the actual setup must emit its complete fixture before UI actions'); assert.ok(captured);
  return captured;
}

for (const [file, title, runBeforeEach] of [
  ['account-upgrades-ui.spec.mjs', null],
  ['account-upgrades-ui.spec.mjs', 'shared notes and bottom participant action remain visible'],
  ['home-event-options.spec.mjs', null],
  ['new-event-friend-visibility.spec.mjs', null],
  // This case augments the seed inside its body. Inspect that actual write,
  // rather than stopping on the empty friend list emitted by beforeEach.
  ['mobile-layout.spec.mjs', 'adding a saved friend requires an explicit confirmation and keeps the picker on-brand', false]
]) test(`actual ${file} ${title || 'initial setup'} is accepted by the unchanged server schema`, async () => {
  const value = await emittedState(file, title, runBeforeEach);
  assert.doesNotThrow(() => assertValidSharedStatePayload(value));
  assert.ok(value.friendContacts.length > 0);
  assert.equal(new Set(value.friendContacts.map(contact => contact.id)).size, value.friendContacts.length);
});

test('inline friend contacts across every browser fixture include their required record identity', () => {
  const missing = []; let assignments = 0;
  for (const directory of ['e2e', 'e2e-parity']) {
    const root = new URL('../' + directory + '/', import.meta.url);
    for (const name of readdirSync(root, { recursive: true }).filter(name => name.endsWith('.spec.mjs'))) {
      const file = directory + '/' + name.replaceAll('\\', '/');
      const source = ts.createSourceFile(file, readFileSync(new URL(name.replaceAll('\\', '/'), root), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      const propertyName = node => node.getText(source).replaceAll(/['"]/g, '');
      function inspectContact(node) {
        if (ts.isObjectLiteralExpression(node) && !node.properties.some(ts.isSpreadAssignment)) {
          const names = node.properties.filter(ts.isPropertyAssignment).map(property => propertyName(property.name));
          if (names.includes('participantId') && !names.includes('id')) {
            missing.push(file + ':' + (source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1));
          }
        }
        ts.forEachChild(node, inspectContact);
      }
      function visit(node) {
        const property = ts.isPropertyAssignment(node) && propertyName(node.name) === 'friendContacts';
        const assignment = ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && node.left.getText(source).endsWith('.friendContacts');
        if (property || assignment) { assignments++; inspectContact(property ? node.initializer : node.right); }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  assert.ok(assignments > 0, 'the browser fixture inventory must be inspected');
  assert.deepEqual(missing, [], 'friend contact records require their own id as well as a participantId');
});
