import {expect,test} from '@playwright/test';
import {resetLocalQaStateFresh} from './helpers/resetLocalQaStateFresh.mjs';
import {writeLocalQaStateFresh} from './helpers/writeLocalQaStateFresh.mjs';
import {holdNonessentialHomeImage} from './helpers/heldHomeImage.mjs';
import {localQaNavigationReady} from './helpers/localQaNavigationReady.mjs';

test.use({serviceWorkers:'block'});
test('local QA navigation reaches required UI before a nonessential image finishes',async({page,baseURL})=>{
  const state={currentParticipantId:'qa-ready-owner',participants:[{id:'qa-ready-owner',displayName:'בודק מוכנות',kind:'user',avatarPreset:'avatar-1'}],friendContacts:[],groups:[],deletedEvents:[],deletedParticipants:[],events:[]};
  await resetLocalQaStateFresh(baseURL);await writeLocalQaStateFresh(baseURL,state);
  await page.addInitScript(state=>{
    localStorage.clear();sessionStorage.clear();localStorage.setItem('settle-friends-state',JSON.stringify(state));
    localStorage.setItem('settle-friends-current-participant',state.currentParticipantId);
    localStorage.setItem('settle-friends-local-profile',JSON.stringify({participantId:state.currentParticipantId,displayName:'בודק מוכנות',avatarPreset:'avatar-1'}));
    sessionStorage.setItem('settle-friends-skip-next-splash','1');
  },state);
  const image=await holdNonessentialHomeImage(page,baseURL);let ready=false;
  const navigation=localQaNavigationReady(page).then(()=>{ready=true;});
  try{
    await Promise.all([navigation,(async()=>{
      await page.locator('[data-action="new-event"]').first().waitFor({state:'visible'});
      await expect.poll(()=>ready).toBe(true);
    })()]);
    expect(image.requested).toBe(true);
    expect(await page.evaluate(()=>document.readyState)).not.toBe('complete');
    await page.locator('[data-action="new-event"]').first().click();
    await expect(page.locator('[data-action="new-event-type"][data-event-type="standard"]')).toBeVisible();
  }finally{image.release();await navigation;}
});
