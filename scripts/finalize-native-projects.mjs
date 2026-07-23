import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const packageFile = join(root, "ios", "App", "CapApp-SPM", "Package.swift");
const source = await readFile(packageFile, "utf8");
const normalized = source.replace(/path: "([^"]+)"/g, (match, packagePath) => {
  return `path: "${packagePath.replaceAll("\\", "/")}"`;
});

if (normalized !== source) {
  await writeFile(packageFile, normalized, "utf8");
}

console.log("Native projects finalized for Android and macOS/Xcode builds.");
