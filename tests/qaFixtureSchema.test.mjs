import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { assertValidSharedStatePayload } from '../src/server/stateValidation.mjs';

async function emittedState(file, title) {
  const hooks = [], cases = [], sentinel = new Error('Captured actual fixture payload'); let captured;
  const register = (name, callback) => cases.push({ name, callback });
  Object.assign(register, { beforeEach(callback) { hooks.push(callback); }, afterEach() {}, use() {} });
  const capture = async value => { captured = JSON.parse(JSON.stringify(value)); throw sentinel; };
  const context = createContext({ test: register, expect() { throw new Error('UI reached before schema check'); }, structuredClone,
    resetLocalQaStateFresh: async () => {}, writeLocalQaStateFresh: (_origin, value) => capture(value) });
  const text = readFileSync(new URL('../e2e/'+file, import.meta.url), 'utf8');
  runInContext(text.replace(/^import .*;\r?\n/gm, ''), context, { filename: file });
  const selected = title ? cases.find(item => item.name === title) : cases[0]; assert.ok(selected);
  const args = { baseURL: 'http://127.0.0.1:1', page: { on() {} }, request: { post: async () => {}, put: (_path, options) => capture(options.data) } };
  const info = { title: selected.name, project: { metadata: {} } }; let outcome;
  try { for (const hook of hooks) await hook(args, info); await selected.callback(args, info); } catch (error) { outcome = error; }
  assert.equal(outcome, sentinel, 'the actual setup must emit its complete fixture before UI actions'); assert.ok(captured);
  return captured;
}

for (const [file, title] of [
  ['account-upgrades-ui.spec.mjs', null],
  ['account-upgrades-ui.spec.mjs', 'shared notes and bottom participant action remain visible'],
  ['home-event-options.spec.mjs', null],
  ['new-event-friend-visibility.spec.mjs', null]
]) test(`actual ${file} ${title || 'initial setup'} is accepted by the unchanged server schema`, async () => {
  const value = await emittedState(file, title);
  assert.doesNotThrow(() => assertValidSharedStatePayload(value));
  assert.ok(value.friendContacts.length > 0);
  assert.equal(new Set(value.friendContacts.map(contact => contact.id)).size, value.friendContacts.length);
});
