import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {adb,connect,launch,waitFor,screenshot} from './driver.mjs';
const out=resolve(process.env.ANDROID_QA_OUTPUT);mkdirSync(out,{recursive:true});
let page=await launch();
try{
  await page.evaluate(`(() => {const key='qa-native-server-row';const row=JSON.parse(localStorage.getItem(key));const owner=row.state.currentParticipantId;row.state.participants[1].displayName='אורח בדיקה עם שם ארוך מאוד לצורך תצוגה';row.state.events[0].expenses=[{id:'native-seeded-multi-payer',name:'הוצאה עם שני משלמים',total:12000,payers:[{participantId:owner,amount:7000},{participantId:'android-native-guest',amount:5000}],sharedByParticipantIds:[owner,'android-native-guest'],createdByParticipantId:owner,occurredOn:'2026-10-10',updatedAt:'2026-10-10T10:00:00.000Z'}];localStorage.setItem(key,JSON.stringify(row));localStorage.setItem('settle-friends-state:android-native-qa-space',JSON.stringify(row.state));return true;})()`);
  page.close();adb(['shell','settings','put','system','font_scale','2']);page=await launch();
  await page.click('[data-action="open-event"][data-event-id="android-native-event"]');await page.click('[data-action="settle"]');
  await waitFor(()=>page.evaluate(`document.querySelector('#app').dataset.screen==='settlement'`),'Summary');
  const rows=await page.evaluate(`(() => {const selectors=['.settlement-hero-title-row .muted','.product-brand-copy strong','.transfer-participant-copy strong','.transfer-amount > .amount','.personal-transfer-badge','.transfer-debt-summary','.transfer-equation-item > span'];return selectors.map(selector=>({selector,values:[...document.querySelectorAll(selector)].map(e=>({text:e.innerText,fontSize:parseFloat(getComputedStyle(e).fontSize)}))}));})()`);
  const result={source:'bf49d0b5d0d1ceb0cc686e00be29d2f684411a91',scale:2,syntheticDataSeededThroughLocalStorage:true,capabilities:await page.evaluate('Capacitor.Plugins.SogrimCapabilities.getCapabilities()'),rows};
  writeFileSync(resolve(out,'baseline-typography.json'),JSON.stringify(result,null,2));screenshot(resolve(out,'baseline-typography.png'));console.log(JSON.stringify(result));
}finally{page.close();adb(['shell','settings','put','system','font_scale','1']);}
