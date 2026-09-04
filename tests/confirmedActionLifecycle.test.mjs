import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { saveFailureMessage } from "../src/domain/userNoticePolicy.mjs";

const source = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
}
const confirmation = section("async function confirmImportantAction()", "async function executeImportantAction(");
const back = section("function handleBrowserHistoryBack(event)", "function hasIndependentHistoryDialog()");
const restore = section("function restoreHistoryView(view)", "function effectiveScreenForHistory()");
const helperStart = source.indexOf("function rememberConfirmedEventDialog(");
const helper = helperStart < 0 ? "" : section("function rememberConfirmedEventDialog(", "function handleBrowserHistoryBack(event)");

function lifecycle({ action = async (ctx) => { ctx.eventDialog = null; } } = {}) {
  const original = { kind: "note-editor", eventId: "event-a", noteId: "note-a", bodyDraft: "Before" };
  let rewinds = 0;
  let replacements = 0;
  const ctx = vm.createContext({
    state: { currentParticipantId: "account-a" }, screen: { name: "event-notes", eventId: "event-a" },
    eventDialog: original, importantActionDialog: { kind: "delete-event-note", payload: { eventId: "event-a", noteId: "note-a" } },
    importantActionReturnFocus: null, pendingImportantActionReturnFocus: null,
    pendingConfirmedEventDialog: null, expenseDraft: null, newEventDraft: null,
    joinEventDraft: null, groupDraft: null, editingGroupDraft: null, mergeParticipantsDraft: null,
    eventStatusMenu: null, settlementCelebration: null, settlementCloseConfirmation: null,
    dialogReturnFocus: null, pendingDialogReturnFocus: null, dialogReturnScrollY: 0, pendingDialogReturnScrollY: 0,
    pendingSettingsReturnFocusSection: "", appHistoryDepth: 3, lastNavigationViewKey: "", restoringBrowserHistory: false,
    APP_HISTORY_STATE_KEY: "qa-history", NEW_EVENT_FLOW_SCREENS: new Set(),
    document: { body: { classList: { remove() {} } } },
    app: { querySelector: () => null },
    window: { history: { back() { rewinds++; } }, setTimeout() {}, scrollTo() {} },
    requestAnimationFrame() {}, hasIndependentHistoryDialog: () => false,
    cloneNavigationValue: (value) => value == null ? null : structuredClone(value),
    render() {}, clearDialogBackgroundInert() {}, activateDialog() {}, deactivateDialog() {},
    restoreActionFocus() {}, restorePendingDialogReturnFocus() {}, historyEventDialogFocusSelector: () => "",
    navigationViewKey: () => "qa-view", replaceBrowserHistoryState() { replacements++; },
    emitOperationFailure() {}, schedulePendingMutationRecovery() {}, console: { error() {} },
    executeImportantAction: () => action(ctx)
  });
  vm.runInContext(helper + restore + back + confirmation, ctx);
  const restored = { screen: structuredClone(ctx.screen), eventDialog: structuredClone(original) };
  return { ctx, original, confirm: () => ctx.confirmImportantAction(),
    pop: (view = restored) => ctx.handleBrowserHistoryBack({ state: { "qa-history": true, depth: 2, view } }),
    rewinds: () => rewinds, replacements: () => replacements };
}

test("confirmed note deletion stays closed after the real popstate handler restores history", async () => {
  const h = lifecycle();
  await h.confirm();
  assert.equal(h.ctx.eventDialog, null);
  h.pop();
  assert.equal(h.ctx.eventDialog, null, "history must not resurrect the deleted note editor");
  assert.equal(h.replacements(), 1, "the restored entry must also be corrected");
});

test("a failed confirmed action retains the latest error instead of its stale history draft", async () => {
  const h = lifecycle({ action: async (ctx) => { ctx.eventDialog = { ...ctx.eventDialog, error: "Retry safely" }; } });
  await h.confirm();
  h.pop();
  assert.equal(h.ctx.eventDialog.error, "Retry safely");
  assert.equal(h.ctx.eventDialog.bodyDraft, "Before");
});

test("a late confirmation cannot rewind the next account's navigation", async () => {
  const h = lifecycle({ action: async (ctx) => {
    ctx.state = { currentParticipantId: "account-b" };
    ctx.screen = { name: "home" };
    ctx.eventDialog = { kind: "settings", eventId: "event-b" };
  } });
  await h.confirm();
  assert.equal(h.rewinds(), 0);
  assert.equal(h.ctx.eventDialog.eventId, "event-b");
});

