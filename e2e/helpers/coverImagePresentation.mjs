import {expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
export {paint,reach,click} from './cropInviteBlockPresentation.mjs';
import {paint,click} from './cropInviteBlockPresentation.mjs';
export const imageBytes=readFileSync(new URL('../../assets/avatars/avatar-3.png',import.meta.url));
export async function chooseImage(page,{profile=false,bad=false,type='image/png'}={}){
 const input=page.locator(profile?'[data-action="profile-avatar-image"][data-image-source="gallery"]':'.event-cover-settings [data-action="event-cover-image"]').first();
 await input.setInputFiles({name:bad?'unreadable.png':'example-photo.png',mimeType:type,buffer:bad?Buffer.from('not-a-valid-image-file'):imageBytes});
 if(!bad&&type.startsWith('image/')){await expect(page.locator('.image-crop-dialog[open]')).toBeVisible();await expect.poll(()=>page.locator('[data-crop-preview]').evaluate(e=>e.complete&&e.naturalWidth>0)).toBe(true)}
 await paint(page);
}
export async function start(page,view,{root=16,width=393,height=852,system=false}={}){
 await page.setViewportSize({width,height});
 await page.goto('/?cover-image-qa=1&requests=empty&reward=inactive'+(root>16&&!system?'&dynamic-type-preview='+root:'')+(view==='cover-save-error'?'&image-mode=permission':'')+(process.env.COVER_IMAGE_NATIVE?'&native=1':''));
 await page.evaluate(()=>document.fonts.ready);
 if(view==='profile-image-error'){
  const nav=page.getByRole('navigation',{name:'ניווט ראשי',exact:true});await click(page,nav.getByRole('button',{name:'פרופיל',exact:true}));await click(page,page.locator('.profile-avatar-picker-summary'));
 }else{
  await click(page,page.locator('.product-home-screen [data-action="open-event"][data-event-id="friend-weekend"]').first());await click(page,page.locator('.screen [data-action="open-event-settings"]'));
 }
 await chooseImage(page,{profile:view==='profile-image-error',bad:['profile-image-error','cover-image-error'].includes(view)});
 if(view==='cover-save-error'){
  await click(page,page.locator('[data-crop-action="confirm"]'));await expect(page.locator('.image-crop-dialog[open]')).toHaveCount(0);await expect.poll(()=>page.evaluate(()=>__friendInviteQa.coverDeniedAttempts.length)).toBeGreaterThan(0);
 }
 if(view!=='cover-crop')await expect(page.locator('.image-selection-feedback,#profile-name-error,.app-toast').filter({hasText:/תמונה|תמונת/}).first()).toBeAttached();
 await paint(page);return page.locator(view==='cover-crop'?'.image-crop-dialog':view==='profile-image-error'?'.profile-avatar-picker-shell':'.event-cover-settings');
}
export const financial=page=>page.evaluate(()=>JSON.stringify(__friendInviteQa.canonicalSnapshot.state.events.map(({expenses,transfers,participantIds,adminIds,currency})=>({expenses,transfers,participantIds,adminIds,currency}))));
