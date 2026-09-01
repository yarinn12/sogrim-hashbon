import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { chmod, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

const PRIVATE_FILENAMES = Object.freeze({
  storeReview: "store-review-credentials.json",
  inviteQa: "invite-qa-credentials.json"
});

export function resolvePrivateRoot(env = process.env) {
  const configured = String(env.SOGRIM_PRIVATE_DIR ?? "").trim();
  if (configured) return resolve(configured);
  if (process.platform === "win32" && env.LOCALAPPDATA) {
    return join(env.LOCALAPPDATA, "SogrimHeshbon", "private");
  }
  return join(homedir(), ".config", "sogrim-hashbon", "private");
}

export function resolvePrivateCredentialPath(kind, {
  env = process.env,
  workspaceRoot = process.cwd()
} = {}) {
  const envName = kind === "storeReview"
    ? "SOGRIM_STORE_REVIEW_CREDENTIALS_FILE"
    : "SOGRIM_INVITE_QA_CREDENTIALS_FILE";
  const configured = String(env[envName] ?? "").trim();
  const filename = PRIVATE_FILENAMES[kind];
  if (!filename) throw new Error(`Unsupported private credential kind: ${kind}`);
  const path = configured ? resolve(configured) : join(resolvePrivateRoot(env), filename);
  assertOutsideWorkspace(path, workspaceRoot);
  return path;
}

export function readPrivateCredentials(kind, options = {}) {
  const path = resolvePrivateCredentialPath(kind, options);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

export function readStoreReviewCredentials({ env = process.env, ...options } = {}) {
  const stored = readPrivateCredentials("storeReview", { env, ...options });
  return {
    ...stored,
    email: String(stored.email ?? "").trim(),
    password: String(stored.password ?? "")
  };
}

export async function writePrivateCredentials(kind, credentials, options = {}) {
  const path = resolvePrivateCredentialPath(kind, options);
  await ensurePrivateDirectory(dirname(path));
  writeFileSync(path, `${JSON.stringify(credentials, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  await chmod(path, 0o600).catch(() => {});
  return path;
}

export async function ensurePrivateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700).catch(() => {});
}

export function assertOutsideWorkspace(candidatePath, workspaceRoot = process.cwd()) {
  const absoluteCandidate = canonicalizePath(candidatePath);
  const absoluteWorkspace = canonicalizePath(workspaceRoot);
  const pathFromWorkspace = relative(absoluteWorkspace, absoluteCandidate);
  const isWithinWorkspace = pathFromWorkspace === "" || (
    !pathFromWorkspace.startsWith("..") && !isAbsolute(pathFromWorkspace)
  );
  if (isWithinWorkspace) {
    throw new Error("Private credentials must be stored outside the project workspace.");
  }
}

function canonicalizePath(path) {
  let current = resolve(path);
  const missingSegments = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) break;
    missingSegments.unshift(basename(current));
    current = parent;
  }
  const canonicalBase = existsSync(current)
    ? realpathSync.native(current)
    : current;
  return resolve(canonicalBase, ...missingSegments);
}
