import { existsSync, readFileSync } from "node:fs";

export function loadEnvFile(filePath, env = process.env) {
  if (!existsSync(filePath)) return env;

  const values = parseEnvFile(readFileSync(filePath, "utf8"));
  mergeEnvFileValues(env, values);
  return env;
}

export function parseEnvFile(text) {
  const values = {};

  for (const line of String(text).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
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
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
