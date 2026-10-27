import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createFeedbackDraft, feedbackRequestIsCurrent } from "../src/domain/feedbackDraft.mjs";
import { renderFeedbackPageView, renderFeedbackFormView, renderFeedbackSuccessView } from "../src/ui/feedbackPagePresentation.mjs";
const app = readFileSync(process.env.FEEDBACK_TEST_APP || "src/app.mjs", "utf8"), auth = readFileSync(process.env.FEEDBACK_TEST_ACCOUNT || "src/publicAccountAuthLayer.mjs", "utf8");
function fn(source, name) {
  const a = source.indexOf("function " + name + "(");
  assert.ok(a >= 0, name);
  const b = source.slice(a + 1).search(/\n(?:async )?function /);
  return source.slice(a, a + 1 + b);
}
function submitSource() {
  const a = auth.indexOf("async function handleAccountFeedbackSubmit("), b = auth.indexOf("\nasync function accountFeedbackContext()", a);
  return auth.slice(a, b);
}
function harness() {
  const draft = createFeedbackDraft("a"), calls = [], state = { draft, owner: "a", page: true };
  let resolve, reject;
  const pending = new Promise((r, j) => {
    resolve = r;
    reject = j;
  });
  const textarea = { focus() {
    calls.push("focus");
  }, setAttribute() {
  }, removeAttribute() {
  } }, error = { hidden: true, textContent: "" }, form = { values: { category: "idea", message: "מסר סינתטי לבדיקה ללא פרטים אישיים" }, querySelector: (s) => s.includes("error") ? error : textarea };
  const ctx = { accountFeedbackBusy: false, accountFeedbackDraft: draft, accountFeedbackRequestSequence: 0, accountSession: { user: { id: "a" } }, runtimeConfig: { storage: { url: "https://mock.invalid", account: { userId: "a", accessToken: "synthetic" } } }, FormData: class {
    constructor(f) {
      this.f = f;
    }
    get(k) {
      return this.f.values[k];
    }
  }, ensureAccountFeedbackDraft: () => state.draft, rememberAccountFeedbackDraft: (f) => {
    state.draft.category = f.values.category;
    state.draft.message = f.values.message;
    return state.draft;
  }, feedbackRequestIsCurrent, accountFeedbackContext: async () => ({ platform: "web" }), setAccountFeedbackBusy: (v) => {
    ctx.accountFeedbackBusy = v;
  }, updateAccountFeedbackPage: () => {
  }, renderAccountFeedbackSuccess: () => {
    calls.push("success");
    if (state.page) calls.push("paint");
    state.draft.status = "success";
  }, submitAppFeedback: async (config, body) => {
    calls.push({ config, body });
    return pending;
  } };
  runInNewContext(submitSource() + ";globalThis.run=handleAccountFeedbackSubmit", ctx);
  return { ctx, state, calls, form, error, resolve, reject, start: () => ctx.run({ preventDefault() {
  }, currentTarget: form }) };
}
test("feedback is a regular labelled page with the shared back control slot", () => {
  const html = renderFeedbackPageView({ backButton: '<button data-action="go-back">חזרה</button>' });
  assert.match(html, /feedback-page-screen/);
  assert.match(html, /<h1 id="account-feedback-title">שליחת משוב/);
  assert.match(html, /data-action="go-back"/);
  assert.match(html, /data-account-feedback-page/);
  assert.doesNotMatch(html, /aria-modal|role="dialog"|backdrop|feedback-cancel/);
});
test("feedback choices retain server values with the approved public copy", () => {
  const html = renderFeedbackFormView();
  assert.deepEqual([...html.matchAll(/name="category" value="([^"]+)"/g)].map((x) => x[1]), ["bug", "clarity", "idea"]);
  for (const t of ["תקלה", "לא ברור", "הצעה", "פרטי המשוב", "כתבו כאן את הפרטים", "פרטי הגרסה מצורפים אוטומטית"]) assert.ok(html.includes(t));
  assert.doesNotMatch(html, /משוב לבודקים|מה תרצה לספר|עוזרים לנו להשתפר/);
});
test("feedback keeps minimum and maximum lengths and one send action", () => {
  const html = renderFeedbackFormView();
  assert.match(html, /minlength="10"/);
  assert.match(html, /maxlength="1200"/);
  assert.match(html, /data-account-feedback-form novalidate/);
  assert.equal([...html.matchAll(/<button/g)].length, 1);
  assert.match(html, /type="submit">שליחה/);
});
test("feedback escapes message and error text without allowing markup injection", () => {
  const html = renderFeedbackFormView({ category: "idea", message: "</textarea><img src=x>", error: "<script>bad<\/script>" });
  assert.doesNotMatch(html, /<img|<script>/);
  assert.match(html, /&lt;\/textarea&gt;/);
  assert.match(html, /value="idea" checked/);
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /id="account-feedback-error" role="alert"/);
});
test("busy form disables just its five controls and preserves draft", () => {
  const html = renderFeedbackFormView({ busy: true, category: "clarity", message: "טיוטה" });
  assert.equal([...html.matchAll(/ disabled/g)].length, 5);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, />טיוטה<\/textarea>/);
  assert.doesNotMatch(html, /inert|go-back|product-app-nav/);
});
test("signed-out feedback deep links do not expose a submission form", () => {
  const html = renderFeedbackFormView({ signedIn: false });
  assert.match(html, /יש להתחבר/);
  assert.doesNotMatch(html, /<form|type="submit"/);
});
test("success retains the existing receipt copy and done action", () => {
  const html = renderFeedbackSuccessView();
  assert.match(html, /role="status"/);
  assert.match(html, /אין צורך לשלוח אותה שוב/);
  assert.match(html, /data-account-action="feedback-done"/);
});
test("feedback drafts are independent across account owners", () => {
  const a = createFeedbackDraft("a"), b = createFeedbackDraft("b");
  a.message = "private a";
  assert.equal(b.message, "");
  assert.equal(b.ownerId, "b");
  assert.equal(a.submissionId, 0);
});
test("only the matching account draft and submission can receive a late result", () => {
  const d = createFeedbackDraft("a");
  d.submissionId = 4;
  const r = { draft: d, ownerId: "a", id: 4 };
  assert.equal(feedbackRequestIsCurrent(d, r, "a"), true);
  assert.equal(feedbackRequestIsCurrent(d, r, "b"), false);
  assert.equal(feedbackRequestIsCurrent(createFeedbackDraft("a"), r, "a"), false);
  assert.equal(feedbackRequestIsCurrent(d, { ...r, id: 3 }, "a"), false);
  assert.equal(feedbackRequestIsCurrent(d, { ...r, ownerId: "" }, ""), false);
});
test("feedback launch uses the real route and restores its non-sensitive history marker", () => {
  const code = fn(app, "initialScreenFromLaunchAction");
  for (const [search, restored, want] of [["?action=feedback", false, "feedback"], ["", true, "feedback"], ["?action=profile", false, "profile"], ["", false, "home"]]) {
    const w = { location: { href: "http://127.0.0.1/" + search }, sessionStorage: { getItem: () => null, removeItem() {
    } }, history: { state: restored ? { settleFriendsAppHistory: true, view: { screen: { name: "feedback" } } } : null, replaceState() {
    } } };
    assert.equal(runInNewContext(code + ";initialScreenFromLaunchAction()", { window: w, URL, Date, PROFILE_IMAGE_PICKER_RETURN_STORAGE_KEY: "picker", APP_HISTORY_STATE_KEY: "settleFriendsAppHistory" }).name, want);
  }
});
test("feedback routing owns background renders and ordinary back navigation", () => {
  assert.match(app, /screen\.name === "feedback"[\s\S]*?renderFeedbackPageView/);
  assert.match(fn(app, "goBackInApp"), /screen\.name === "feedback"[\s\S]*?screen = \{ name: "profile" \}/);
  assert.match(app, /"sogrim:feedback-open"/);
  assert.doesNotMatch(fn(app, "currentHistoryView"), /feedbackDraft|feedbackMessage|accountFeedback/);
});
test("an account switch during submission cannot paint success for the new owner", async () => {
  const h = harness(), p = h.start();
  await new Promise((r) => setImmediate(r));
  h.ctx.accountSession = { user: { id: "b" } };
  h.ctx.accountFeedbackDraft = h.state.draft = createFeedbackDraft("b");
  h.resolve();
  await p;
  assert.doesNotMatch(JSON.stringify(h.calls), /success|paint/);
  assert.equal(h.state.draft.ownerId, "b");
  assert.equal(h.state.draft.status, "editing");
});
test("an account switch during diagnostics never submits under the next account", async () => {
  const h = harness();
  let done;
  h.ctx.accountFeedbackContext = () => new Promise((r) => done = r);
  const p = h.start();
  h.ctx.accountSession = { user: { id: "b" } };
  h.ctx.accountFeedbackDraft = h.state.draft = createFeedbackDraft("b");
  done({ platform: "web" });
  await new Promise((r) => setImmediate(r));
  h.resolve();
  await p;
  assert.equal(h.calls.filter((x) => typeof x === "object").length, 0);
});
test("a superseded request cannot undo a newer draft or submission", async () => {
  const h = harness(), p = h.start();
  await new Promise((r) => setImmediate(r));
  h.ctx.accountFeedbackDraft = h.state.draft = createFeedbackDraft("a");
  h.state.draft.message = "newer draft";
  h.ctx.accountFeedbackBusy = true;
  h.reject(Error("late"));
  await p;
  assert.equal(h.state.draft.message, "newer draft");
  assert.equal(h.state.draft.error, "");
  assert.equal(h.ctx.accountFeedbackBusy, true);
});
test("submission uses a snapshot of the initiating credentials", async () => {
  const h = harness(), p = h.start();
  await new Promise((r) => setImmediate(r));
  h.ctx.runtimeConfig.storage.account.accessToken = "changed";
  const sent = h.calls.find((x) => typeof x === "object");
  assert.equal(sent.config.storage.account.accessToken, "synthetic");
  h.resolve();
  await p;
});
test("feedback presentation and draft rules remain in both offline inventories", () => {
  const sw = readFileSync("sw.js", "utf8");
  for (const file of ["/src/ui/feedbackPagePresentation.mjs", "/src/domain/feedbackDraft.mjs"]) assert.equal(sw.split('"' + file + '"').length - 1, 2);
});
test("feedback uses the Profile navigation destination", () => {
  const source = readFileSync(process.env.FEEDBACK_TEST_BRAND || "src/publicBrandLayer.mjs", "utf8"), code = fn(source, "detectBrandScreenKind");
  assert.equal(runInNewContext(code + ";detectBrandScreenKind(screen)", { screen: { dataset: { screenKind: "feedback" }, matches: () => false, querySelector: () => null } }), "profile");
});
test("a pending feedback submission rejects a duplicate send", async () => {
  const h = harness(), first = h.start();
  await new Promise((r) => setImmediate(r));
  await h.start();
  assert.equal(h.calls.filter((x) => typeof x === "object").length, 1);
  h.resolve();
  await first;
});
test("launch actions execute against the actual initializer and picker-key declaration order", () => {
  const key = app.match(/const PROFILE_IMAGE_PICKER_RETURN_STORAGE_KEY = [^;]+;/), initial = app.match(/let screen = initialScreenFromLaunchAction\(\);/);
  assert.ok(key && initial);
  const declarations = [key, initial].sort((a, b) => a.index - b.index).map((x) => x[0]).join("\n");
  for (const [action, want] of [["profile", "profile"], ["new-event", "new-event-type"], ["feedback", "feedback"]]) {
    const window = { location: { href: "http://127.0.0.1/?action=" + action }, sessionStorage: { getItem: () => null, removeItem() {
    } }, history: { state: null, replaceState() {
    } } };
    assert.equal(runInNewContext(fn(app, "initialScreenFromLaunchAction") + "\n" + declarations + ";screen.name", { window, URL, Date, APP_HISTORY_STATE_KEY: "settleFriendsAppHistory" }), want);
  }
});

