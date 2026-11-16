import { readdir } from "node:fs/promises";
import { join, relative, resolve, dirname } from "node:path";
import { build } from "esbuild";

const normalize = value => value.replaceAll("\\", "/");
export function sourceLayer(file) {
  if (file === "server.mjs" || file.startsWith("src/server/")) return "server";
  for (const layer of ["domain", "data", "ui", "vendor"]) {
    if (file.startsWith(`src/${layer}/`)) return layer;
  }
  return "frontend";
}

export function allowedDependency(from, target) {
  const source = sourceLayer(from), destination = sourceLayer(target);
  if (target.startsWith("node:") || !target.startsWith("src/") && target !== "server.mjs") {
    return source === "server" || source === "frontend" && !target.startsWith("node:") && target !== "google-auth-library";
  }
  if (source === "domain") return destination === "domain";
  if (source === "data") return ["domain", "data"].includes(destination);
  if (source === "ui") return destination === "ui" || target === "src/uiIcons.mjs";
  if (source === "server") return ["server", "domain", "data"].includes(destination);
  return destination !== "server";
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(entries.map(entry => {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.(mjs|js)$/.test(entry.name) ? [file] : [];
  }));
  return groups.flat();
}

export async function inspectArchitecture(root, { includeServerEntry = true } = {}) {
  const entryPoints = await sourceFiles(join(root, "src"));
  if (includeServerEntry) entryPoints.push(join(root, "server.mjs"));
  // esbuild parses JavaScript, so comments and strings containing "import"
  // cannot create a dependency or authorize a forbidden one.
  const imports = [];
  await build({ absWorkingDir: root, entryPoints, bundle: true, format: "esm",
    outdir: "architecture-analysis", write: false, logLevel: "silent",
    plugins: [{ name: "record-parsed-dependencies", setup(builder) {
      builder.onResolve({ filter: /.*/ }, item => {
        if (item.kind === "entry-point") return;
        imports.push({ from: normalize(relative(root, item.importer)), path: item.path, kind: item.kind });
        return { path: item.path, external: true };
      });
    } }] });
  const violations = [];
  let dependencies = 0;
  for (const item of imports) {
    const from = item.from;
    if (sourceLayer(from) === "vendor") continue;
    dependencies++;
    const target = item.path.startsWith(".")
      ? normalize(relative(root, resolve(root, dirname(from), item.path))) : item.path;
    if (!allowedDependency(from, target)) violations.push({ from, target, kind: item.kind });
  }
  return { modules: entryPoints.length, dependencies, violations };
}
