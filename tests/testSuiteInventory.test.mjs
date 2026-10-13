import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { requestedSuite, selectTestFiles } from "../scripts/lib/test-suites.mjs";
test("unit and integration partitions run every discovered test exactly once", () => {
  const root=process.cwd();
  const all=readdirSync("tests",{recursive:true}).filter(file=>file.endsWith(".test.mjs")).map(file=>resolve("tests",file)).sort();
  const unit=selectTestFiles(all,root,"unit"),integration=selectTestFiles(all,root,"integration");
  assert.ok(unit.length>100);assert.ok(integration.length>=27);
  assert.deepEqual([...unit,...integration].sort(),all);
  assert.equal(new Set([...unit,...integration]).size,all.length);
  assert.deepEqual(selectTestFiles(all,root),all);
  assert.equal(requestedSuite(["--coverage","--suite","integration"]),"integration");
  assert.throws(()=>requestedSuite(["--suite"]),/Expected/);
  assert.throws(()=>selectTestFiles(all.slice(0,2),root,"unit"),/missing files/);
});
