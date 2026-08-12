import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

function collectTestFiles(dir) {
  return readdirSync(dir)
    .flatMap((entry) => {
      const path = join(dir, entry);
      const stats = statSync(path);

      if (stats.isDirectory()) {
        return collectTestFiles(path);
      }

      return entry.endsWith(".test.mjs") ? [path] : [];
    })
    .sort();
}

const testsDir = resolve("tests");
const testFiles = collectTestFiles(testsDir);
const withCoverage = process.argv.includes("--coverage");

if (testFiles.length === 0) {
  console.error("No test files were found.");
  process.exit(1);
}

const result = spawnSync(process.execPath, [
  "--test",
  ...(withCoverage ? ["--experimental-test-coverage"] : []),
  ...testFiles
], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
