import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { accountAuthErrorMessage } from "../src/data/accountAuth.mjs";

const source = (await readFile("src/publicAccountAuthLayer.mjs", "utf8")).replaceAll("\r\n", "\n");
function declaration(name) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf("\n}\n", start) + 2;
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
}
function report(error) {
  const gates = [];
  const failures = [];
  const context = vm.createContext({
    accountSession: null,
    accountProfileNeedsCompletion: () => false,
    renderAccountGate: gate => gates.push(gate),
    emitOperationFailure: (...args) => failures.push(args),
    accountAuthErrorMessage,
    error
  });
  vm.runInContext(["isCancelledNativeGoogleLogin", "handleGoogleSignInError"].map(declaration).join("\n"), context);
  vm.runInContext("handleGoogleSignInError(error)", context);
  return { gates, failures };
}

for (const message of ["JWT expired", "Token is malformed", "bad_jwt", "Invalid audience"] ) {
  test(`Google token rejection shows retry feedback instead of silently returning to login: ${message}`, () => {
    const { gates, failures } = report(Object.assign(new Error(message), { status: 400 }));
    assert.equal(gates.length, 1, "a rejected credential must leave visible feedback");
    assert.equal(gates[0].mode, "login");
    assert.match(gates[0].error, /Google/);
    assert.equal(failures.length, 1);
  });
}

for (const message of ["User canceled", "The user cancelled the sign-in flow"]) {
  test(`Google chooser dismissal leaves the login form usable without a failure: ${message}`, () => {
    const { gates, failures } = report(new Error(message));
    assert.equal(gates.length, 0);
    assert.equal(failures.length, 0);
  });
}
