import {test,expect} from "@playwright/test";
import {readFileSync} from "node:fs";
import {createQrSvg} from "../src/domain/qrCode.mjs";
import {control,textLines,geometry} from "./helpers/referralInvitationPresentation.mjs";
import {profileIdentityReach,clickProfileIdentity} from "./helpers/profileIdentityPresentation.mjs";
const bootstrap=readFileSync(new URL('./fixtures/profileRewardBootstrap.js',import.meta.url),'utf8'),evidence=new WeakMap();
test.use({serviceWorkers:'block'});
test.beforeEach(async({page})=>{const e={errors:[],external:[],overrides:[]};evidence.set(page,e);page.on('pageerror',error=>e.errors.push(error.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(e.external.push(r.request().url()),r.abort()));for(const[env,name]of [['INVITATION_TEST_LAYER','publicReferralRewardsLayer.mjs'],['INVITATION_TEST_LEDGER','publicLedgerWorkspaceLayer.mjs']])if(process.env[env])await page.route('**/src/'+name+'*',async r=>{e.overrides.push(name);await r.fulfill({status:200,contentType:'text/javascript; charset=utf-8',body:readFileSync(process.env[env],'utf8')})});await page.addInitScript({content:bootstrap})});
test.afterEach(async({page})=>{const e=evidence.get(page);expect(e.errors).toEqual([]);expect(e.external).toEqual([]);for(const[env,name]of [['INVITATION_TEST_LAYER','publicReferralRewardsLayer.mjs'],['INVITATION_TEST_LEDGER','publicLedgerWorkspaceLayer.mjs']])if(process.env[env])expect(e.overrides).toContain(name)});
const data=p=>p.evaluate(()=>({events:JSON.parse(localStorage.getItem('qa-invite-server-row')).state.events,profileWrites:__friendInviteQa.profileWrites,friendWrites:__friendInviteQa.writes,rewardWrites:__friendInviteQa.rewardWrites}));
async function journey(page,mode,root,w,h,testInfo){
 await page.setViewportSize({width:w,height:h});const reward=['custom14','stats'].includes(mode)?'inactive':mode==='stale'?'active':mode;
 await page.goto('/?requests=empty&reward='+reward+(mode==='custom14'?'&reward-days=14':'')+(mode==='stats'?'&stats=1':'')+(root>16?'&dynamic-type-preview='+root:''));
 await page.locator('.product-app-nav [data-nav-destination="profile"]').click();const card=page.locator('#referral-reward-card-profile'),button=card.locator('[data-open-referral-rewards]');await expect(card).toBeVisible();await expect.poll(()=>page.evaluate(()=>SogrimMonetization.status.status)).toBe(['inactive','active','custom14','stats','stale'].includes(mode)?'ready':mode);await profileIdentityReach(button);await clickProfileIdentity(button);
 const d=page.locator('#public-referral-rewards-dialog'),close=d.locator('[data-referral-action="close"]');await expect(d).toBeVisible();await page.evaluate(()=>document.fonts.ready);await expect(d).toHaveAttribute('role','dialog');await expect(page.locator('#app')).toHaveAttribute('inert','');const before=await data(page);
 if(mode==='stale'){await page.evaluate(async()=>{__friendInviteQa.rewardMode='error';await SogrimMonetization.refresh()});await expect(d.locator('.is-stale')).toBeVisible()}
 await geometry(page,root);await expect(d.locator('h2')).toHaveText('הזמנת חברים');await expect(d.locator('.referral-dialog-mark,.referral-dialog-lead,.referral-section-heading')).toHaveCount(0);await control(close);await page.screenshot({path:testInfo.outputPath(mode+'-top.png'),animations:'disabled'});
 if(mode==='loading'){await expect(d.locator('.referral-loading')).toBeVisible();await expect(d.locator('[data-referral-action="share"]')).toHaveCount(0);await page.evaluate(()=>__friendInviteQa.releaseReward());await expect.poll(()=>page.evaluate(()=>SogrimMonetization.status.status)).toBe('ready')}
 if(mode==='error'||mode==='stale'){const retry=d.locator('[data-referral-action="retry"]');await control(retry);await page.evaluate(()=>{__friendInviteQa.rewardMode='active'});await retry.click();await expect.poll(()=>page.evaluate(()=>SogrimMonetization.status.status)).toBe('ready');await expect(d.locator('.is-error,.is-stale')).toHaveCount(0)}
 if(mode==='signed-out'){await expect(d.locator('.is-signin')).toBeVisible();await expect(d.locator('[data-referral-action="share"],[data-referral-qr]')).toHaveCount(0);await textLines(d.locator('.is-signin strong'));await textLines(d.locator('.is-signin>span'));const profile=d.locator('[data-referral-action="profile"]');await control(profile);await profile.click();await expect(d).toHaveCount(0);await expect(page.locator('#app')).not.toHaveAttribute('inert','')}
 else{
  await expect(d.locator('#referral-benefit-title')).toHaveText(mode==='custom14'?'14 ימים ללא פרסומות':'חודש ללא פרסומות');await textLines(d.locator('#referral-benefit-title'));await textLines(d.locator('.referral-benefit-card p'));
  const link=d.locator('.referral-link-details');await control(link.locator('summary'));await link.locator('summary').click();const input=link.locator('input');await control(input);const url=await input.inputValue();expect(url).toMatch(/\/r\/0123456789abcdefabcd$/);await expect(input).toHaveAttribute('readonly','');
  const canonical=createQrSvg(url,{cellSize:4,quietZone:3,ariaLabel:'QR להזמנת חברים לסוגרים חשבון'});const same=await d.locator('[data-referral-qr] svg').evaluate((actual,expected)=>{const svg=new DOMParser().parseFromString(expected,'image/svg+xml').documentElement,attrs=el=>JSON.stringify([...el.attributes].map(a=>[a.name,a.value]).sort());return actual.getAttribute('viewBox')===svg.getAttribute('viewBox')&&actual.querySelector('path').getAttribute('d')===svg.querySelector('path').getAttribute('d')&&attrs(actual.querySelector('rect'))===attrs(svg.querySelector('rect'))},canonical);expect(same).toBe(true);
  const more=d.locator('.referral-more-details');await control(more.locator('summary'));await more.locator('summary').click();await expect(more).toHaveAttribute('open','');await geometry(page,root);await expect(d.locator('.referral-progress-track')).toHaveAttribute('aria-valuenow',mode==='stats'?'3':'0');await expect(d.locator('.referral-progress-track')).toHaveAttribute('aria-valuemax','12');for(const s of ['.referral-progress-heading h3','.referral-progress-heading p','.referral-progress-heading>strong','.referral-progress-section>small'])await textLines(d.locator(s));const steps=d.locator('.referral-steps li');await expect(steps).toHaveCount(3);for(let i=0;i<3;i++)await textLines(steps.nth(i));
  const copy=d.locator('[data-referral-action="copy"]');await control(copy);await copy.click();await expect.poll(()=>page.evaluate(()=>__friendInviteQa.copied.length)).toBe(1);expect(await page.evaluate(()=>__friendInviteQa.copied[0])).toBe(url);await expect(d.locator('.referral-notice')).toHaveText('הקישור הועתק.');const share=d.locator('[data-referral-action="share"]');await control(share);await share.click();await expect.poll(()=>page.evaluate(()=>__friendInviteQa.shared.length)).toBe(1);expect(await page.evaluate(()=>__friendInviteQa.shared[0])).toMatchObject({url,title:'סוגרים חשבון',dialogTitle:'הזמנת חברים'});await control(close);await close.click();await expect(d).toHaveCount(0);await expect(page.locator('#app')).not.toHaveAttribute('inert','');await expect(button).toBeFocused();
 }
 expect(await data(page)).toEqual(before);expect(before.profileWrites).toEqual([]);expect(before.friendWrites).toEqual([]);expect(before.rewardWrites).toEqual([]);
}
for(const mode of ['inactive','active','error','loading','signed-out','custom14','stats','stale'])test('invitation state '+mode,async({page},info)=>journey(page,mode,16,393,852,info));
for(const[id,root,w,h]of [['text20',20,411,852],['text32',32,320,852],['short',32,320,390],['landscape',32,852,393]])test('invitation reflow '+id,async({page},info)=>journey(page,'stats',root,w,h,info));

function invitationContrast(foreground,background){
  const channels=value=>[...value.matchAll(/[0-9.]+/g)].slice(0,3).map(match=>Number(match[0]));
  const luminance=value=>channels(value).map(channel=>{
    const normalized=channel/255;
    return normalized<=.04045?normalized/12.92:((normalized+.055)/1.055)**2.4;
  }).reduce((sum,channel,index)=>sum+channel*[.2126,.7152,.0722][index],0);
  const a=luminance(foreground),b=luminance(background);
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}

async function openContrastInvitation(page,mode,root){
  await page.setViewportSize({width:root===16?393:320,height:852});
  await page.goto('/?requests=empty&reward='+(mode==='stale'?'active':mode)+(root===16?'':'&dynamic-type-preview='+root));
  await page.locator('.product-app-nav [data-nav-destination="profile"]').click();
  const opener=page.locator('#referral-reward-card-profile [data-open-referral-rewards]');
  await profileIdentityReach(opener);
  await clickProfileIdentity(opener);
  const dialog=page.locator('#public-referral-rewards-dialog');
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).fontSize))).toBe(root);
  if(mode==='stale'){
    await page.evaluate(async()=>{__friendInviteQa.rewardMode='error';await SogrimMonetization.refresh()});
    await expect(dialog.locator('.is-stale')).toBeVisible();
  }
  return dialog;
}

