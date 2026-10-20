import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { currencySearchText } from "../src/domain/currencies.mjs";
import { renderEventDetailsNameFieldView } from "../src/ui/eventDetailsNameField.mjs";

test("event name keeps its optional label, linked help and safe draft attributes", () => {
  const html = renderEventDetailsNameFieldView({ name: '\"><img src=x> & \'', placeholder: '\" onfocus=bad <example>' });
  assert.match(html, /name="eventName"/);
  assert.match(html, /data-action="new-event-name"/);
  assert.match(html, /value="&quot;&gt;&lt;img src=x&gt; &amp; &#039;"/);
  assert.match(html, /placeholder="&quot; onfocus=bad &lt;example&gt;"/);
  assert.doesNotMatch(html, /<img|<example|" onfocus="/);
  assert.match(html, /aria-labelledby="new-event-name-label"/);
  assert.match(html, /id="new-event-name-label">שם האירוע \(לא חובה\)</);
  assert.match(html, /aria-describedby="new-event-name-hint"/);
  assert.match(html, /id="new-event-name-hint"[^>]*>אפשר להשאיר ריק ולקבל שם אוטומטי\.</);
});

test("details adapter renders both event types without changing name, currency or draft", async () => {
  const source = await readFile("src/app.mjs", "utf8");
  const start = source.indexOf("function renderNewEvent() {");
  const end = source.indexOf("function syncNewEventParticipantControls()", start);
  assert.ok(start >= 0 && end > start);
  for (const eventType of ["standard", "trip"]) {
    for (const name of ["", "ערב חברים & משפחה"]) {
      const draft = { eventType, name, currency: "USD", participantIds: ["owner"] };
      const before = JSON.stringify(draft);
      const calls = [];
      const config = { id: eventType, label: "סוג אירוע", creationTitle: "אירוע חדש", namePlaceholder: eventType === "trip" ? "טיול משפחתי" : "" };
      const context = vm.createContext({
        newEventDraft: draft, ensureNewEventDraft() {}, eventTypeConfig: () => config,
        escapeHtml: value => String(value), escapeAttribute: value => String(value),
        renderAppBackButton: () => "", renderNotice: () => "", renderEventCreationProgress: () => "",
        renderEventDetailsNameFieldView, EVENT_NAME_PLACEHOLDER: "אוכל / מונית / קניות…",
        currencySearchText,
        currencySelectLabel: value => `label-${value}`, currencyOptions: () => [{ id: "ILS" }, { id: "USD" }],
        renderNewEventInlinePicker(options) { calls.push(options); return `<div data-picker-action="${options.action}">${options.selectedValue}</div>`; }
      });
      vm.runInContext(source.slice(start, end), context);
      const html = context.renderNewEvent();
      assert.equal(JSON.stringify(draft), before);
      assert.match(html, /data-event-creation-step="details"/);
      assert.match(html, /data-action="new-event-name"/);
      assert.match(html, /data-action="open-new-event-settlement"/);
      assert.doesNotMatch(html, /data-action="create-event"/);
      assert.ok(html.indexOf('data-action="new-event-name"') < html.indexOf('data-picker-action="new-event-currency-choice"'));
      assert.ok(html.indexOf('data-picker-action="new-event-currency-choice"') < html.indexOf('data-action="open-new-event-settlement"'));
      assert.equal(calls[0].selectedValue, "USD");
      assert.equal(calls[0].searchable, true);
      assert.deepEqual(JSON.parse(JSON.stringify(calls[0].options)), [{ value: "ILS", label: "label-ILS", searchText: currencySearchText("ILS") }, { value: "USD", label: "label-USD", searchText: currencySearchText("USD") }]);
      assert.ok(html.includes(eventType === "trip" ? "טיול משפחתי" : "אוכל / מונית / קניות…"));
    }
  }
});

test("the extracted name field is available in the offline application cache", async () => {
  const worker = await readFile("sw.js", "utf8");
  const cacheFiles = worker.slice(worker.indexOf("const CACHE_FILES = ["), worker.indexOf("];", worker.indexOf("const CACHE_FILES = [")));
  assert.match(cacheFiles, /"\/src\/ui\/eventDetailsNameField\.mjs"/);
});
