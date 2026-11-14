import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {runInNewContext} from "node:vm";
import {buildExpenseParticipantShares} from "../src/domain/settlement.mjs";

test("long expense ledgers defer off-screen card rendering without changing the list", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const styles = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");

  assert.match(app, /event\.expenses\.length >= 50 \? " is-long-expense-ledger"/);
  assert.match(styles, /\.is-long-expense-ledger \.expense-row \{[\s\S]*?content-visibility: auto/);
  assert.match(styles, /contain-intrinsic-block-size: auto 112px/);
});

test("expense collections expose list semantics and an accessible heading", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /id="event-expenses" aria-labelledby="event-expenses-title"/);
  assert.match(app, /<h2 id="event-expenses-title">הוצאות<\/h2>/);
  assert.match(app, /expense-day-group[^>]*role="list"/);
  assert.match(app, /data-expense-id="\$\{escapeAttribute\(expense\.id\)\}"[^>]*role="listitem"/);
});

test("large event rows defer participant DOM until the row is expanded", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const expenseRow = app.slice(
    app.indexOf("function renderExpenseRow(event, expense)"),
    app.indexOf("function hydrateExpenseParticipants(details, event, expense)")
  );
  const hydration = app.slice(
    app.indexOf("function hydrateExpenseParticipants(details, event, expense)"),
    app.indexOf("function renderExpenseParticipant(")
  );
  const toggleHandler = app.slice(
    app.indexOf('if (action === "toggle-expense-participants")'),
    app.indexOf('if (action === "expense-step-next")')
  );

  assert.match(expenseRow, /class="expense-participants-list"[\s\S]*?><\/div>/);
  assert.doesNotMatch(expenseRow, /renderExpenseParticipant\(/);
  assert.match(hydration, /details\.dataset\.participantsHydrated === "true"/);
  assert.doesNotMatch(expenseRow, /buildExpenseParticipantShares\(/);
  const people = [{id:"one"},{id:"two"},{id:"three"}];
  const event = {id:"large-event",participantIds:people.map(p=>p.id)};
  const expense = {id:"dinner",total:10000,payers:[{participantId:"one",amount:10000}],sharedByParticipantIds:["one","two","three","two"]};
  let computations=0, writes=0, markup="";
  const rendered=[];
  const list={set innerHTML(value){writes++;markup=value;}};
  const details={dataset:{},querySelector:()=>list};
  const hydrate=runInNewContext('('+hydration+')', {
    eventParticipants:()=>people,
    buildExpenseParticipantShares:(participants,item)=>{computations++;return buildExpenseParticipantShares(participants,item);},
    renderExpenseParticipant:(origin,id,share)=>{assert.equal(origin,event);rendered.push({id,share});return `<participant>${id}:${share}</participant>`;}
  });
  assert.equal(computations,0);
  assert.equal(writes,0);
  hydrate(details,event,expense);
  assert.equal(computations,1,"Allocate once when expanding, not once per participant");
  assert.equal(writes,1);
  assert.equal(details.dataset.participantsHydrated,"true");
  assert.deepEqual(rendered,[{id:"one",share:3334},{id:"two",share:3333},{id:"three",share:3333}]);
  assert.equal(markup,'<participant>one:3334</participant><participant>two:3333</participant><participant>three:3333</participant>');
  hydrate(details,event,expense);
  assert.equal(computations,1,"An already hydrated disclosure must not recompute shares");
  assert.equal(writes,1,"An already hydrated disclosure must not duplicate participant DOM");
  assert.match(toggleHandler, /if \(!details\.open\)[\s\S]*?hydrateExpenseParticipants/);
});
