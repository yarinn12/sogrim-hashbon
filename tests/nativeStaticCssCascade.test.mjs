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


test("native manual participant form retains scalable labeled input and full-width add action", async () => {
  const { extractNativeStaticCss, files } = await harness();
  await extractNativeStaticCss([{ path: resolve("src/publicLedgerWorkspaceLayer.mjs") }], "fixture-assets");
  const css = files.get(join("fixture-assets", "native-layers.css"));
  const prefix = 'html.ledger-workspace-v1.circle-design-v1 body #app .new-event-participant-subscreen[data-new-event-participant-subview="manual"] ';
  for (const [selector, declarations] of [
    ['.manual-name-label', ['font-size:.875rem !important;', 'display:block !important;']],
    ['.new-event-offline-add input', ['font-size:1rem !important;', 'min-height:52px !important;']],
    ['.new-event-offline-add [data-action="new-event-add-guest"]', ['font-size:1rem !important;', 'min-height:48px !important;', 'width:100% !important;']]
  ]) {
    const from = css.lastIndexOf(prefix + selector + ' {');
    assert.ok(from >= 0, `Manual form needs its scalable native rule: ${selector}`);
    const rule = css.slice(from, css.indexOf('}', from));
    for (const declaration of declarations) assert.ok(rule.includes(declaration), declaration);
  }
});


test("native expense disclosure keeps its state cue and text-scaled menu width", async () => {
  const ledger = resolve("src/publicLedgerWorkspaceLayer.mjs");
  const { extractNativeStaticCss, files } = await harness();
  const paths = await extractNativeStaticCss([{ path: ledger }], "fixture-assets");
  assert.ok(paths.has(ledger));
  const css = files.get(join("fixture-assets", "native-layers.css"));
  const prefix='html.ledger-workspace-v1.design-coherence-v1 body #app .screen[data-screen-kind="event"] ';
  const rule=selector=>{
    const start=css.indexOf(prefix+selector+' {');
    assert.ok(start>=0, `Missing native expense rule: ${selector}`);
    return css.slice(start,css.indexOf('}',start));
  };
  assert.match(rule('.expense-row-title-text'),/overflow-wrap: anywhere !important/);
  assert.match(rule('.expense-row-expand-icon'),/transform: rotate\(-90deg\)/);
  assert.match(rule('.expense-row-main[aria-expanded="true"] .expense-row-expand-icon'),/transform: rotate\(90deg\)/);
  assert.match(rule('.expense-row-actions-menu[open] > div'),
    /width: clamp\(166px, 10\.375rem, calc\(100vw - 32px\)\) !important/,
    'a fixed166px menu forces all enlarged command labels onto two lines');
});


test("native action dock anchors the total and sizes its button for a single label line", async () => {
  const ledger=resolve('src/publicLedgerWorkspaceLayer.mjs');
  const {extractNativeStaticCss,files}=await harness();
  await extractNativeStaticCss([{path:ledger}],'fixture-assets');
  const css=files.get(join('fixture-assets','native-layers.css'));
  const prefix='html.design-coherence-v1.ledger-workspace-v1 body #app .screen[data-screen-kind="event"] ';
  const fullRule=selector=>{
    const start=css.lastIndexOf(selector+' {');
    assert.ok(start>=0,`Missing native action-dock rule: ${selector}`);
    return css.slice(start,css.indexOf('}',start));
  };
  const rule=selector=>fullRule(prefix+selector);
  assert.match(rule('.event-action-dock .event-action-total'),/justify-items: end !important/);
  assert.match(rule('.event-action-dock .event-action-total'),/text-align: left !important/);
  assert.match(rule('.event-action-dock'),/display: flex !important/);
  assert.match(rule('.event-action-dock'),/flex-wrap: wrap !important/,
    'long totals must push the button to a second row instead of overflowing a fixed cell');
  assert.match(rule('.event-action-dock .event-action-total'),/min-width: min-content !important/);
  const button='.event-action-dock > .primary-button[data-action="show-expense-form"]';
  assert.match(rule(button),/width: auto !important/);
  assert.match(rule(button),/gap: 6px !important/);
  assert.match(rule(button+' > span:last-child'),/white-space: nowrap !important/);
  const icon=rule('.event-action-dock .primary-button .command-card-icon');
  assert.match(icon,/width: 14px !important/);
  assert.match(icon,/transform: none !important/);
  const large='html:is(.dynamic-type-large,.dynamic-type-extra-large,.dynamic-type-preview).design-coherence-v1.ledger-workspace-v1 body #app .screen[data-screen-kind="event"] '+button;
  assert.match(fullRule(large),/width: 100% !important/);
  assert.match(fullRule(large),/min-width: 0 !important/);
});


