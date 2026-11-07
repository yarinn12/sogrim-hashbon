import test from "node:test";
import assert from "node:assert/strict";
import { renderExpensePayerAmountView } from "../src/ui/expensePayerAmount.mjs";

test("payer amount label preserves the existing input identity and editable source amount",()=>{
 for(const [currency,currencyLabel,amount] of [["ILS","₪","80.05"],["USD","USD","12.34"],["KWD","KWD","1.234"],["VND","VND","100000"]]) {
  const model=Object.freeze({index:1,amount,currency,currencyLabel});
  const html=renderExpensePayerAmountView(model);
  assert.ok(html.startsWith('<label class="field payer-amount-field"><span>כמה שילם <span class="font-num" dir="ltr">'+currencyLabel+'</span></span>'));
  assert.ok(html.endsWith('</label>'));
  const input=html.match(/<input[^>]+>/g);assert.equal(input.length,1);
  for(const attr of ['data-action="expense-payer-amount"','data-index="1"','name="expensePayerAmount-1"','autocomplete="off"','inputmode="decimal"','enterkeyhint="next"','dir="ltr"',`aria-label="סכום ששילם משלם 2 ב־${currency}"`,`value="${amount}"`]) assert.ok(input[0].includes(attr),attr);
  assert.doesNotMatch(html,/disabled|readonly|data-action="(?:save|convert)/);
  assert.equal(model.amount,amount);
 }
});

test("payer amount captions and input attributes escape untrusted display values",()=>{
 const html=renderExpensePayerAmountView({index:0,amount:'1" onfocus="bad',currency:'USD" data-x="bad',currencyLabel:'<img src=x> & \'USD\''});
 assert.doesNotMatch(html,/<img|" onfocus=|" data-x=/);
 assert.match(html,/&lt;img src=x&gt; &amp; &#039;USD&#039;/);
 assert.ok(html.includes('value="1&quot; onfocus=&quot;bad"'));
});
