import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

for (const [file, pattern] of [
  ["publicAccountAuthLayer.test.mjs", "the immediate resume predicate never creates a cloud workspace"],
  ["launchSecurityHardening.test.mjs", "payment status reversal is narrow, attributable, and compatible with centralized events"]
]) {
  for (const [label, ending] of [["LF", "\n"], ["CRLF", "\r\n"]]) {
    test(`${file} preserves its assertions with ${label} source files`, async t => {
      const directory = await mkdtemp(join(tmpdir(), "settle-line-ending-"));
      t.after(() => rm(directory, {recursive: true, force: true}));
      const testPath = resolve("tests", file);
      const testSource = await readFile(testPath, "utf8");
      const sources = new Set([...testSource.matchAll(/readFile\(\s*"([^"]+)"/g)].map(match => match[1]));
      for (const source of sources) {
        const target = join(directory, source);
        await mkdir(dirname(target), {recursive: true});
        await writeFile(target, (await readFile(source, "utf8")).replace(/\r?\n/g, ending));
      }
      const env = {...process.env};
      delete env.NODE_TEST_CONTEXT;
      const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", `--test-name-pattern=${pattern}`, testPath], {
        cwd: directory, env, encoding: "utf8", timeout: 15000, maxBuffer: 4 * 1024 * 1024
      });
      assert.equal(result.status, 0, `${label} must not change the result of the existing guard: ${result.stdout.slice(-2000)} ${result.stderr.slice(-500)}`);
      assert.match(result.stdout, /^# tests 1$/m, "The selected original regression must actually execute");
    });
  }
}