test("completion does not navigate backwards after the user leaves the action screen", async () => {
  const h = lifecycle({ action: async (ctx) => { ctx.screen = { name: "home" }; ctx.eventDialog = null; } });
  await h.confirm();
  assert.equal(h.rewinds(), 0);
  assert.equal(h.ctx.screen.name, "home");
});

test("the pending confirmation result is not applied to another event's editor", async () => {
  const h = lifecycle();
  await h.confirm();
  h.pop({screen:{name:"event-notes",eventId:"event-b"},eventDialog:{kind:"note-editor",eventId:"event-b",noteId:"other"}});
  assert.equal(h.ctx.eventDialog.noteId, "other");
});

test("a pending deletion cannot close a different note in the same event", async () => {
  const h = lifecycle();
  await h.confirm();
  h.pop({screen:{name:"event-notes",eventId:"event-a"},eventDialog:{kind:"note-editor",eventId:"event-a",noteId:"other"}});
  assert.equal(h.ctx.eventDialog?.noteId, "other");
  assert.equal(h.replacements(), 0);
});

test("a late deletion confirmation cannot rewind a different editor on the same screen", async () => {
  const nextDialog = {kind:"note-editor",eventId:"event-a",noteId:"other",bodyDraft:"Keep this draft"};
  const h = lifecycle({action:async (ctx) => {ctx.eventDialog = nextDialog;}});
  await h.confirm();
  assert.equal(h.rewinds(), 0);
  assert.equal(h.ctx.eventDialog, nextDialog);
});

test("a confirmation result cannot overwrite a same-event editor after an account switch", async () => {
  const h = lifecycle({action: async (ctx) => { ctx.eventDialog = {...ctx.eventDialog,error:"Old account error"}; }});
  await h.confirm();
  h.ctx.state = {currentParticipantId:"account-b"};
  h.pop();
  assert.equal(h.ctx.eventDialog.error, undefined);
});

const expenseDelete = section("async function deleteExpense(eventId, expenseId)", "function prepareSettlement(eventId)");
const checkpoints = section("function stateSaveCheckpoint(", "function recordEventActivity(");
function expenseDeletionHarness() {
  const initial = {currentParticipantId:"account-a",events:[{id:"event-a",expenses:[{id:"expense-a"}],transfers:[]}]};
  let finishSave;
  let revision = 1;
  let reloads = 0;
  const request = new Promise(resolve => {finishSave = resolve;});
  const ctx = vm.createContext({
    state:initial,expenseDeleteRequests:new Set(), notice:"New account notice", saveFailureMessage,
    getEvent:(id)=>ctx.state.events.find(event=>event.id===id),canCurrentParticipantEdit:()=>true,
    removeExpense:(state)=>({...state,events:[{...state.events[0],expenses:[]}]}),
    recordEventActivity() {},reconcileEventTransfers() {},render() {},
    persistState:()=>request,loadState:()=>{reloads++;return initial;},
    sharedStateSaveRevision:()=>revision
  });
  vm.runInContext(checkpoints + expenseDelete,ctx);
  const deletion = ctx.deleteExpense("event-a","expense-a");
  return {ctx,initial,reloads:()=>reloads,newRevision:()=>{revision++;},
    finish:async(result)=>{finishSave(result);await deletion;}};
}

test("a late failed expense deletion cannot replace the newly active account state", async () => {
  const h = expenseDeletionHarness();
  const replacement = {currentParticipantId:"account-b",events:[]};
  h.ctx.state = replacement;
  await h.finish({ok:false});
  assert.equal(h.ctx.state,replacement);
  assert.equal(h.ctx.notice,"New account notice");
  assert.equal(h.ctx.expenseDeleteRequests.size,0);
  assert.equal(h.reloads(),0);
});

test("a late failed expense deletion cannot undo a newer save in the same account", async () => {
  const h = expenseDeletionHarness();
  const newer = {...h.ctx.state,profile:{displayName:"Newer edit"}};
  h.ctx.state = newer;
  h.newRevision();
  await h.finish({ok:false});
  assert.equal(h.ctx.state,newer);
  assert.equal(h.reloads(),0);
});

test("a durably queued expense deletion is not rolled back as a hard failure", async () => {
  const h = expenseDeletionHarness();
  await h.finish({ok:false,pending:true,mode:"queued"});
  assert.equal(h.ctx.state.events[0].expenses.length,0);
  assert.equal(h.reloads(),0);
});

test("a current hard expense deletion failure still restores the durable state", async () => {
  const h = expenseDeletionHarness();
  await h.finish({ok:false});
  assert.equal(h.ctx.state,h.initial);
  assert.equal(h.reloads(),1);
  assert.match(h.ctx.notice,/המחיקה לא נשמרה/);
  assert.equal(h.ctx.expenseDeleteRequests.size,0);
});
