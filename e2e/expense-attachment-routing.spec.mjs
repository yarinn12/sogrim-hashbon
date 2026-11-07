import {expect,test} from '@playwright/test';
import {openHeldRenderedHome,requireHeldHomeReadiness} from './helpers/heldHomeReadinessControl.mjs';
requireHeldHomeReadiness(test);test.use({serviceWorkers:'block'});
const owner='review-owner',eventId='review-event',notice='המטבע הוחלף; יש להזין מחדש את הסכום ואת סכומי המשלמים.';
const initial={currentParticipantId:owner,participants:[{id:owner,displayName:'ירין ישראלי',kind:'user'},{id:'review-two',displayName:'דנה לוי',kind:'guest'},{id:'review-three',displayName:'איתי כהן',kind:'guest'}],friendContacts:[],groups:[],deletedEvents:[],deletedParticipants:[],events:[{id:eventId,name:'סוף שבוע בצפון',eventType:'outing',currency:'ILS',participantIds:[owner,'review-two','review-three'],adminIds:[owner],createdByParticipantId:owner,createdAt:'2026-10-10T00:00:00Z',updatedAt:'2026-10-10T00:00:00Z',expenses:[],transfers:[],notes:[],deletedNotes:[],activityLog:[]}]};
test.beforeEach(async({page,request})=>{await request.post('/api/reset');await request.put('/api/state',{data:initial});await page.addInitScript(state=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('settle-friends-state',JSON.stringify(state));localStorage.setItem('settle-friends-current-participant',state.currentParticipantId);localStorage.setItem('settle-friends-local-profile',JSON.stringify({participantId:state.currentParticipantId,displayName:'ירין ישראלי'}));sessionStorage.setItem('settle-friends-skip-next-splash','1');},initial);await page.route('**/v6/latest/USD',route=>{const last=Math.floor(Date.now()/1000)-3600;return route.fulfill({contentType:'application/json',body:JSON.stringify({result:'success',provider:'https://www.exchangerate-api.com',base_code:'USD',time_last_update_unix:last,time_next_update_unix:last+86400,time_eol_unix:0,rates:{USD:1,ILS:3.5}})});});await openHeldRenderedHome(page);await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();await page.locator('[data-action="show-expense-form"]').first().click();});
async function currency(page,id){await page.locator('[data-choice-select-action="expense-source-currency"]').click();await page.locator(`.app-choice-option[data-choice-value="${id}"]`).click();}
async function review(page,amount='240',name='ארוחת ערב'){await page.locator('[data-action="expense-total"]').fill(amount);await page.locator('[data-action="expense-step-next"]').click();await page.locator('[data-action="expense-name"]').fill(name);for(let i=0;i<3;i++)await page.locator('[data-action="expense-step-next"]').click();await expect(page.locator('.expense-step-modal')).toHaveAttribute('data-expense-step','review');}
async function saved(page){return page.evaluate(()=>JSON.parse(localStorage.getItem('settle-friends-state')).events[0].expenses);}

