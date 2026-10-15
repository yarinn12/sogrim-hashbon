import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { navigateWithPersonalPinsInbox } from "../e2e/helpers/personalPinsCloudNavigation.mjs";
const options = { origin: "https://personal-pins-qa.supabase.co", userId: "personal-pins-cloud-owner" };
const url = `${options.origin}/rest/v1/notification_inbox?recipient_user_id=eq.${options.userId}`;
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; }
function fixture() {
  const response = deferred(), body = deferred(); let match;
  const page = { waitForResponse(predicate) { match=predicate; return response.promise; } };
  const row = (href=url, method="GET") => ({ url:()=>href, request:()=>({method:()=>method}),
    ok:()=>true, status:()=>200, finished:()=>body.promise });
  return { page, response, body, row, matches:(...args)=>match(row(...args)) };
}
test("document navigation waits for the later account inbox body, not only rendered rows", async () => {
  const f=fixture(); let returned=false;
  const pending=navigateWithPersonalPinsInbox(f.page, async()=>"navigation-result", options).then(value=>{ returned=true; return value; });
  await Promise.resolve(); const beforeResponse=returned;
  f.response.resolve(f.row()); await Promise.resolve(); await Promise.resolve(); const beforeBody=returned;
  f.body.resolve(null); assert.equal(await pending,"navigation-result");
  assert.equal(beforeResponse,false); assert.equal(beforeBody,false);
});
test("only the current synthetic account GET inbox can satisfy document readiness", async () => {
  const f=fixture(); const pending=navigateWithPersonalPinsInbox(f.page, async()=>{}, options);
  assert.equal(f.matches(),true);
  for (const [href,method] of [[url.replace(options.origin,"https://other.example"),"GET"],
    [url.replace(options.userId,"other-user"),"GET"],[url.replace("notification_inbox","app_snapshots"),"GET"],[url,"POST"]])
    assert.equal(f.matches(href,method),false);
  f.response.resolve(f.row()); f.body.resolve(null); await pending;
});
test("inbox HTTP failures cannot satisfy fixture readiness", async () => {
  const f=fixture(); const pending=navigateWithPersonalPinsInbox(f.page,async()=>{},options);
  f.response.resolve({...f.row(),ok:()=>false,status:()=>503});
  await assert.rejects(pending,/503/);
});
test("a cancelled inbox body remains an error instead of being ignored on navigation", async () => {
  const f=fixture(); const pending=navigateWithPersonalPinsInbox(f.page,async()=>{},options);
  f.response.resolve(f.row()); f.body.resolve(new Error("Load request cancelled"));
  await assert.rejects(pending,/Load request cancelled/);
});
test("navigation failures remain failures", async () => {
  const f=fixture(); const pending=navigateWithPersonalPinsInbox(f.page,async()=>{throw new Error("navigation failed");},options);
  f.response.resolve(f.row()); f.body.resolve(null); await assert.rejects(pending,/navigation failed/);
});
test("both initial account navigation and forced reload use the same inbox readiness boundary",async()=>{
  const source=await readFile(new URL('../e2e/helpers/personalPinsCloud.mjs',import.meta.url),'utf8');
  assert.match(source,/navigateWithPersonalPinsInbox\(clientPage, \(\) => clientPage\.goto\("\/"\), \{ origin, userId \}\)/);
  assert.match(source,/errorMonitor\.withReload\(\(\) => navigateWithPersonalPinsInbox\(page, \(\) => page\.reload\(\), \{ origin, userId \}\)\)/);
});
