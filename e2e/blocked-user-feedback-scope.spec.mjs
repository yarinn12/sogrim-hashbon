import{test,expect}from'@playwright/test';
import{cropInviteBlockBootstrap}from'./fixtures/cropInviteBlockBootstrap.mjs';
import{click,financial}from'./helpers/cropInviteBlockPresentation.mjs';
test.use({serviceWorkers:'block'});
test('blocked friend profile shows a failed unblock instead of losing feedback in an absent list',async({page,baseURL})=>{
 const errors=[],external=[],origin=new URL(baseURL).origin;page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin)return r.continue();external.push(r.request().url());return r.abort()});
 await page.addInitScript({content:'localStorage.clear();'+cropInviteBlockBootstrap+'\n__friendInviteQa.blockedRows=[];'});
 await page.clock.install();
 await page.goto('/?crop-invite-block-qa=1&participant-safety-batch=1&requests=accepted&reward=inactive&unblock-mode=error'+(process.env.CROP_INVITE_BLOCK_NATIVE?'&native=1':''));
 await page.evaluate(()=>document.fonts.ready);
 await click(page,page.getByRole('navigation',{name:'ניווט ראשי',exact:true}).getByRole('button',{name:'חברים',exact:true}));
 const entry=page.locator('[data-action="open-participant-statistics"][data-participant-id="account-22222222-2222-4222-8222-222222222222"]');await expect(entry).toBeVisible();
 // The same account blocked this person on another device after this roster
 // loaded. Change only the synthetic server receipt, then use the actual entry.
 await page.evaluate(()=>{__friendInviteQa.blockedRows=[{blocked_user_id:'22222222-2222-4222-8222-222222222222',blocked_display_name:'דנה לוי',blocked_username:'dana_levi'}];__friendInviteQa.requestRows.splice(0,__friendInviteQa.requestRows.length,...__friendInviteQa.requestRows.filter(r=>r.requester_id!=='22222222-2222-4222-8222-222222222222'&&r.addressee_id!=='22222222-2222-4222-8222-222222222222'))});
 await click(page,entry);await expect(page.locator('[data-friend-profile-id]')).toBeVisible();
 await page.clock.fastForward(13_000);
 const disclosure=page.locator('.relationship-safety-management');await click(page,disclosure.locator('summary'));
 const unblock=disclosure.locator('[data-action="unblock-connected-user"]');await expect(unblock).toBeVisible();const before=await financial(page);await click(page,unblock);
 await expect.poll(()=>page.evaluate(()=>__friendInviteQa.safetyRequests.length)).toBe(1);
 await expect(page.locator('.notice')).toContainText('לא הצלחנו לבטל את החסימה');await expect(page.locator('.blocked-users-panel')).toHaveCount(0);await expect(page.locator('[data-friend-profile-id]')).toBeVisible();expect(await financial(page)).toBe(before);expect(errors).toEqual([]);expect(external).toEqual([]);
});
