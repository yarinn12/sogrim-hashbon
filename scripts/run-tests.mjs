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

function collectJavaScriptFiles(dir) {
  return readdirSync(dir)
    .flatMap((entry) => {
      const path = join(dir, entry);
      const stats = statSync(path);
      if (stats.isDirectory()) return collectJavaScriptFiles(path);
      return /\.(?:mjs|js)$/u.test(entry) ? [path] : [];
    })
    .sort();
}

const testsDir = resolve("tests");
const testFiles = collectTestFiles(testsDir);
const withCoverage = process.argv.includes("--coverage");

const syntaxFiles = [
  resolve("server.mjs"),
  ...collectJavaScriptFiles(resolve("src")),
  ...collectJavaScriptFiles(resolve("scripts"))
];
for (const sourceFile of syntaxFiles) {
  const syntax = spawnSync(process.execPath, ["--check", sourceFile], {
    encoding: "utf8"
  });
  if (syntax.status === 0) continue;
  process.stderr.write(syntax.stderr || syntax.stdout || `Syntax check failed: ${sourceFile}\n`);
  process.exit(syntax.status ?? 1);
}

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
