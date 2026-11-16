import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("manual and automatic public deployment require complete exact-source CI before accessing deployment credentials",async()=>{
 const workflow=await readFile(process.env.RELEASE_WORKFLOW_TEST_PATH || ".github/workflows/deploy-vercel.yml","utf8");
 assert.match(workflow,/node scripts\/verify-release-ci\.mjs --require-main-head/,
  "Every deployment route must require all CI on the exact current main source");
 assert.match(workflow,/needs: verify/);
 assert.match(workflow,/needs\.verify\.outputs\.ready == 'true'/);
 assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
 assert.match(workflow,/github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
 assert.ok(workflow.indexOf("verify-release-ci.mjs")<workflow.indexOf("secrets.VERCEL_TOKEN"));
 assert.doesNotMatch(workflow,/--token[ =]/);
 assert.match(workflow,/--prebuilt --prod --skip-domain/);
 assert.ok(workflow.indexOf("Verify the staged deployment")<workflow.indexOf("Promote the same staged build"));
 assert.match(workflow,/ref: \$\{\{ needs\.verify\.outputs\.source \}\}/);
 assert.match(workflow,/RELEASE_PIPELINE_ENABLED == 'true'/);
 const recheck=workflow.indexOf("Recheck source and CI immediately before promotion");
 assert.ok(recheck>workflow.indexOf("Verify the staged deployment"));
 assert.ok(recheck<workflow.indexOf("Promote the same staged build"));
});

test("Git integration cannot publish main independently of the verified production workflow",async()=>{
 const config=JSON.parse(await readFile("vercel.json","utf8"));
 assert.equal(config.git.deploymentEnabled.main,false);
 assert.ok(config.builds.some(item=>item.src==="src/ui/**"));
});

test("TestFlight also requires exact-source CI before the signing credentials",async()=>{
 const workflow=await readFile(".github/workflows/ios-testflight.yml","utf8");
 assert.ok(workflow.indexOf("node scripts/verify-release-ci.mjs")>=0);
 assert.ok(workflow.indexOf("node scripts/verify-release-ci.mjs")<workflow.indexOf("secrets.APPSTORE_API_PRIVATE_KEY"));
 assert.match(workflow,/actions: read/);
 assert.match(workflow,/verify-release-ci\.mjs --require-main-head/);
});