test('feedback return focus waits for the mounted opener and respects a newer field focus',()=>{
 const code=fn(app,'restoreFeedbackEntryFocus'),document={activeElement:null},account={open:false,querySelector:()=>null},ctx={feedbackReturnFocusPending:true,screen:{name:'profile'},app:{querySelector:()=>account},document};
 runInNewContext(code+';restoreFeedbackEntryFocus()',ctx);assert.equal(ctx.feedbackReturnFocusPending,true);
 const target={focus(){document.activeElement=target}};account.querySelector=()=>target;runInNewContext(code+';restoreFeedbackEntryFocus()',ctx);assert.equal(account.open,true);assert.equal(document.activeElement,target);assert.equal(ctx.feedbackReturnFocusPending,false);
 ctx.feedbackReturnFocusPending=true;const field={matches:s=>s==='input, textarea, select, button'};document.activeElement=field;runInNewContext(code+';restoreFeedbackEntryFocus()',ctx);assert.equal(document.activeElement,field);assert.equal(ctx.feedbackReturnFocusPending,false);
 ctx.feedbackReturnFocusPending=true;ctx.screen={name:'home'};runInNewContext(code+';restoreFeedbackEntryFocus()',ctx);assert.equal(ctx.feedbackReturnFocusPending,false);
});
