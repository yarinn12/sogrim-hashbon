import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { nativeStaticCssTemplatePattern } from "../scripts/nativeStaticCssTemplates.mjs";

const root = process.cwd();
const script = await readFile("scripts/build-native-web.mjs", "utf8");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
// Exercise the actual builder functions without running its destructive output
// preparation or contacting the live bootstrap API.
const functions = script.slice(
  script.indexOf("async function extractNativeStaticCss("),
  script.indexOf("function replaceModuleGroup(")
);
const factory = new AsyncFunction(
  "readFile", "writeFile", "join", "resolve", "transformCss", "root",
  "nativeStaticCssTemplatePattern",
  `${functions}\nreturn { extractNativeStaticCss, extractStaticCssTemplatesPlugin };`
);

async function harness(read = readFile) {
  const files = new Map();
  const api = await factory(
    read, async (path, value) => files.set(path, value), join, resolve,
    ({ code }) => ({ code }), root, nativeStaticCssTemplatePattern
  );
  return { ...api, files };
}

test("native CSS keeps command icons before the later Circle and Ledger overrides", async () => {
  const html = await readFile("index.html", "utf8");
  const entries = [...html.matchAll(/<script type="module" src="\.\/src\/([^"?]+\.mjs)(?:\?pwa_release=\d+)?"><\/script>/g)]
    .map((match) => ({ path: `./src/${match[1]}` }));
  const { extractNativeStaticCss, files } = await harness();
  const paths = await extractNativeStaticCss(entries, "fixture-assets");
  const command = resolve("src/publicCommandIconLayer.mjs");
  assert.ok(paths.has(command), "command icon CSS must join the ordered native stylesheet");
  const css = files.get(join("fixture-assets", "native-layers.css"));
  const commandRule = css.indexOf("stroke-width: 1.9 !important;");
  const ledgerRule = css.indexOf("html.ledger-workspace-v1 .button-action-icon svg");
  assert.ok(commandRule >= 0 && ledgerRule > commandRule,
    "the 1.8 Ledger override must follow the command icon 1.9 rule");
});

test("bundled command JS still runs but cannot reinsert its CSS after native layers", async () => {
  const command = resolve("src/publicCommandIconLayer.mjs");
  const { extractStaticCssTemplatesPlugin } = await harness();
  let onLoad;
  extractStaticCssTemplatesPlugin(new Set([command])).setup({
    onLoad(_options, handler) { onLoad = handler; }
  });
  const { contents } = await onLoad({ path: command });
  const appended = [];
  const document = {
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return {}; },
    head: { append(style) { appended.push(style); } }
  };
  runInNewContext(contents.replace(/^import .*?;\s*/u,
    "const iconSvg = () => '<svg></svg>';\n"), { document });
  assert.equal(appended.length, 1, "command layer initialization must remain intact");
  assert.equal(appended[0].id, "public-command-icon-layer-style");
  assert.equal(appended[0].textContent, "", "late command CSS would reverse the native cascade");
});

test("native extraction leaves interpolated CSS and unrelated inline templates at runtime", async () => {
  const path = resolve("src/publicCommandIconLayer.mjs");
  const dynamic = 'style.textContent = `.icon { color: ${color}; }`;';
  const source = `const CSS = \`.base { display: block; }\`;\n${dynamic}`;
  const { extractNativeStaticCss, extractStaticCssTemplatesPlugin, files } = await harness(async () => source);
  const paths = await extractNativeStaticCss([{ path }], "fixture-assets");
  assert.equal(files.get(join("fixture-assets", "native-layers.css")).trim(), ".base { display: block; }");
  let onLoad;
  extractStaticCssTemplatesPlugin(paths).setup({ onLoad(_options, handler) { onLoad = handler; } });
  const { contents } = await onLoad({ path });
  assert.ok(contents.includes(dynamic), "runtime expressions must not be extracted or evaluated");
  const unrelated = 'style.textContent = `.other { color: red; }`;';
  assert.equal([...unrelated.matchAll(nativeStaticCssTemplatePattern("src/publicOtherLayer.mjs"))].length, 0);
});