test("native amount entry retains scalable numeric and label glyphs with a viewport-bound panel", async () => {
  const {extractNativeStaticCss,files}=await harness();
  await extractNativeStaticCss([{path:resolve('src/publicLedgerWorkspaceLayer.mjs')}],'fixture-assets');
  const css=files.get(join('fixture-assets','native-layers.css'));
  const prefix='html.design-coherence-v1.ledger-workspace-v1 body #app .expense-step-modal[data-expense-step="amount"]';
  const rule=selector=>{
    const start=css.lastIndexOf(prefix+selector+' {');
    assert.ok(start>=0,`Amount screen needs an extractable native rule for ${selector||'panel'}`);
    return css.slice(start,css.indexOf('}',start));
  };
  assert.match(rule(' .expense-total-field input[data-action="expense-total"]'),/font-size: 2\.375rem !important/,
    'generic enlarged-input rules must not reduce the numeric font below its normal38px');
  for(const leaf of [' .expense-total-field > span',' .expense-source-currency-field > span']) {
    assert.match(rule(leaf),/font-size: \.8125rem !important/,'fixed12.5px labels ignore system text enlargement');
  }
  assert.match(rule(' .expense-total-field .currency-input-badge'),/font-size: inherit !important/);
  assert.match(rule(' .expense-total-field input[data-action="expense-total"]::placeholder'),/font-size: inherit !important/);
  const captionStart=css.indexOf(prefix+' .expense-modal-step-header .eyebrow {');
  assert.ok(captionStart>=0);
  assert.match(css.slice(captionStart,css.indexOf('}',captionStart)),/background: transparent !important/);
  assert.match(rule(' .expense-modal-step-header .eyebrow'),/display: none !important/,
    'short-landscape rules must retain the existing compact header');
  assert.match(rule(' .expense-source-currency-field'),/flex-wrap: wrap !important/);
  const panelStart=css.lastIndexOf('html.design-coherence-v1.ledger-workspace-v1:not(.responsive-tablet-shell) body #app .expense-step-modal[data-expense-step] {');
  assert.ok(panelStart>=0,'the phone scrollport rule must preserve the existing bounded tablet canvas');
  assert.match(css.slice(panelStart,css.indexOf('}',panelStart)),/width: 100% !important/,'all steps must follow the scrollbar-reduced viewport');
  const backdrop='html.design-coherence-v1.ledger-workspace-v1 body #app .expense-step-route-backdrop:has(> .expense-step-modal[data-expense-step])';
  const start=css.lastIndexOf(backdrop+' {');
  assert.ok(start>=0);
  assert.match(css.slice(start,css.indexOf('}',start)),/width: auto !important/,
    'short landscape must also constrain the fixed backdrop, not only its panel');
});


test("native expense steps scale field captions and participant names beyond the amount screen",async()=>{
 const {extractNativeStaticCss,files}=await harness();
 await extractNativeStaticCss([{path:resolve('src/publicLedgerWorkspaceLayer.mjs')}],'fixture-assets');
 const css=files.get(join('fixture-assets','native-layers.css'));
 const prefix='html.design-coherence-v1.ledger-workspace-v1 body #app .expense-step-modal[data-expense-step] ';
 for(const [selector,size] of [['.field > span','.8125rem'],['.expense-participant-row-copy strong','.875rem'],['.expense-participant-row-copy small','.8125rem'],['.expense-review-row small','.8125rem'],['.expense-review-row strong','.9375rem']]) {
  const start=css.lastIndexOf(prefix+selector+' {');
  assert.ok(start>=0,`${selector} needs a shared native text-enlargement rule`);
  assert.ok(css.slice(start,css.indexOf('}',start)).includes(`font-size: ${size} !important;`));
 }
 const narrow=css.lastIndexOf(prefix+'.expense-review-date {');
 assert.ok(narrow>=0);
 assert.match(css.slice(narrow,css.indexOf('}',narrow)),/grid-template-columns: minmax\(0, 1fr\) !important/,
   'the date control must not squeeze its enlarged caption into an unreadable narrow cell');
});


test("native amount keyboard header reserves space below its fixed controls after the quiet caption",async()=>{
 const {extractNativeStaticCss,files}=await harness();
 await extractNativeStaticCss([{path:resolve('src/publicLedgerWorkspaceLayer.mjs')}],'fixture-assets');
 const css=files.get(join('fixture-assets','native-layers.css'));
 const selector='html.app-software-keyboard-open.design-coherence-v1.ledger-workspace-v1 body #app .expense-step-modal[data-expense-step="amount"] .expense-modal-step-header';
 const start=css.lastIndexOf(selector+' {');
 assert.ok(start>=0,'native amount header must reserve the full fixed-control band with its shorter caption');
 assert.match(css.slice(start,css.indexOf('}',start)),/padding-top: 36px !important/);
});