const png='iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAD0lEQVR42mP8z8DAwMAAAAYAAQHLR3cAAAAASUVORK5CYII=';
const imageFile={name:'synthetic-receipt.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')};
const gallery=page=>page.getByRole('button',{name:'פתיחת הגלריה',exact:true});
const camera=page=>page.getByRole('button',{name:'פתיחת המצלמה',exact:true});
const preview=page=>page.locator('.expense-attachment-preview');
async function actualNativeBridge(page,platform){
 await page.route("**/__qa_attachment.png",route=>route.fulfill({contentType:"image/png",body:imageFile.buffer}));
 await page.evaluate(async({png,platform})=>{
  window.__picker={calls:[],mode:'success'};
  const call=async(method,options)=>{
   const fixture=window.__picker;fixture.calls.push({method,options});
   if(fixture.mode==='cancel')throw Object.assign(new Error('User cancelled'),{code:method==='takePhoto'?'OS-PLUG-CAMR-0006':'OS-PLUG-CAMR-0020'});
   if(fixture.mode==='denied')throw Object.assign(new Error('Permission denied'),{code:method==='takePhoto'?'OS-PLUG-CAMR-0003':'OS-PLUG-CAMR-0005'});
   const media={webPath:location.origin+'/__qa_attachment.png',metadata:{format:'png'}};
   return method==='takePhoto'?media:{results:[media]};
  };
  window.Capacitor={isNativePlatform:()=>true,getPlatform:()=>platform,Plugins:{Camera:{takePhoto:o=>call('takePhoto',o),chooseFromGallery:o=>call('chooseFromGallery',o)}}};
  // Run the production bridge. Only the OS plugin is synthetic.
  await import('/src/publicNativeBridgeLayer.mjs?attachment-routing-qa');
 },{png,platform});
}
test('browser buttons open distinct camera-capture and gallery choosers and preserve unsaved notes',async({page},testInfo)=>{
 await review(page);await gallery(page).scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('attachment-buttons.png')});await page.locator('[data-action="expense-notes"]').fill('Keep notes while selecting');
 const galleryChooserPromise=page.waitForEvent('filechooser');await gallery(page).click();const galleryChooser=await galleryChooserPromise;
 expect(await galleryChooser.element().getAttribute('accept')).toBe('image/*');expect(await galleryChooser.element().getAttribute('capture')).toBeNull();expect(galleryChooser.isMultiple()).toBe(false);
 await galleryChooser.setFiles(imageFile);await expect(preview(page)).toBeVisible();await expect(page.locator('[data-action="expense-notes"]')).toHaveValue('Keep notes while selecting');
 const cameraChooserPromise=page.waitForEvent('filechooser');await camera(page).click();const cameraChooser=await cameraChooserPromise;
 expect(await cameraChooser.element().getAttribute('capture')).toBe('environment');expect(cameraChooser.isMultiple()).toBe(false);
 await cameraChooser.setFiles(imageFile);await expect(preview(page)).toBeVisible();expect(await saved(page)).toHaveLength(0);
 await page.locator('[data-action="remove-expense-attachment"]').click();await expect(preview(page)).toHaveCount(0);await expect(page.locator('[data-action="expense-notes"]')).toHaveValue('Keep notes while selecting');
});
for(const platform of ['android','ios'])test(`actual bridge routes ${platform} camera and gallery separately through image save`,async({page})=>{
 await review(page);await actualNativeBridge(page,platform);let chooserCount=0;page.on('filechooser',()=>chooserCount++);
 await page.locator('[data-action="expense-notes"]').fill('Native receipt notes');await camera(page).click();await expect(preview(page)).toBeVisible();
 await gallery(page).click();await expect.poll(()=>page.evaluate(()=>window.__picker.calls.length)).toBe(2);await expect(gallery(page)).toBeEnabled();
 expect(await page.evaluate(()=>window.__picker.calls.map(c=>c.method))).toEqual(['takePhoto','chooseFromGallery']);
 const options=await page.evaluate(()=>window.__picker.calls);expect(options[0].options.cameraDirection).toBe('REAR');expect(options[0].options.saveToGallery).toBe(false);expect(options[1].options.mediaType).toBe(0);expect(options[1].options.allowMultipleSelection).toBe(false);
 expect(await preview(page).evaluate(e=>e.complete&&e.naturalWidth>0)).toBe(true);expect(chooserCount).toBe(0);expect(await saved(page)).toHaveLength(0);
 await page.locator('[data-action="save-expense"]').click();await expect(page.locator('.expense-row[data-expense-id]')).toHaveCount(1);const [expense]=await saved(page);expect(expense.total).toBe(24000);expect(expense.notes).toBe('Native receipt notes');expect(expense.attachmentImage).toMatch(/^data:image\/jpeg;base64,/);
 // The existing-expense notes editor must use exactly the same sources.
 await page.locator('.expense-row-actions-menu summary').click();await page.locator('[data-action="edit-expense-notes"]').click();await expect(page.locator('.expense-notes-modal')).toBeVisible();
 await camera(page).click();await expect(camera(page)).toBeEnabled();await gallery(page).click();await expect(gallery(page)).toBeEnabled();expect(await page.evaluate(()=>window.__picker.calls.map(c=>c.method))).toEqual(['takePhoto','chooseFromGallery','takePhoto','chooseFromGallery']);
 await page.locator('[data-action="expense-notes"]').fill('Updated notes only');await page.locator('[data-action="save-expense"]').click();await expect(page.locator('.expense-notes-modal')).toHaveCount(0);const expenses=await saved(page);expect(expenses).toHaveLength(1);expect(expenses[0].total).toBe(24000);expect(expenses[0].notes).toBe('Updated notes only');expect(expenses[0].attachmentImage).toMatch(/^data:image\/jpeg;base64,/);
});
test('native cancel and permission refusal preserve the existing image and notes with no fallback picker',async({page})=>{
 await review(page);await actualNativeBridge(page,'ios');let chooserCount=0;page.on('filechooser',()=>chooserCount++);
 await gallery(page).click();await expect(preview(page)).toBeVisible();const src=await preview(page).getAttribute('src');await page.locator('[data-action="expense-notes"]').fill('Keep after cancel');
 await page.evaluate(()=>window.__picker.mode='cancel');for(const button of [camera(page),gallery(page)]){await button.click();await expect(button).toBeEnabled();await expect(preview(page)).toHaveAttribute('src',src);}
 await expect(page.locator('[data-action="expense-notes"]')).toHaveValue('Keep after cancel');await expect(page.getByText('לא הצלחנו לפתוח',{exact:false})).toHaveCount(0);
 await page.evaluate(()=>window.__picker.mode='denied');await camera(page).click();await expect(page.getByText('לא הצלחנו לפתוח את המצלמה. בדוק שהרשאת המצלמה פעילה ונסה שוב.',{exact:true})).toBeVisible();
 await gallery(page).click();await expect(page.getByText('לא הצלחנו לפתוח את הגלריה. בדוק שהגישה לתמונות מותרת ונסה שוב.',{exact:true})).toBeVisible();await expect(preview(page)).toHaveAttribute('src',src);await expect(page.locator('[data-action="expense-notes"]')).toHaveValue('Keep after cancel');expect(chooserCount).toBe(0);expect(await saved(page)).toHaveLength(0);
});
