import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const shard = Number(process.argv[2]);
if (![1, 2].includes(shard)) throw new Error("Expected cross-platform shard 1 or 2");

const source = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim();
if (source !== process.env.EXPECTED_SOURCE || !/^[a-f0-9]{40}$/.test(source) ||
    !/^[a-f0-9]{40}$/.test(tree) || !process.env.GITHUB_RUN_ID ||
    !process.env.GITHUB_RUN_ATTEMPT) {
  throw new Error("Missing or incorrect cross-platform shard source identity");
}

const directory = "qa-cross-platform-shard";
mkdirSync(directory, { recursive: true });
writeFileSync(`${directory}/receipt.json`, JSON.stringify({
  lane: "cross-platform", source, tree, shard,
  runId: process.env.GITHUB_RUN_ID,
  runAttempt: process.env.GITHUB_RUN_ATTEMPT
}) + "\n");
