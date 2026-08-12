import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function resolveAndroidJavaHome(env = process.env, options = {}) {
  const platform = options.platform ?? process.platform;
  const configured = String(env.JAVA_HOME ?? "").trim();
  if (isUsableJavaHome(configured, { platform })) return configured;
  if (platform !== "win32") return "";

  const programFiles = options.programFiles ?? env.ProgramFiles ?? "C:\\Program Files";
  const androidRoot = join(programFiles, "Android");
  const studioHomes = childDirectories(androidRoot)
    .filter((name) => name.toLowerCase().startsWith("android studio"))
    .map((name) => join(androidRoot, name, "jbr"));
  const adoptiumRoot = join(programFiles, "Eclipse Adoptium");
  const adoptiumHomes = childDirectories(adoptiumRoot)
    .map((name) => join(adoptiumRoot, name));

  return [...studioHomes, ...adoptiumHomes]
    .find((candidate) => isUsableJavaHome(candidate, { platform })) ?? "";
}

export function isUsableJavaHome(javaHome, options = {}) {
  const normalized = String(javaHome ?? "").trim();
  if (!normalized) return false;
  const executable = (options.platform ?? process.platform) === "win32"
    ? "java.exe"
    : "java";
  return (
    existsSync(join(normalized, "bin", executable)) &&
    existsSync(join(normalized, "lib", "jvm.cfg"))
  );
}

function childDirectories(root) {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}
