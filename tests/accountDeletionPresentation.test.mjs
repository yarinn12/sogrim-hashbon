import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { runInNewContext } from "node:vm";
const source = readFileSync(process.env.ACCOUNT_DELETION_TEST_ACCOUNT || "src/publicAccountAuthLayer.mjs", "utf8");
const uiPath = new URL("../src/ui/accountDeletionPresentation.mjs", import.meta.url);
const view = existsSync(uiPath) ? await import(uiPath) : null;
function renderFunction() {
  const start = source.indexOf("function renderAccountDeletionDialog(");
  assert.ok(start >= 0);
  const end = source.indexOf("\nfunction closeAccountDeletionDialog", start);
  return source.slice(start, end);
}
function render() {
  const calls = [], nodes = [];
  class Element {
    constructor(name) {
      this.name = name;
    }
    focus(options) {
      calls.push({ focus: this.name, options });
    }
  }
  const opener = new Element("opener"), active = new Element("unrelated-main"), heading = new Element("dialog"), checkbox = new Element("checkbox"), node = { dataset: {}, innerHTML: "", querySelector: (s) => s === ".account-delete-dialog" ? heading : checkbox };
  const ctx = { document: { activeElement: active, createElement: () => node, body: { append: (n) => nodes.push(n) }, querySelector: () => ({ setAttribute: (...a) => calls.push(a) }), documentElement: { classList: { add: (...a) => calls.push(a) } } }, HTMLElement: Element, accountDeleteReturnFocus: null, closeAccountDeletionDialog: () => {
  }, pushAccountDeletionHistoryState: () => calls.push("history"), renderAccountDeletionConfirmationView: view?.renderAccountDeletionConfirmationView };
  const resultContext = { ...ctx, opener };
  runInNewContext(renderFunction() + ";renderAccountDeletionDialog(opener)", resultContext);
  return { html: node.innerHTML, calls, nodes, ctx: resultContext, opener, active };
}
test("account deletion uses one direct heading, plain consent and the approved public explanation", () => {
  const { html } = render();
  assert.ok(html.includes('<h2 id="account-delete-title">למחוק את החשבון?</h2>'));
  assert.ok(html.includes("החשבון והמידע האישי שלך יימחקו לצמיתות."));
  assert.ok(html.includes("ההוצאות המשותפות יישמרו אצל שאר המשתתפים בשם ״משתמש שנמחק״."));
  assert.ok(html.includes("אני מבין שאי אפשר לבטל את המחיקה."));
  assert.equal([...html.matchAll(/<p>/g)].length, 2);
  assert.doesNotMatch(html, /eyebrow|חשבון ופרטיות/);
  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="account-delete-title" aria-describedby="account-delete-description" tabindex="-1"/);
  assert.match(html, /data-account-delete-confirmation/);
  assert.match(html, /data-account-delete-error hidden/);
  assert.match(html, /class="primary-button"[^>]*delete-account-cancel">ביטול/);
  assert.match(html, /class="secondary-button account-delete-confirm"[^>]*delete-account-confirm" disabled>מחק את החשבון/);
  assert.equal([...html.matchAll(/<button/g)].length, 2);
});
test("deletion dialog remembers the explicit opener even when WebKit left focus on main", () => {
  const h = render();
  assert.equal(h.ctx.accountDeleteReturnFocus, h.opener);
  assert.notEqual(h.ctx.accountDeleteReturnFocus, h.active);
});
test("nested mouse clicks pass the actual delete opener rather than relying on browser focus", () => {
  const start = source.indexOf('if (action === "delete-account-open") {'), end = source.indexOf('\n  if (action === "delete-account-cancel")', start), calls = [], button = { kind: "button" };
  assert.ok(start >= 0 && end > start);
  const event = { target: { closest: (s) => {
    assert.equal(s, "[data-account-action]");
    return button;
  } } };
  runInNewContext('function run(event){const action="delete-account-open";' + source.slice(start, end) + "};run(event)", { event, renderAccountDeletionDialog: (value) => calls.push(value) });
  assert.deepEqual(calls, [button]);
});
test("initial deletion focus announces the dialog without jumping past the explanation", () => {
  const h = render(), focus = h.calls.filter((c) => c?.focus);
  assert.ok(focus.length > 0);
  for (const c of focus) {
    assert.equal(c.focus, "dialog");
    assert.equal(c.options.preventScroll, true);
  }
});
test("the pure deletion presentation ships in both offline inventories", () => {
  assert.ok(view?.renderAccountDeletionConfirmationView, "missing pure deletion view");
  const sw = readFileSync("sw.js", "utf8");
  assert.equal(sw.split('"/src/ui/accountDeletionPresentation.mjs"').length - 1, 2);
  const html = view.renderAccountDeletionConfirmationView();
  assert.doesNotMatch(html, /<script|onclick=|fetch\(|localStorage|sessionStorage/);
});
