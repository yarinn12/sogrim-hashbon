import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp,writeFile,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { createReleaseCheckpoint } from "../scripts/lib/release-checkpoint.mjs";
test("checkpoint binds the real Git tree, rejects uncommitted updates and cannot move an existing tag",async()=>{
  const cwd=await mkdtemp(join(tmpdir(),"sogrim-checkpoint-"));
  const git=(...args)=>execFileSync("git",args,{cwd,encoding:"utf8",windowsHide:true}).trim();
  try {
    git("init","--quiet");git("config","user.name","Synthetic checkpoint test");git("config","user.email","checkpoint@example.test");
    await writeFile(join(cwd,"app.txt"),"first update");git("add","app.txt");git("commit","--quiet","-m","first");
    const first=git("rev-parse","HEAD"),tree=git("rev-parse","HEAD^{tree}");
    const receipt=createReleaseCheckpoint({cwd,name:"checkpoint/test-first"});
    assert.equal(receipt.source,first);assert.equal(receipt.tree,tree);assert.equal(receipt.databaseBackup,false);
    assert.equal(git("rev-parse","checkpoint/test-first^{commit}"),first);
    await writeFile(join(cwd,"app.txt"),"second update");
    assert.throws(()=>createReleaseCheckpoint({cwd,name:"checkpoint/dirty"}),/dirty/);
    git("add","app.txt");git("commit","--quiet","-m","second");
    assert.throws(()=>createReleaseCheckpoint({cwd,name:"checkpoint/test-first"}),/already exists/);
    assert.equal(git("rev-parse","checkpoint/test-first^{commit}"),first);
    git("switch","--quiet","--detach","checkpoint/test-first");
    assert.equal(git("show","HEAD:app.txt"),"first update");
    assert.throws(()=>createReleaseCheckpoint({cwd,name:"checkpoint/../invalid"}),/Use checkpoint\/<name>/);
  } finally {
    if (!resolve(cwd).startsWith(resolve(tmpdir())+sep) || !basename(cwd).startsWith("sogrim-checkpoint-")) throw new Error("Unsafe test cleanup target");
    await rm(cwd,{recursive:true,force:true});
  }
});
