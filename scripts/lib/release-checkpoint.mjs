import { spawnSync } from "node:child_process";

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr.trim() || "Git command failed");
  return result.stdout.trim();
}

export function createReleaseCheckpoint({ cwd, name }) {
  if (!/^(checkpoint|release)\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(name ?? "")) throw new Error("Use checkpoint/<name> or release/<name>");
  git(cwd, ["check-ref-format", `refs/tags/${name}`]);
  const source = git(cwd, ["rev-parse", "HEAD"]);
  const tree = git(cwd, ["rev-parse", "HEAD^{tree}"]);
  if (git(cwd, ["status", "--porcelain"])) throw new Error("Commit every intended change before creating a checkpoint; working tree is dirty");
  const existing = spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/tags/${name}`], { cwd, windowsHide: true });
  if (existing.status === 0) throw new Error("Checkpoint already exists; tags are immutable and must not be moved");
  if (existing.status !== 1) throw new Error("Cannot verify checkpoint identity");
  const receipt = { schemaVersion: 1, name, source, tree, createdAtUtc: new Date().toISOString(),
    acceptance: "Git source checkpoint; test and distribution receipts are required separately",
    databaseBackup: false };
  git(cwd, ["tag", "-a", name, source, "-m", JSON.stringify(receipt, null, 2)]);
  const readback = git(cwd, ["rev-parse", `${name}^{commit}`]);
  if (readback !== source) throw new Error("Checkpoint readback differs from source");
  return receipt;
}
