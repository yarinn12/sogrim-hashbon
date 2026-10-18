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

test("native CSS includes the approved creation tabs before runtime starts", async () => {
  const ledger = resolve("src/publicLedgerWorkspaceLayer.mjs");
  const { extractNativeStaticCss, files } = await harness();
  const paths = await extractNativeStaticCss([{path: ledger}], "fixture-assets");
  assert.ok(paths.has(ledger), "Ledger must remain statically extractable for native bundles");
  const css = files.get(join("fixture-assets", "native-layers.css"));
  assert.match(css, /\.event-creation-tabs\s*\{[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.event-creation-tabs > li\.is-active > button\s*\{[\s\S]*?background: var\(--ledger-accent-soft\)/);
});


test("native event-type choices keep scalable leaf text and one frame", async () => {
  const ledger = resolve("src/publicLedgerWorkspaceLayer.mjs");
  const { extractNativeStaticCss, files } = await harness();
  const paths = await extractNativeStaticCss([{ path: ledger }], "fixture-assets");
  assert.ok(paths.has(ledger), "event choice styling must reach native bundles");
  const css = files.get(join("fixture-assets", "native-layers.css"));
  const prefix = 'html.ledger-workspace-v1.circle-design-v1 body #app .new-event-type-screen[data-event-creation-step="type"] ';
  const rule = (selector) => {
    const start = css.indexOf(prefix + selector + " {");
    assert.ok(start >= 0, `Missing scoped native event-choice rule: ${selector}`);
    return css.slice(start, css.indexOf("}", start));
  };
  assert.match(rule(".event-type-option > strong"), /font-size: 1\.125rem !important;/,
    "fixed title pixels would ignore the requested text enlargement");
  assert.match(rule(".event-type-option > span:not(.studio-event-type-icon):not(.event-choice-forward)"),
    /font-size: \.8125rem !important;/,
    "description glyphs must enlarge together with the root, not stay fixed");
  assert.match(rule(".event-type-step-panel"), /border: 1px solid var\(--ledger-line\) !important;/);
  assert.match(rule(".event-type-option"), /border: 0 !important;/);
  assert.match(rule(".event-type-option"), /box-shadow: none !important;/);
});


test("native event details keep scalable labels and a bounded currency list", async () => {
  const ledger = resolve("src/publicLedgerWorkspaceLayer.mjs");
  const { extractNativeStaticCss, files } = await harness();
  const paths = await extractNativeStaticCss([{ path: ledger }], "fixture-assets");
  assert.ok(paths.has(ledger));
  const css = files.get(join("fixture-assets", "native-layers.css"));
  const prefix = 'html.ledger-workspace-v1.circle-design-v1 body #app .new-event-details-screen[data-event-creation-step="details"] ';
  const rule = selector => {
    const start = css.indexOf(prefix + selector + " {");
    assert.ok(start >= 0, `Missing native details rule: ${selector}`);
    return css.slice(start, css.indexOf("}", start));
  };
  assert.match(rule(".field > span"), /font-size: \.875rem !important;/,
    "fixed field-label pixels would ignore the requested root text enlargement");
  assert.match(rule(".new-event-inline-picker-menu"), /max-height: min\(18rem, 45dvh\) !important;/);
  assert.match(rule(".new-event-inline-picker-menu"), /overflow-y: auto !important;/);
});


test("native settlement settings include scalable labels and the approved full-width action", async () => {
  const ledger = resolve("src/publicLedgerWorkspaceLayer.mjs");
  const { extractNativeStaticCss, files } = await harness();
  const paths = await extractNativeStaticCss([{ path: ledger }], "fixture-assets");
  assert.ok(paths.has(ledger));
  const css = files.get(join("fixture-assets", "native-layers.css"));
  const prefix = 'html.ledger-workspace-v1.circle-design-v1 body #app .new-event-settlement-screen[data-event-creation-step="settlement"] ';
  const rule = selector => {
    const start = css.indexOf(prefix + selector + " {");
    assert.ok(start >= 0, `Missing native settlement rule: ${selector}`);
    return css.slice(start, css.indexOf("}", start));
  };
  assert.match(rule(".field > span"), /font-size: \.875rem !important;/);
  assert.match(rule(".field > small"), /font-weight: 400 !important;/);
  assert.match(rule(".actions > .primary-button"), /width: 100% !important;/);
});


test("native participants overview scales names, counts, route titles and helper text", async () => {
  const ledger = resolve("src/publicLedgerWorkspaceLayer.mjs");
  const { extractNativeStaticCss, files } = await harness();
  const paths = await extractNativeStaticCss([{ path: ledger }], "fixture-assets");
  assert.ok(paths.has(ledger));
  const css = files.get(join("fixture-assets", "native-layers.css"));
  const prefix = 'html.ledger-workspace-v1.circle-design-v1 body #app .new-event-participants-screen:not(.new-event-participant-subscreen) ';
  for (const [selector, size] of [
    [".new-event-selected-participant-copy strong", "1rem"],
    [".new-event-selected-participants-heading>span", ".8125rem"],
    [".new-event-participant-route-action strong", "1rem"],
    [".new-event-participant-route-action small", ".8125rem"]
  ]) {
    const actualPrefix = selector.startsWith(".new-event-selected") ? prefix.replace(":not(.new-event-participant-subscreen)", "") : prefix;
    const start = css.indexOf(actualPrefix + selector + " {");
    assert.ok(start >= 0, `Native participant leaf must scale instead of retaining fixed pixels: ${selector}`);
    const rule = css.slice(start, css.indexOf("}", start));
    assert.ok(rule.includes(`font-size:${size} !important;`));
  }
});

test("native participants overview retains owner role and participant status in enlarged layouts", async () => {
  const ledger = resolve("src/publicLedgerWorkspaceLayer.mjs");
  const { extractNativeStaticCss, files } = await harness();
  await extractNativeStaticCss([{ path: ledger }], "fixture-assets");
  const css = files.get(join("fixture-assets", "native-layers.css"));
  const prefix = 'html.ledger-workspace-v1.circle-design-v1 body #app .new-event-participants-screen ';
  for (const [selector, display] of [
    [".new-event-selected-participant .avatar", "grid"],
    [".new-event-selected-participant-self", "block"],
    [".new-event-selected-participant .participant-connection-badge", "inline-flex"]
  ]) {
    const start = css.lastIndexOf(prefix + selector + " {");
    assert.ok(start >= 0, `Native participant identity must remain visible: ${selector}`);
    const rule = css.slice(start, css.indexOf("}", start));
    assert.ok(rule.includes(`display:${display} !important;`));
    assert.ok(rule.includes("visibility:visible !important;"));
  }
});


test("native friends picker enlarges participant names and group headings with system text", async () => {
  const ledger = resolve("src/publicLedgerWorkspaceLayer.mjs");
  const { extractNativeStaticCss, files } = await harness();
  await extractNativeStaticCss([{ path: ledger }], "fixture-assets");
  const css = files.get(join("fixture-assets", "native-layers.css"));
  const prefix = 'html.ledger-workspace-v1.circle-design-v1 body #app .new-event-participant-subscreen[data-new-event-participant-subview="friends"] ';
  for (const selector of [".participant-pill-name", ".participant-identity-group-copy > strong"]) {
    const from = css.indexOf(prefix + selector + " {");
    assert.ok(from >= 0, `Native friends text needs a scoped scalable rule: ${selector}`);
    const rule = css.slice(from, css.indexOf("}", from));
    assert.match(rule, /font-size: \.875rem !important;/,
      "14px normal text must become17.5px at root20 and28px at root32");
  }
});


test("native identity labels share the neutral scalable language across role connection and relationship renderers", async () => {
  const { extractNativeStaticCss, files } = await harness();
  await extractNativeStaticCss([{ path: resolve("src/publicLedgerWorkspaceLayer.mjs") }], "fixture-assets");
  const css = files.get(join("fixture-assets", "native-layers.css"));
  const selector = 'html.ledger-workspace-v1.circle-design-v1 body #app .participant-identity-label';
  const from = css.lastIndexOf(selector + " {");
  assert.ok(from >= 0, "All identity labels need a common native stylesheet rule");
  const rule = css.slice(from, css.indexOf("}", from));
  for (const declaration of ["padding:0 !important;", "border:0 !important;", "background:transparent !important;",
    "box-shadow:none !important;", "font-size:.8125rem !important;", "font-weight:400 !important;",
    "line-height:1.5 !important;", "white-space:normal !important;", "overflow-wrap:anywhere !important;"]) {
    assert.ok(rule.includes(declaration), declaration);
  }
  const app = await readFile("src/app.mjs", "utf8");
  for (const family of ["new-event-selected-participant-self", "participant-connection-badge", "event-participant-status-tag", "relationship-friendship-badge"]) {
    const matches = [...app.matchAll(/class="([^"\n]+)"/g)].map(m => m[1])
      .filter(c => c.split(/\s/).includes(family) && !c.includes("is-duplicate"));
    assert.ok(matches.length > 0, family);
    assert.ok(matches.every(c => c.split(/\s/).includes("participant-identity-label")),
      `${family} must consume the shared identity language`);
  }
});


test("native manual selected identities retain the shared row and visible captions on narrow enlarged screens", async () => {
  const { extractNativeStaticCss, files } = await harness();
  await extractNativeStaticCss([{ path: resolve("src/publicLedgerWorkspaceLayer.mjs") }], "fixture-assets");
  const css = files.get(join("fixture-assets", "native-layers.css"));
  const prefix = 'html.ledger-workspace-v1.circle-design-v1 body #app .new-event-participants-screen ';
  const from = css.lastIndexOf(prefix + '.new-event-selected-participant .participant-connection-badge {');
  assert.ok(from >= 0, "Manual and main selected rows must both override the old hidden caption rule");
  const rule = css.slice(from, css.indexOf("}", from));
  assert.ok(rule.includes('display:inline-flex !important;'));
  assert.ok(rule.includes('visibility:visible !important;'));
  const rowFrom = css.indexOf(prefix + '.new-event-selected-participant {');
  assert.ok(rowFrom >= 0);
  const row = css.slice(rowFrom, css.indexOf('}', rowFrom));
  assert.ok(row.includes('grid-template-areas:"avatar copy check" "avatar status check" !important;'),
    "Place status under the name so it keeps its own row when enlarged");
});
