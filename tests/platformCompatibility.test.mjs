import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

test("the iOS 15.0 compatibility layer installs required platform fallbacks", async () => {
  const source = await readFile("src/platformCompatibility.mjs", "utf8");
  const context = vm.createContext({});
  vm.runInContext(
    "delete Object.hasOwn; delete Array.prototype.at; delete globalThis.structuredClone;",
    context
  );
  vm.runInContext(source, context);

  assert.equal(
    vm.runInContext("Object.hasOwn({ value: 1 }, 'value')", context),
    true
  );
  assert.equal(vm.runInContext("[1, 2, 3].at(-1)", context), 3);
  assert.equal(vm.runInContext("[1, 2, 3].at(-4)", context), undefined);
  assert.equal(
    vm.runInContext("structuredClone({ nested: { value: 2 } }).nested.value", context),
    2
  );
});

test("PWA bootstrap installs compatibility before starting the app lifecycle", async () => {
  const source = await readFile("src/pwaBootstrap.mjs", "utf8");
  assert.match(source, /^import "\.\/platformCompatibility\.mjs";/);
});

test("application logic does not require the Safari 15.4 :has selector", async () => {
  const source = await readFile("src/app.mjs", "utf8");
  assert.doesNotMatch(source, /querySelector(?:All)?\([^\n]*:has\(/);
});
