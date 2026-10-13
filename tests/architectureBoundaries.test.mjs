import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep, basename } from "node:path";
import { inspectArchitecture, allowedDependency } from "../scripts/lib/architecture-boundaries.mjs";

test("architecture rejects view imports of persistence, server code and business logic", () => {
  for (const target of ["src/data/localStore.mjs", "src/server/stateStore.mjs", "src/domain/settlement.mjs", "node:fs"]) assert.equal(allowedDependency("src/ui/header.mjs", target), false);
  assert.equal(allowedDependency("src/domain/money.mjs", "src/ui/header.mjs"), false);
  assert.equal(allowedDependency("src/data/cloudStore.mjs", "src/app.mjs"), false);
  assert.equal(allowedDependency("src/app.mjs", "src/server/runtimeConfig.mjs"), false);
  assert.equal(allowedDependency("src/server/runtimeConfig.mjs", "src/domain/publicOrigin.mjs"), true);
});

test("the parser detects real dynamic imports while ignoring fake imports in comments and strings", async () => {
  const root = await mkdtemp(join(tmpdir(), "sogrim-architecture-"));
  try {
    await mkdir(join(root, "src/ui"), { recursive: true });
    await mkdir(join(root, "src/server"), { recursive: true });
    await writeFile(join(root, "src/ui/header.mjs"), '// import x from "../server/secret.mjs"\nexport const text = \'import("../server/secret.mjs")\';');
    await writeFile(join(root, "src/server/secret.mjs"), "export const value=1;");
    assert.deepEqual((await inspectArchitecture(root, { includeServerEntry: false })).violations, []);
    await writeFile(join(root, "src/ui/header.mjs"), 'export async function read(){return import("../server/secret.mjs")}');
    const found = (await inspectArchitecture(root, { includeServerEntry: false })).violations;
    assert.equal(found.length, 1);
    assert.equal(found[0].target, "src/server/secret.mjs");
  } finally {
    if (!resolve(root).startsWith(resolve(tmpdir())+sep) || !basename(root).startsWith("sogrim-architecture-")) throw new Error("Unsafe test cleanup target");
    await rm(root, { recursive: true, force: true });
  }
});

test("the real source respects the presentation, domain, data and backend boundaries", async () => {
  const result = await inspectArchitecture(process.cwd());
  assert.ok(result.modules > 100);
  assert.deepEqual(result.violations, []);
});
