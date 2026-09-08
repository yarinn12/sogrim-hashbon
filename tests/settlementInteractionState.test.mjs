import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8');
const begin=source.indexOf('function findFocusReplacement(');
const end=source.indexOf('function cloneNavigationValue(',begin);
assert(begin>=0&&end>begin);
const context=vm.createContext({document:{getElementById:()=>null}});
vm.runInContext(source.slice(begin,end),context);
const identity={id:'',name:'',tagName:'ARTICLE',dataset:{transferId:'payment-60',
  transferFrom:'payer',transferTo:'recipient',transferStatus:'pending'}};
const row=(id,to='recipient',status='pending')=>({dataset:{transferId:id,
  transferFrom:'payer',transferTo:to,transferStatus:status}});
const find=rows=>context.findFocusReplacement({querySelectorAll:()=>rows},identity);

test('focus follows a recalculated amount for the same pending payment, not paid history',()=>{
  const history=row('paid-20','recipient','paid');
  const differentRecipient=row('payment-80-other','someone-else');
  const recalculated=row('payment-80');
  assert.equal(find([history,differentRecipient,recalculated]),recalculated);
});

test('a removed payment never moves focus to another recipient or payment status',()=>{
  assert.equal(find([row('payment-other','someone-else'),row('paid-60','recipient','paid')]),null);
});
