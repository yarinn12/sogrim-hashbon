import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{runInNewContext}from'node:vm';
test('currency search accepts an explicit presentation hint and preserves all other picker defaults and filtering',()=>{
 const source=readFileSync(process.env.EVENT_CURRENCY_TEST_PICKER||'src/publicChoicePickerLayer.mjs','utf8'),from=source.indexOf('function renderChoiceSearch('),to=source.indexOf('\nfunction filterChoiceOptions',from);assert(from>=0&&to>from);const calls=[];
 const ctx={iconSvg:()=>'<svg data-original-search></svg>',filterChoiceOptions:(...args)=>calls.push(args),document:{createElement:()=>({children:[],attrs:{},listeners:{},setAttribute(k,v){this.attrs[k]=v},append(...nodes){this.children.push(...nodes)},addEventListener(k,fn){this.listeners[k]=fn}})}};
 runInNewContext(source.slice(from,to)+'\nthis.render=renderChoiceSearch',ctx);
 for(const custom of [undefined,'מטבע או מדינה']){const list={},empty={},r=ctx.render(list,empty,custom),input=r.children[1];assert.equal(input.placeholder,custom??'חיפוש לפי מטבע, מדינה או קוד');assert.equal(input.attrs['aria-label'],'חיפוש מטבע');input.value='תאילנד';input.listeners.input();const args=calls.at(-1);assert.equal(args[0],list);assert.equal(args[1],empty);assert.equal(args[2],'תאילנד');}
});
