import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { availableParallelism } from "node:os";
import { requestedSuite, selectTestFiles } from "./lib/test-suites.mjs";

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
const testFiles = selectTestFiles(collectTestFiles(testsDir), process.cwd(), requestedSuite(process.argv.slice(2)));
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

// Separate the two javac-backed files on Windows. Node runs test files in
// workers, so a single four-worker invocation can compile both probes at once
// while other test files compete for CPU. Keep the remaining suite parallel.
const javaProbeNames = ["androidWebViewLoadOrder.test.mjs", "androidWebViewProbeModel.test.mjs"];
const isJavaProbe = (file) => javaProbeNames.some((name) => file.endsWith(name));
const javaProbeFiles = process.platform === "win32" ? testFiles.filter(isJavaProbe) : [];
const remainingFiles = testFiles.filter((file) => !javaProbeFiles.includes(file));
// Process-lifecycle tests launch their own observers. A large host CPU count
// must not oversubscribe those children and turn fixed safety deadlines flaky.
const normalConcurrency = Math.min(4, Math.max(1, availableParallelism() - 1));
const groups = [
  ...(javaProbeFiles.length ? [{ files: javaProbeFiles, concurrency: 1 }] : []),
  ...(remainingFiles.length ? [{ files: remainingFiles, concurrency: normalConcurrency }] : [])
];
let exitStatus = 0;
for (const { files, concurrency } of groups) {
  const result = spawnSync(process.execPath, [
    "--test",
    `--test-concurrency=${concurrency}`,
    ...(withCoverage ? ["--experimental-test-coverage"] : []),
    // Absolute paths repeat the workspace prefix for every file and can exceed
    // Windows' process command-line limit before any tests are launched.
    ...files.map((file) => relative(process.cwd(), file))
  ], { stdio: "inherit" });
  if (result.error) process.stderr.write(`${result.error.message}\n`);
  if (result.status !== 0 && exitStatus === 0) exitStatus = result.status ?? 1;
}
process.exit(exitStatus);