for(const root of [16,32]){
  for(const mode of ['signed-out','active','error','stale']){
    test(`invitation ${mode} action keeps readable text and keyboard focus at root ${root}`,async({page})=>{
      const dialog=await openContrastInvitation(page,mode,root);
      const selector=mode==='signed-out'?'[data-referral-action="profile"]'
        :mode==='active'?'[data-referral-action="share"]':'[data-referral-action="retry"]';
      const button=dialog.locator(selector);
      await control(button);
      await page.evaluate(()=>document.fonts.ready);
      await button.hover();
      await control(button);
      const painted=await button.evaluate(el=>{
        const text=el.querySelector('span')||el;
        const box=el.getBoundingClientRect();
        const hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
        return {
          foreground:getComputedStyle(text).color,
          background:getComputedStyle(el).backgroundColor,
          width:box.width,height:box.height,
          reachable:hit===el||el.contains(hit)
        };
      });
      expect(painted.foreground).toMatch(/^rgb\([0-9.]+,\s*[0-9.]+,\s*[0-9.]+\)$/);
      expect(painted.background).toMatch(/^rgb\([0-9.]+,\s*[0-9.]+,\s*[0-9.]+\)$/);
      expect(invitationContrast(painted.foreground,painted.background)).toBeGreaterThanOrEqual(4.5);
      expect(painted.width).toBeGreaterThanOrEqual(44);
      expect(painted.height).toBeGreaterThanOrEqual(44);
      expect(painted.reachable).toBe(true);
      await page.keyboard.press('Tab');
      await button.focus();
      await expect(button).toBeFocused();
      const focus=await button.evaluate(el=>({
        visible:el.matches(':focus-visible'),
        outlineStyle:getComputedStyle(el).outlineStyle,
        outlineWidth:parseFloat(getComputedStyle(el).outlineWidth)
      }));
      expect(focus.visible).toBe(true);
      expect(focus.outlineStyle).not.toBe('none');
      expect(focus.outlineWidth).toBeGreaterThan(0);
      const focusedColors=await button.evaluate(el=>({
        foreground:getComputedStyle(el.querySelector('span')||el).color,
        background:getComputedStyle(el).backgroundColor
      }));
      expect(focusedColors.foreground).toMatch(/^rgb\([0-9.]+,\s*[0-9.]+,\s*[0-9.]+\)$/);
      expect(focusedColors.background).toMatch(/^rgb\([0-9.]+,\s*[0-9.]+,\s*[0-9.]+\)$/);
      expect(invitationContrast(focusedColors.foreground,focusedColors.background)).toBeGreaterThanOrEqual(4.5);
    });
  }
}