test("native enlarged participant footer follows the measured bottom navigation height",async()=>{
 const {extractNativeStaticCss,files}=await harness();
 await extractNativeStaticCss([{path:resolve('src/publicLedgerWorkspaceLayer.mjs')}],'fixture-assets');
 const css=files.get(join('fixture-assets','native-layers.css')).replace(/\r\n/g,'\n');
 const selector='html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview).ledger-workspace-v1';
 const start=css.indexOf(selector+'\n      .screen[data-event-creation-step="participants"]');
 assert.ok(start>=0,'enlarged participant footer must be in extracted Native CSS');
 assert.match(css.slice(start,css.indexOf('}',start)),/var\(--dynamic-type-bottom-nav-block, 148px\)/,
  'a fixed148px offset loses its safe gap when the actual navigation grows to two rows');
});


test("native expense name placeholder scales with its input instead of staying16px",async()=>{
 const {extractNativeStaticCss,files}=await harness();
 await extractNativeStaticCss([{path:resolve('src/publicLedgerWorkspaceLayer.mjs')}],'fixture-assets');
 const css=files.get(join('fixture-assets','native-layers.css'));
 const selector='html.design-coherence-v1.ledger-workspace-v1 body #app .expense-step-modal[data-expense-step="name"] .expense-name-field input::placeholder';
 const start=css.lastIndexOf(selector+' {');
 assert.ok(start>=0,'the actual placeholder glyph font must reach Native too');
 assert.match(css.slice(start,css.indexOf('}',start)),/font-size: inherit !important/);
});

test("native expense name templates reserve text-relative width for whole words",async()=>{
 const {extractNativeStaticCss,files}=await harness();
 await extractNativeStaticCss([{path:resolve('src/publicLedgerWorkspaceLayer.mjs')}],'fixture-assets');
 const css=files.get(join('fixture-assets','native-layers.css'));
 const selector='html.design-coherence-v1.ledger-workspace-v1 body #app .expense-step-modal[data-expense-step="name"] .expense-template-grid';
 const start=css.lastIndexOf(selector+' {');
 assert.ok(start>=0,'enlarged template words need an intrinsic width, not two fixed phone columns');
 assert.match(css.slice(start,css.indexOf('}',start)),/repeat\(auto-fit, minmax\(min\(100%, 7rem\), 1fr\)\)/);
});

