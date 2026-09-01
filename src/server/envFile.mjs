import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

const privateEnvLoaded = new WeakSet();

export function loadEnvFile(filePath, env = process.env, { loadPrivate = env === process.env } = {}) {
  if (loadPrivate) loadPrivateOperatorEnv(env);
  if (!existsSync(filePath)) return env;

  const values = parseEnvFile(readFileSync(filePath, "utf8"));
  mergeEnvFileValues(env, values);
  return env;
}

export function resolvePrivateOperatorEnvPath(env = process.env) {
  const configuredPath = String(env.SOGRIM_PRIVATE_ENV_FILE ?? "").trim();
  if (configuredPath) {
    const resolvedPath = resolve(configuredPath);
    assertOutsideCurrentWorkspace(resolvedPath);
    return resolvedPath;
  }

  const privateRoot = process.platform === "win32" && env.LOCALAPPDATA
    ? join(env.LOCALAPPDATA, "SogrimHeshbon", "private")
    : join(homedir(), ".config", "sogrim-hashbon", "private");
  const resolvedPath = join(privateRoot, "operator.env");
  assertOutsideCurrentWorkspace(resolvedPath);
  return resolvedPath;
}

export function loadPrivateOperatorEnv(env = process.env) {
  if (privateEnvLoaded.has(env)) return env;
  privateEnvLoaded.add(env);
  if (String(env.SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD ?? "") === "1") return env;

  const privateEnvPath = resolvePrivateOperatorEnvPath(env);
  if (!existsSync(privateEnvPath)) return env;
  mergeEnvFileValues(env, parseEnvFile(readFileSync(privateEnvPath, "utf8")));
  return env;
}

export function parseEnvFile(text) {
  const values = {};

  for (const line of String(text).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const assignment = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length).trimStart()
      : trimmed;

    const separatorIndex = assignment.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = assignment.slice(0, separatorIndex).trim();
    const rawValue = assignment.slice(separatorIndex + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    values[key] = unquote(rawValue);
  }

  return values;
}

export function mergeEnvFileValues(env, values) {
  for (const [key, value] of Object.entries(values)) {
    if (env[key] === undefined || env[key] === "") {
      env[key] = value;
    }
  }
}

function unquote(value) {
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  return value;
}

function assertOutsideCurrentWorkspace(candidatePath) {
  const workspaceRoot = canonicalizePath(process.cwd());
  const pathFromWorkspace = relative(workspaceRoot, canonicalizePath(candidatePath));
  const isWithinWorkspace = pathFromWorkspace === "" || (
    !pathFromWorkspace.startsWith("..") && !isAbsolute(pathFromWorkspace)
  );
  if (isWithinWorkspace) {
    throw new Error("Private operator environment must be stored outside the project workspace.");
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
