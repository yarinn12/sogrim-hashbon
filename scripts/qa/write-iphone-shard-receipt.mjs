import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const [project, shardArg] = process.argv.slice(2);
const outputDirectory = new Map([
  ["iphone-large-text", "qa-large-text-shard"],
  ["iphone-webkit", "qa-iphone-webkit-shard"]
]).get(project);
const shard = Number(shardArg);
if (!outputDirectory || ![1, 2].includes(shard)) {
  throw new Error("Expected iPhone shard project and shard 1 or 2");
}
const source = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim();
if (source !== process.env.EXPECTED_SOURCE || !process.env.GITHUB_RUN_ID ||
    !process.env.GITHUB_RUN_ATTEMPT) {
  throw new Error("Missing or incorrect shard source identity");
}
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(`${outputDirectory}/receipt.json`, JSON.stringify({
  project, source, tree, shard, runId: process.env.GITHUB_RUN_ID,
  runAttempt: process.env.GITHUB_RUN_ATTEMPT
}) + "\n");