test("native approved expense header retains original progress and compact keyboard layout",async()=>{
 const {extractNativeStaticCss,files}=await harness();
 await extractNativeStaticCss([{path:resolve('src/publicLedgerWorkspaceLayer.mjs')}],'fixture-assets');
 const css=files.get(join('fixture-assets','native-layers.css'));
 const selector='html:not(.app-software-keyboard-open).design-coherence-v1.ledger-workspace-v1 body #app .expense-step-modal[data-expense-step] .expense-modal-step-header h2';
 const start=css.lastIndexOf(selector+' {');
 assert.ok(start>=0,'approved hero must be extractable without replacing the proven keyboard header');
 const rule=css.slice(start,css.indexOf('}',start));
 assert.match(rule,/border-radius: 24px !important/);
 assert.match(rule,/font-size: 1\.5rem !important/);
 assert.match(rule,/color: #fff !important/);
 const app=await readFile('src/app.mjs','utf8');
 const progress=await readFile('src/ui/expenseFlowProgress.mjs','utf8');
 assert.match(app,/renderExpenseFlowProgressView/);
 assert.match(progress,/aria-current="step"/);
 assert.match(progress,/class="expense-progress-step-button"/,'approved bars now contain accessible navigation buttons');
 assert.match(css,/\.expense-flow-progress li span/,'stage names remain visually hidden inside the original bars');
});


test("native payer amount captions and numeric glyphs grow with enlarged text",async()=>{
 const {extractNativeStaticCss,files}=await harness();
 await extractNativeStaticCss([{path:resolve('src/publicLedgerWorkspaceLayer.mjs')}],'fixture-assets');
 const css=files.get(join('fixture-assets','native-layers.css'));
 const prefix='html.design-coherence-v1.ledger-workspace-v1 body #app .expense-step-modal[data-expense-step="payer"] ';
 for(const [selector,property] of [['.payer-amount-field>span','font-size:.8125rem!important'],['.payer-amount-field input','font-size:1.25rem!important']]) {
  const start=css.lastIndexOf(prefix+selector+' {');assert.ok(start>=0,selector+' must reach extracted Native CSS');
  assert.ok(css.slice(start,css.indexOf('}',start)).replace(/\s/g,'').includes(property));
 }
});

test("native payer validation stays above add action and removal remains beside the person",async()=>{
 const {extractNativeStaticCss,files}=await harness();
 await extractNativeStaticCss([{path:resolve('src/publicLedgerWorkspaceLayer.mjs')}],'fixture-assets');
 const css=files.get(join('fixture-assets','native-layers.css'));
 const prefix='html.design-coherence-v1.ledger-workspace-v1 body #app .expense-step-modal[data-expense-step="payer"] ';
 for(const [selector,property] of [['.expense-payer-summary','display:block!important'],['.payer-row>[data-action="remove-payer"]','grid-row:1!important']]) {
  const start=css.lastIndexOf(prefix+selector+' {');assert.ok(start>=0,selector+' needs the shared layout in Native');
  assert.ok(css.slice(start,css.indexOf('}',start)).replace(/\s/g,'').includes(property));
 }
});


test("native approved participant marks and leaf typography reach packaged CSS",async()=>{
 const {extractNativeStaticCss,files}=await harness();
 await extractNativeStaticCss([{path:resolve('src/publicLedgerWorkspaceLayer.mjs')}],'fixture-assets');
 const css=files.get(join('fixture-assets','native-layers.css'));
 const prefix='html.design-coherence-v1.ledger-workspace-v1 body #app .expense-step-modal[data-expense-step="participants"] ';
 for(const [selector,properties] of [
  ['.expense-participant-row-check',['width:24px!important','border-radius:6px!important','background:transparent!important']],
  ['.expense-participant-add-launch strong',['font-size:.875rem!important']],
  ['.expense-participant-add-launch small',['font-size:.8125rem!important']],
  ['.expense-select-all-compact>span:not([aria-hidden="true"])',['color:var(--ledger-ink)!important']]
 ]){
  const start=css.lastIndexOf(prefix+selector+' {');assert.ok(start>=0,selector+' must be packaged');
  const rule=css.slice(start,css.indexOf('}',start)).replace(/\s/g,'');
  for(const property of properties)assert.ok(rule.includes(property),selector+': '+property);
 }
});

test("native clickable progress bars keep44px targets and visible keyboard focus",async()=>{
 const {extractNativeStaticCss,files}=await harness();
 await extractNativeStaticCss([{path:resolve('src/publicLedgerWorkspaceLayer.mjs')}],'fixture-assets');
 const raw=files.get(join('fixture-assets','native-layers.css'));
 assert.ok(raw.includes('.expense-flow-progress .expense-progress-step-button {'),'button remains a descendant of the existing progress list');
 const css=raw.replace(/\s/g,'');
 assert.ok(css.includes('height:44px!important;min-height:44px!important'));
 assert.ok(css.includes('.expense-progress-step-button:focus-visible{outline:2pxsolidvar(--ledger-brand)!important'));
 assert.ok(css.includes('.expense-flow-progressli{overflow:visible!important'));
});

test("native FX presentation includes scalable controls, optional details and visible provider credit",async()=>{
 const {extractNativeStaticCss,files}=await harness();await extractNativeStaticCss([{path:resolve('src/publicLedgerWorkspaceLayer.mjs')}],'fixture-assets');const css=files.get(join('fixture-assets','native-layers.css'));
 assert.match(css,/\.expense-fx-rate-field input\s*\{[^}]*font-size:\s*1\.25rem/);
 assert.match(css,/\.expense-fx-preview-value\s*\{[^}]*font-size:\s*1\.375rem/);
 assert.match(css,/\.expense-fx-details summary\s*\{[^}]*min-height:\s*44px/);
 assert.match(css,/\.expense-fx-fields:has\(\[data-fx-provider="open-access"\]\)>\.expense-fx-credit\s*\{display:flex!important/);
 assert.match(css,/\.expense-step-modal:not\(\[data-expense-step="amount"\]\) \.expense-source-currency-field/);
 const sw=await readFile('sw.js','utf8');assert.equal(sw.split('"/src/ui/expenseFxPresentation.mjs"').length-1,2,'both offline module lists include the extracted FX view');
});

test("native final review keeps responsive attachment controls and isolated FX numbers",async()=>{
 const {extractNativeStaticCss,files}=await harness();await extractNativeStaticCss([{path:resolve('src/publicLedgerWorkspaceLayer.mjs')}],'fixture-assets');const css=files.get(join('fixture-assets','native-layers.css'));
 assert.match(css,/\.expense-step-modal\[data-expense-step="review"\] \.expense-attachment-control\s*\{[^}]*grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,10rem\),1fr\)\)/);
 assert.match(css,/\.expense-review-fx-amount bdi\s*\{unicode-bidi:isolate!important/);
 assert.match(css,/\.expense-review-fx-details summary\s*\{[^}]*min-height:44px/);
 assert.match(css,/\.expense-review-fx-credit a\s*\{[^}]*min-height:44px/);
});
