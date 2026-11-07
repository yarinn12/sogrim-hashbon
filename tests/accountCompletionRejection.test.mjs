import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readSource} from "./helpers/readSource.mjs";
import {setFriendUsername} from "../src/data/friendsStore.mjs";
import {accountAuthErrorMessage, accountProfileFromUser, accountWorkspaceFromUser, normalizeAccountEmail} from "../src/data/accountAuth.mjs";
import {normalizeUsername, usernameValidationMessage} from "../src/domain/usernames.mjs";
import {isFullProfileName, normalizeProfileName} from "../src/domain/userProfile.mjs";
import {renderAccountCompletionView} from "../src/ui/accountCompletionPresentation.mjs";

const source = await readSource(process.env.ACCOUNT_COMPLETION_TEST_SOURCE || "src/publicAccountAuthLayer.mjs", "utf8");
function declaration(signature) {
  const start = source.indexOf(signature);
  const end = source.indexOf("\n}\n", start) + 2;
  assert.ok(start >= 0 && end > start, `Missing production declaration: ${signature}`);
  return source.slice(start, end);
}
const controller = [
  declaration("function accountProfileNeedsCompletion("),
  declaration("function accountFormValidationError("),
  declaration("async function handleAccountSubmit(")
].join("\n");
const copy = value => JSON.parse(JSON.stringify(value));
const enteredName = "  נועם   לוי  ";
const enteredUsername = " @TaKen_Name ";

function harness({rejectUsername = false, failureMessage = "Username is already taken", loginFailure} = {}) {
  const calls = {rpc: [], metadata: [], completions: [], recoveries: [], focused: [], saved: [], workspaces: [], setup: 0, prevented: 0, failures: []};
  const session = {
    access_token: "synthetic-access-token", refresh_token: "synthetic-refresh-token",
    user: {id: "11111111-1111-4111-8111-111111111111", email: "qa@example.invalid", user_metadata: {
      full_name: "שם קודם", username: "previous_name", keep_setting: "preserved",
      account_space_id: "synthetic-workspace", account_space_key: "01234567890123456789012345678901"
    }}
  };
  const config = {storage: {mode: "supabase", url: "https://completion-fixture.supabase.co", anonKey: "synthetic-public-key", account: {userId: session.user.id, accessToken: session.access_token}}};
  const gate = {};
  let shouldReject = rejectUsername;
  const fetchImpl = async (url, options) => {
    calls.rpc.push({url, method: options.method, body: JSON.parse(options.body), authorization: options.headers.authorization});
    assert.equal(url, "https://completion-fixture.supabase.co/rest/v1/rpc/set_friend_username");
    assert.equal(options.method, "POST");
    return new Response(JSON.stringify(shouldReject
      ? {code: failureMessage === "Username is already taken" ? "23505" : "NETWORK_UNAVAILABLE", message: failureMessage}
      : {ok: true, username: JSON.parse(options.body).p_username}), {
      status: shouldReject ? failureMessage === "Username is already taken" ? 409 : 503 : 200,
      headers: {"content-type": "application/json"}
    });
  };
  const context = vm.createContext({
    authBusy: false, accountSignInPending: false, accountSession: session, runtimeConfig: config, GATE_ID: "synthetic-gate",
    FormData: class {
      constructor(form) {this.fields = form.fields;}
      get(name) {return this.fields[name] ?? null;}
    },
    document: {getElementById: () => gate},
    normalizeProfileName, isFullProfileName, normalizeUsername, usernameValidationMessage, normalizeAccountEmail,
    accountProfileFromUser, accountWorkspaceFromUser, accountAuthErrorMessage,
    setAuthBusy(value) {context.authBusy = value;},
    loadRuntimeConfig: async () => config,
    setFriendUsername: (runtime, username) => setFriendUsername(runtime, username, fetchImpl),
    async updateAccountUser(runtime, activeSession, metadata) {
      assert.equal(runtime, config);
      calls.metadata.push(copy(metadata));
      return {...activeSession, user: {...activeSession.user, user_metadata: copy(metadata)}};
    },
    saveAccountSession(value) {calls.saved.push(copy(value)); return value;},
    activateAccountWorkspace(value) {calls.workspaces.push(copy(value));},
    renderAccountNameCompletionGate(options) {
      calls.completions.push({options: copy(options), html: renderAccountCompletionView({
        ...options, hasSavedFullName: isFullProfileName(normalizeProfileName(options.displayName))
      })});
    },
    renderAccountRecoveryGate(options) {calls.recoveries.push(copy(options ?? {}));},
    async setupAccountAuth() {calls.setup++;},
    emitOperationFailure(_operation, details) {calls.failures.push({message: details.error.message, status: details.error.status, code: details.error.code});},
    focusAccountInput(target, options) {assert.equal(target, gate);calls.focused.push(copy(options));},
    signInWithPassword: async () => {throw loginFailure ?? new Error("Unexpected login request");}
  });
  vm.runInContext(controller, context);
  return {
    calls, context,
    allowUsername() {shouldReject = false;},
    async submit({mode = "complete-profile", displayName = enteredName, username = enteredUsername, email = "qa@example.invalid", password = "SyntheticPassword123"} = {}) {
      const form = {dataset: {mode}, fields: {displayName, username, email, password}, querySelector: () => ({validity: {typeMismatch: false}})};
      await context.handleAccountSubmit({currentTarget: form, preventDefault() {calls.prevented++;}});
      assert.equal(context.authBusy, false, "a completed or rejected request must release the busy state");
    }
  };
}

