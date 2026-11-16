import test from "node:test";
import assert from "node:assert/strict";
import { productionRequestOptions } from "../scripts/lib/production-request-options.mjs";
const trustedDeploymentUrl="https://synthetic-verified.vercel.app";
test("staged verification scopes the bypass secret to the exact deployment and refuses redirect leakage",()=>{
 const result=productionRequestOptions(trustedDeploymentUrl+"/api/health",{trustedDeploymentUrl,bypassSecret:"synthetic-only"});
 assert.equal(result.headers["x-vercel-protection-bypass"],"synthetic-only");assert.equal(result.redirect,"manual");
 for(const url of ["https://other.vercel.app/","https://fixture.supabase.co/auth/v1/settings","http://synthetic-verified.vercel.app/"]){
  const r=productionRequestOptions(url,{trustedDeploymentUrl,bypassSecret:"synthetic-only",headers:{apikey:"synthetic-public-key","X-Vercel-Protection-Bypass":"incorrect"}});
  assert.equal(r.headers["x-vercel-protection-bypass"],undefined);assert.equal(r.headers["X-Vercel-Protection-Bypass"],undefined);assert.equal(r.headers.apikey,"synthetic-public-key");
 }
});
test("ordinary public checks do not inherit a deployment secret without an explicit trusted deployment",()=>{
 assert.deepEqual(productionRequestOptions("https://sogrim-hesbon-app.vercel.app/",{bypassSecret:"synthetic-only"}),{headers:{},redirect:"follow"});
});
