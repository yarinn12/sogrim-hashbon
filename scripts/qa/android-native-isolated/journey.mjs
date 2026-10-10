import assert from 'node:assert/strict';
import { mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { adb, connect, launch, waitFor, screenshot, inspectExpression, sleep } from './driver.mjs';
const out=resolve(process.env.ANDROID_QA_OUTPUT||'artifacts/android-native-isolated'); mkdirSync(out,{recursive:true});
const checks=[], evidence={source:process.env.ANDROID_QA_SOURCE,checks};
let page;
function check(name,condition){checks.push({name,ok:Boolean(condition)});console.log(JSON.stringify(checks.at(-1)));assert.ok(condition,name);}
const step=()=>page.evaluate(`document.querySelector('[data-expense-step]')?.dataset.expenseStep`);
async function next(expected){await page.click('[data-action="expense-step-next"]');await waitFor(async()=>await step()===expected,'Expense '+expected);}
async function snapshot(name){evidence[name]=await page.evaluate(inspectExpression);screenshot(resolve(out,name+'.png'));}
async function tap(selector){(evidence.nativeTaps??=[]).push(await page.tap(selector));}
async function openEvent(){await tap('[data-action="open-event"][data-event-id="android-native-event"]');await waitFor(()=>page.evaluate(`document.querySelector('#app')?.dataset.screen==='event'`),'Event');}
async function payload(name,total){return waitFor(()=>page.evaluate(`(() => { const writes=JSON.parse(localStorage.getItem('qa-native-writes')||'[]');return writes.findLast(w=>w.state.events.find(e=>e.id==='android-native-event')?.expenses.some(e=>e.name===${JSON.stringify(name)}&&e.total===${total})); })()`),'Final acknowledged snapshot payload',30000);}
async function nativeFocus(selector){
  const rect=await page.evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});return {rect:e.getBoundingClientRect().toJSON(),dpr:devicePixelRatio};})()`);
  adb(['shell','uiautomator','dump','/sdcard/qa-native-window.xml']);
  const xml=adb(['shell','cat','/sdcard/qa-native-window.xml']);
  const tag=xml.match(/<node[^>]*class="android\.webkit\.WebView"[^>]*>/)?.[0];
  const bounds=tag?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if(!bounds)throw new Error('Actual native WebView bounds unavailable');
  const x=Math.round(+bounds[1]+(rect.rect.x+rect.rect.width/2)*rect.dpr),y=Math.round(+bounds[2]+(rect.rect.y+rect.rect.height/2)*rect.dpr);
  adb(['shell','input','tap',String(x),String(y)]);
  await waitFor(()=>/mInputShown=true|mIsInputViewShown=true/.test(adb(['shell','dumpsys','input_method'])),'Real Android keyboard shown');
  evidence.keyboard={tap:{x,y},webViewBounds:bounds.slice(1),inputMethod:adb(['shell','dumpsys','input_method']).split('\n').filter(l=>/mInputShown|mIsInputViewShown|mImeWindowVis/.test(l))};
}
try{
  adb(['shell','settings','put','system','font_scale','1']);
  adb(['shell','settings','put','system','accelerometer_rotation','0']);adb(['shell','settings','put','system','user_rotation','0']);
  evidence.initialWarmAttach=process.env.ANDROID_QA_WARM_ATTACH==='1';
  page=evidence.initialWarmAttach?await connect():await launch(); await page.command('Runtime.enable');
  await waitFor(()=>page.evaluate(`document.querySelector('#app')?.dataset.screen==='home'`),'Home screen',30000);await openEvent();
  await page.click('[data-action="show-expense-form"]'); await waitFor(async()=>await step()==='amount','Amount step');
  const before=await page.evaluate('({height:innerHeight,visual:visualViewport.height})');
  await page.fill('[data-action="expense-total"]','');
  await nativeFocus('[data-action="expense-total"]');
  adb(['shell','input','text','120']);await sleep(250);
  const value=await page.evaluate(`document.querySelector('[data-action="expense-total"]')?.value`);
  check('Actual Android IME enters expense amount',Number(value)===120);
  const after=await page.evaluate('({height:innerHeight,visual:visualViewport.height})');
  evidence.keyboard={...evidence.keyboard,before,after}; await snapshot('keyboard-amount');
  adb(['shell','input','keyevent','4']); await sleep(300);
  check('Android Back hides keyboard and retains expense draft',await step()==='amount'&&Number(await page.evaluate(`document.querySelector('[data-action="expense-total"]').value`))===120);
  await next('name'); await page.fill('[data-action="expense-name"]','QA Native Ride');
  await next('payer');await next('participants');await next('review');
  await tap('[data-action="save-expense"]');
  const first=await payload('QA Native Ride',12000); evidence.createWrite=first;
  check('Create reaches real client final write and synthetic server acknowledgement',Boolean(first));
  await waitFor(()=>page.evaluate(`!document.querySelector('[data-expense-step]')`),'Expense dialog closes');await snapshot('created-expense');
  const id=first.state.events.find(e=>e.id==='android-native-event').expenses.find(e=>e.name==='QA Native Ride').id;
  // The edit control belongs to a collapsed <details> menu. Open it as a
  // real user would; a DOM click on its hidden child bypasses that boundary.
  await tap(`.expense-row[data-expense-id="${id}"] .expense-row-actions-menu > summary`);
  await waitFor(()=>page.evaluate(`Boolean(document.querySelector('.expense-row[data-expense-id="${id}"] .expense-row-actions-menu[open]'))`),'Expense actions menu opened');
  await tap(`[data-action="edit-expense"][data-expense-id="${id}"]`);await waitFor(async()=>await step()==='review','Edit review');
  await page.click('[data-action="expense-step-edit"][data-step="amount"]');await waitFor(async()=>await step()==='amount','Edit amount');
  await page.fill('[data-action="expense-total"]','150');await next('name');await page.fill('[data-action="expense-name"]','QA Native Edited');
  await next('payer');await next('participants');await next('review');await tap('[data-action="save-expense"]');
  const edited=await payload('QA Native Edited',15000);evidence.editWrite=edited;
  check('Edit retains expense identity in acknowledged final payload',edited.state.events.find(e=>e.id==='android-native-event').expenses.find(e=>e.name==='QA Native Edited').id===id);
  await waitFor(()=>page.evaluate(`!document.querySelector('[data-expense-step]')`),'Edit closes');
  await page.click('[data-action="settle"]');await waitFor(()=>page.evaluate(`document.querySelector('#app').dataset.screen==='settlement'`),'Settlement');
  adb(['shell','input','keyevent','4']);await waitFor(()=>page.evaluate(`document.querySelector('#app').dataset.screen==='event'`),'Native Back to event');check('Native Back from settlement returns to event',true);
  await page.click('[data-action="open-event-settings"]');await page.click('[data-action="open-event-settings-section"][data-settings-section="currency"]');await snapshot('settings-section');
  adb(['shell','input','keyevent','4']);await sleep(250);await snapshot('settings-back');
  check('Native Back retains event and leaves settings subsection',await page.evaluate(`document.querySelector('#app').dataset.screen==='event'&&!document.querySelector('[data-action="set-event-currency"]')`));
  adb(['shell','input','keyevent','4']);await sleep(250);
  await page.click('[data-action="home"]');page.close();page=await launch();await openEvent();
  const restart=await page.evaluate(`(() => {const row=JSON.parse(localStorage.getItem('qa-native-server-row'));const local=JSON.parse(localStorage.getItem('settle-friends-state:android-native-qa-space'));return {row,local,text:document.querySelector('#app').innerText,pending:Object.entries(localStorage).filter(([k])=>k.startsWith('settle-friends-pending-sync:'))};})()`);
  evidence.restart=restart;
  check('Force-stop/relaunch retains edited expense locally and on fixture server',restart.row.state.events[0].expenses.some(e=>e.id===id&&e.total===15000)&&restart.local.events[0].expenses.some(e=>e.id===id&&e.total===15000)&&restart.text.includes('QA Native Edited'));
  check('Acknowledged save leaves no pending outbox after restart',restart.pending.length===0);
  await snapshot('restarted-event');
}catch(error){evidence.error=error.stack;process.exitCode=1;}
finally{if(page){evidence.final=await page.evaluate(inspectExpression).catch(e=>({error:e.message}));evidence.exceptions=page.exceptions;page.close();}writeFileSync(resolve(out,'journey.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({checks,error:evidence.error,keyboard:evidence.keyboard},null,2));}
