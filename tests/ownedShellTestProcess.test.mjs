import test from "node:test";
import assert from "node:assert/strict";
import { constants } from "node:os";
import { prioritizeOwnedShellTestChild } from "./helpers/ownedShellTestProcess.mjs";

test("Windows QA favors only the exact newly owned shell child", () => {
  const calls=[];assert.equal(prioritizeOwnedShellTestChild({pid:250}, {platform:"win32",prioritize:(...args)=>calls.push(args)}),true);
  assert.deepEqual(calls,[[250,constants.priority.PRIORITY_ABOVE_NORMAL]]);
});
test("other QA platforms retain ordinary scheduling", () => {
  let called=false;assert.equal(prioritizeOwnedShellTestChild({pid:250}, {platform:"linux",prioritize:()=>called=true}),false);assert.equal(called,false);
});
test("missing or invalid child identity cannot change host scheduling", () => {
  const calls=[];for(const pid of [undefined,null,0,1,-1,2.5,"250"])assert.equal(prioritizeOwnedShellTestChild({pid}, {platform:"win32",prioritize:(...a)=>calls.push(a)}),false);assert.deepEqual(calls,[]);
});
test("a priority setup error propagates instead of being reported as passing QA", () => {
  const error=new Error("synthetic scheduling rejection");assert.throws(()=>prioritizeOwnedShellTestChild({pid:250}, {platform:"win32",prioritize:()=>{throw error}}),e=>e===error);
});
