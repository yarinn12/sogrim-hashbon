import {test,expect} from '@playwright/test';
import{readFileSync}from'node:fs';
import{installSyntheticSystemText}from'./helpers/accessibilityPresentation.mjs';
import{geometry,finish,ack,pickerSearch}from'./helpers/eventCurrencyPresentation.mjs';
const fixture=readFileSync(new URL('./fixtures/eventCurrencyBootstrap.js',import.meta.url),'utf8'),evidence=new WeakMap();
test.use({serviceWorkers:'block'});
test.beforeEach(async({page})=>{
 const e={errors:[],external:[]};evidence.set(page,e);page.on('pageerror',x=>e.errors.push(x.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(e.external.push(r.request().url()),r.abort()));
 await page.addInitScript({content:fixture});
});
test.afterEach(async({page})=>{const e=evidence.get(page);expect(e.errors).toEqual([]);expect(e.external).toEqual([])});
async function start(page,{width=393,height=852,root=16,query='',system=false}={}) {
 if(system)await page.addInitScript(installSyntheticSystemText);await page.setViewportSize({width,height});
 await page.goto('/?review=1&requests=accepted&reward=inactive'+(!system&&root>16?'&dynamic-type-preview='+root:'')+query);
 await page.locator('.product-home-screen .event-list [data-action="open-event"][data-event-id="friend-weekend"]').click();
 await page.locator('.screen [data-action="open-event-settings"]').click();await page.locator('[data-settings-section="currency"]').click();
 const menu=page.locator('.event-modal:has([data-action="event-currency"])');await expect(menu).toBeVisible();await page.evaluate(()=>document.fonts.ready);
 await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)&&a.playState==='running').length)).toBe(0);
 return{page,menu,root:system?32:root};
}
const profiles=[['phone',393,852,16,''],['medium',360,740,20,''],['large',320,852,32,''],['short',320,390,32,''],['landscape',852,393,32,''],['readonly',320,852,32,'&settings-readonly=1'],['converted',320,852,32,'&currency-converted=1'],['empty',393,852,16,'&currency-empty=1'],['long-title',320,852,32,'&settings-long-title=1'],['desktop',1280,720,16,'']];
for(const[id,width,height,root,query]of profiles)test('currency readable layout '+id,async({page})=>{
 const x=await start(page,{width,height,root,query});await geometry(x);const trigger=x.menu.locator('.app-choice-trigger');
 if(['readonly','converted'].includes(id)){await expect(trigger).toBeDisabled();const before=await page.evaluate(()=>__friendInviteQa.canonicalWrites.length);await trigger.evaluate(e=>e.click());expect(await page.evaluate(()=>__friendInviteQa.canonicalWrites.length)).toBe(before);await expect(page.locator('.app-choice-picker-backdrop')).toHaveCount(0)}else await expect(trigger).toBeEnabled();
 await finish(page);
});
test('currency actual field and picker placeholder grow with system text',async({page})=>{
 const x=await start(page,{width:320,root:32});await expect(x.menu.locator('.event-currency-field > span')).toHaveCSS('font-size','32px');
 await x.menu.locator('.app-choice-trigger').click();await pickerSearch(page,32);await page.keyboard.press('Escape');await finish(page);
});
test('currency original confirmation cancel and save retain amounts and require canonical ACK',async({page})=>{
 const x=await start(page),trigger=x.menu.locator('.app-choice-trigger');await trigger.click();let{picker,input}=await pickerSearch(page,16);await input.fill('USD');await picker.locator('[data-choice-value="USD"]').click();
 const confirm=page.locator('.important-action-dialog');await expect(confirm).toContainText('לא יומרו לפי שער חליפין');const before=await page.evaluate(()=>__friendInviteQa.canonicalWrites.length);
 await confirm.locator('[data-action="cancel-important-action"]').click();await expect(x.menu.locator('select')).toHaveValue('ILS');expect(await page.evaluate(()=>__friendInviteQa.canonicalWrites.length)).toBe(before);await finish(page);
 await trigger.click();await picker.locator('input[type=search]').fill('USD');await picker.locator('[data-choice-value="USD"]').click();await confirm.locator('[data-action="confirm-important-action"]').click();await ack(page,'USD');await expect(x.menu.locator('select')).toHaveValue('USD');await expect(trigger).toBeFocused();await finish(page,{allowCurrency:true});
});
test('currency empty event saves a new currency through the original change handler',async({page})=>{
 const x=await start(page,{query:'&currency-empty=1'});await x.menu.locator('.app-choice-trigger').click();await page.locator('.app-choice-search-input').fill('USD');await page.locator('.app-choice-option[data-choice-value="USD"]').click();
 await expect(page.locator('.important-action-dialog')).toHaveCount(0);await ack(page,'USD');await expect(x.menu.locator('select')).toHaveValue('USD');await finish(page,{allowCurrency:true});
});
test('currency picker Escape and settings Back retain original focus',async({page})=>{
 const x=await start(page),trigger=x.menu.locator('.app-choice-trigger');await trigger.click();await page.keyboard.press('Escape');await expect(trigger).toBeFocused();await x.menu.locator('[data-action="event-settings-back"]').click();await expect(page.locator('[data-settings-section="currency"]')).toBeFocused();await page.locator('[data-settings-section="currency"]').click();await expect(x.menu).toBeVisible();await finish(page);
});
test('currency system text preference, orientation and all text lines stay reachable',async({page})=>{
 const x=await start(page,{system:true,width:320,height:390});await geometry(x);const entry=x.menu.locator('[data-open-accessibility]');
 for(const[value,root]of[['extra-large',20],['system',32]]){await entry.click();await page.locator('.accessibility-segmented-control label:has(input[value="'+value+'"])').click();await page.keyboard.press('Escape');await expect(entry).toBeFocused();x.root=root;await geometry(x)}
 await page.setViewportSize({width:852,height:393});await geometry(x);await page.setViewportSize({width:320,height:852});await geometry(x);await finish(page);
});
