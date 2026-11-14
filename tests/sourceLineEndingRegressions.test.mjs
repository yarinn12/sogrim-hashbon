import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, realpath, rm } from "node:fs/promises";
import { join, dirname, resolve, basename, sep } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

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
test("Auth76 recorded stdout and help retain exact bytes across Git checkout modes", async t => {
  const temporary = await mkdtemp(join(tmpdir(), "settle-auth76-raw-"));
  t.after(async () => {
    const target = await realpath(temporary);
    const tempRoot = await realpath(tmpdir());
    assert.ok(target.startsWith(tempRoot + sep) && basename(target).startsWith("settle-auth76-raw-"),
      "clean only this test-owned temporary repository");
    await rm(target, {recursive: true, force: true});
  });
  const hash = bytes => createHash("sha256").update(bytes).digest("hex");
  const cases = [
    {
      path: "tests/fixtures/auth76/log-show-json-footer-sample.txt",
      provenance: "tests/fixtures/auth76/log-show-json-footer-provenance.json",
      expectedField: "derivedFixtureSha256",
      windowsFailureSha: "f5fa902d3e91de691eb0607199f71b323216f62b2e28f9223ea3112cd947bee1"
    },
    {
      path: "tests/fixtures/auth76/log-help-show-macos26.6.1.stderr.txt",
      provenance: "tests/fixtures/auth76/log-help-show-provenance.json",
      expectedField: "publishedSha256",
      windowsFailureSha: "ee7c4b1455a313033fc59a70fd6548ee5a9c10ca0d2700e2c0deea9b9e7ead08"
    }
  ];
  for (const item of cases) {
    item.bytes = await readFile(resolve(item.path));
    item.provenanceBytes = await readFile(resolve(item.provenance));
    item.provenanceData = JSON.parse(item.provenanceBytes.toString("utf8"));
    item.expectedSha = item.provenanceData[item.expectedField];
    assert.equal(hash(item.bytes), item.expectedSha, "the source fixture must match its provenance");
    assert.equal(item.bytes.includes(Buffer.from("\r\n")), false, "stage the original LF bytes");
  }
  const rootAttributes = await readFile(resolve(".gitattributes"), "utf8");
  const nestedAttributes = await readFile(resolve("tests/fixtures/.gitattributes"));
  const oldRootAttributes = rootAttributes.replace(
    /^tests\/fixtures\/auth76\/log-(?:show-json-footer-sample|help-show-macos26\.6\.1\.stderr)\.txt -text\r?\n/gm, "");
  const env = {
    PATH: process.env.PATH || "",
    SystemRoot: process.env.SystemRoot || "",
    WINDIR: process.env.WINDIR || "",
    HOME: temporary,
    USERPROFILE: temporary,
    XDG_CONFIG_HOME: join(temporary, "config"),
    TMP: temporary,
    TEMP: temporary,
    TMPDIR: temporary,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_ATTR_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(temporary, "no-global-config"),
    GIT_TERMINAL_PROMPT: "0"
  };
  const git = (cwd, args) => {
    const result = spawnSync("git", args, {cwd, env, encoding: "utf8", windowsHide: true});
    assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr || result.error || result.stdout}`);
  };
  for (const [variant, attributes] of [["OLD", oldRootAttributes], ["FINAL", rootAttributes]]) {
    const repository = join(temporary, variant);
    await mkdir(join(repository, "tests", "fixtures"), {recursive: true});
    await writeFile(join(repository, ".gitattributes"), attributes);
    await writeFile(join(repository, "tests", "fixtures", ".gitattributes"), nestedAttributes);
    for (const item of cases) {
      const target = join(repository, item.path);
      await mkdir(dirname(target), {recursive: true});
      await writeFile(target, item.bytes);
      await writeFile(join(repository, item.provenance), item.provenanceBytes);
    }
    git(repository, ["init", "--quiet"]);
    git(repository, ["-c", "core.autocrlf=false", "add", "--all"]);
    for (const [mode, autocrlf, eol] of [["Windows", "true", "crlf"], ["LF", "false", "lf"]]) {
      const checkout = join(temporary, `${variant}-${mode}`);
      await mkdir(checkout);
      const prefix = checkout.replaceAll("\\", "/") + "/";
      git(repository, ["-c", `core.autocrlf=${autocrlf}`, "-c", `core.eol=${eol}`,
        "checkout-index", "--all", "--force", `--prefix=${prefix}`]);
      for (const item of cases) {
        const checked = await readFile(join(checkout, item.path));
        const actualSha = hash(checked);
        if (variant === "OLD" && mode === "Windows") {
          assert.equal(actualSha, item.windowsFailureSha, "reproduce the exact Windows CI hash");
          assert.notEqual(actualSha, item.expectedSha, "the old checkout must break the raw-byte guard");
        } else {
          assert.equal(actualSha, item.expectedSha, `${variant} ${mode} must retain exact recorded bytes`);
        }
        if (item.path.endsWith("log-show-json-footer-sample.txt")) {
          const footer = Buffer.from(item.provenanceData.sourceFooterExact);
          assert.equal(checked.includes(footer), !(variant === "OLD" && mode === "Windows"),
            "the exact LF footer must survive only when the raw fixture is protected");
        }
      }
    }
  }
});