test("a username RPC rejection preserves the entered completion fields and displays its field error", async () => {
  const app = harness({rejectUsername: true});
  await app.submit();
  assert.deepEqual(app.calls.rpc.map(call => call.body), [{p_username: "taken_name"}]);
  assert.equal(app.calls.rpc[0].authorization, "Bearer synthetic-access-token");
  assert.deepEqual(app.calls.failures, [{message: "Username is already taken", status: 409, code: "23505"}]);
  assert.equal(app.calls.metadata.length, 0, "a rejected username must not update identity metadata");
  assert.equal(app.calls.saved.length, 0, "rejected completion must not replace the active session");
  assert.equal(app.calls.setup, 0, "rejected completion must not enter the account-loading path");
  const rejected = app.calls.completions.at(-1);
  assert.deepEqual(rejected.options, {
    displayName: enteredName, username: enteredUsername,
    error: "שם המשתמש הזה כבר תפוס. נסה שם אחר.", errorFieldName: "username"
  });
  assert.match(rejected.html, /id="account-auth-feedback"[^>]*role="alert">שם המשתמש הזה כבר תפוס/);
  assert.match(rejected.html, /name="username"[^>]*aria-invalid="true" aria-describedby="account-auth-feedback"/);
  assert.deepEqual(app.calls.focused, [{includeMobile: true, fieldName: "username"}]);
});

test("completion can retry the rejected username without losing the entered full name", async () => {
  const app = harness({rejectUsername: true});
  await app.submit();
  const preservedName = app.calls.completions.at(-1).options.displayName;
  app.allowUsername();
  await app.submit({displayName: preservedName, username: " @New_Available "});
  assert.deepEqual(app.calls.rpc.map(call => call.body), [{p_username: "taken_name"}, {p_username: "new_available"}]);
  assert.equal(app.calls.metadata.length, 1);
  assert.deepEqual(app.calls.metadata[0], {
    full_name: "נועם לוי", name: "נועם לוי", display_name: "נועם לוי", username: "new_available",
    keep_setting: "preserved", account_space_id: "synthetic-workspace", account_space_key: "01234567890123456789012345678901"
  });
  assert.equal(app.context.accountSession.user.user_metadata.full_name, "נועם לוי");
  assert.equal(app.context.accountSession.user.user_metadata.username, "new_available");
  assert.equal(app.calls.setup, 1);
  assert.deepEqual(app.calls.recoveries, [{connecting: true}]);
});

test("a transient completion failure retains form values and a visible actionable message", async () => {
  const app = harness({rejectUsername: true, failureMessage: "network failure"});
  await app.submit();
  const rejected = app.calls.completions.at(-1);
  assert.equal(rejected.options.displayName, enteredName);
  assert.equal(rejected.options.username, enteredUsername);
  assert.equal(rejected.options.error, "לא הצלחנו להגיע לשירות החשבון. כדאי לבדוק את החיבור ולנסות שוב.");
  assert.match(rejected.html, /role="alert">לא הצלחנו להגיע לשירות החשבון/);
  assert.equal(app.calls.metadata.length, 0);
  assert.equal(app.calls.setup, 0);
});

test("other auth modes still recover missing profile details from the accepted account identity", async () => {
  const app = harness({loginFailure: new Error("Account profile needs a username")});
  await app.submit({mode: "login"});
  assert.deepEqual(app.calls.completions.at(-1).options, {displayName: "שם קודם", username: "previous_name"});
  assert.equal(app.calls.rpc.length, 0);
  assert.equal(app.calls.metadata.length, 0);
  assert.equal(app.calls.setup, 0);
});
