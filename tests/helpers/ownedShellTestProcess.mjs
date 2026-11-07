import { constants, setPriority } from "node:os";

// The synthetic transport harness measures ownership and pipe closure, not host
// throughput. Favor only its freshly spawned Bash child on a busy Windows host.
// This setting lasts for that child; other processes and test deadlines stay put.
export function prioritizeOwnedShellTestChild(child, { platform = process.platform, prioritize = setPriority } = {}) {
  if (platform !== "win32" || !Number.isSafeInteger(child?.pid) || child.pid <= 1) return false;
  prioritize(child.pid, constants.priority.PRIORITY_ABOVE_NORMAL);
  return true;
}
