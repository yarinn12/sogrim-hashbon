import {test,expect} from '@playwright/test';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import * as homeFinal from './helpers/homeArchivePresentation.mjs';
import * as profileFinal from './helpers/profileFriendsCardsPresentation.mjs';
import {alignPaintedTarget,paintedTargetIsReachable} from './helpers/paintedTarget.mjs';
import * as deletionFinal from './helpers/accountDeletionGeometry.mjs';

// Explicit local OLD-code evidence only; normal CI always imports the final helpers.
const baseline=process.env.PAINTED_TARGET_BASELINE_ROOT;
const home=baseline?await import(pathToFileURL(join(baseline,'e2e/helpers/homeArchivePresentation.mjs')).href):homeFinal;
const profile=baseline?await import(pathToFileURL(join(baseline,'e2e/helpers/profileFriendsCardsPresentation.mjs')).href):profileFinal;
const deletion=process.env.PAINTED_DIALOG_BASELINE_MODULE
  ?await import(pathToFileURL(process.env.PAINTED_DIALOG_BASELINE_MODULE).href):deletionFinal;

test('painted target: nested page scroll reaches the visible glyph below fixed controls',async({page})=>{
  await page.setViewportSize({width:568,height:360});
  await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;overflow:hidden}.pane{height:360px;overflow:auto;overflow-anchor:none}.before{height:500px}.after{height:700px}.event-row-action{display:block;position:relative;width:100%;height:600px;padding:0;border:0}.event-row-options-chevron{position:absolute;top:140px;left:24px;width:20px;height:20px}.product-route-controls{position:fixed;top:0;left:0;width:100%;height:80px;z-index:4}.product-route-controls button{width:100%;height:80px}.nav{position:fixed;bottom:0;left:0;width:100%;height:190px;z-index:4}</style><div class="pane"><div class="before"></div><button class="event-row-action" data-action="event-status-select" onclick="window.clicked=(window.clicked||0)+1"><span class="event-row-options-chevron">…</span></button><div class="after"></div></div><div class="product-route-controls"><button>Header</button></div><nav class="nav" aria-label="ניווט ראשי"></nav>`);
  await home.homeArchiveClick(page,page.locator('.event-row-action'));
  expect(await page.evaluate(()=>window.clicked)).toBe(1);
  expect(await page.evaluate(()=>scrollY)).toBe(0);
  expect(await page.locator('.pane').evaluate(e=>e.scrollTop)).toBeGreaterThan(0);
});

test('painted target: a visible fixed control keeps the background scroll position',async({page})=>{
  await page.setViewportSize({width:568,height:360});
  await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;height:2000px}.target{position:fixed;top:0;right:0;width:100px;height:44px;padding:0;border:0}.product-route-controls{position:fixed;top:0;left:0}.product-route-controls button{width:80px;height:80px}</style><button class="target" onclick="window.clicked=(window.clicked||0)+1">Target</button><div class="product-route-controls"><button>Header</button></div>`);
  await page.evaluate(()=>window.scrollTo(0,500));
  const before=await page.evaluate(()=>scrollY);
  expect(before).toBe(500);
  await home.homeArchiveClick(page,page.locator('.target'));
  expect(await page.evaluate(()=>window.clicked)).toBe(1);
  expect(await page.evaluate(()=>scrollY)).toBe(before);
});

test('painted target: a tight clipping label scrolls above navigation without artificial padding',async({page})=>{
  await page.setViewportSize({width:568,height:360});
  await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;height:2000px}.before{height:600px}.clip{width:100px;height:72px;overflow:hidden}.target{display:block;width:100px;height:72px;border:0;padding:0}.product-route-controls{position:fixed;top:0;left:0}.product-route-controls button{height:80px;width:80px}.nav{position:fixed;bottom:0;left:0;width:100%;height:190px}</style><div class="before"></div><div class="clip"><button class="target" onclick="window.clicked=(window.clicked||0)+1">Target</button></div><div class="product-route-controls"><button>Header</button></div><nav class="nav" aria-label="ניווט ראשי"></nav>`);
  await home.homeArchiveClick(page,page.locator('.target'));
  expect(await page.evaluate(()=>window.clicked)).toBe(1);
  expect(await page.locator('.clip').evaluate(e=>e.scrollTop)).toBe(0);
  const box=await page.locator('.target').boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(80);expect(box.y+box.height).toBeLessThanOrEqual(170);
});

test('painted target: fixed menu corrects scroll after content grows',async({page})=>{
  await page.setViewportSize({width:568,height:360});
  await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;overflow:hidden}.event-status-menu{position:fixed;top:30px;left:80px;width:400px;height:300px;overflow:auto;overflow-anchor:none;z-index:2}.before{height:500px}.after{height:300px}.target{display:block;width:100%;height:56px}.nav{position:fixed;bottom:0;height:30px;width:100%}</style><section class="event-status-menu"><div class="before"></div><button class="target" onclick="window.clicked=(window.clicked||0)+1">Cancel</button><div class="after"></div></section><nav class="nav" aria-label="ניווט ראשי"></nav>`);
  await page.locator('.event-status-menu').evaluate(menu=>menu.addEventListener('scroll',()=>{if(!window.grew){window.grew=true;menu.querySelector('.before').style.height='1400px'}},{once:true}));
  await profile.presentationClick(page,page.locator('.target'));
  expect(await page.evaluate(()=>window.grew)).toBe(true);
  expect(await page.evaluate(()=>window.clicked)).toBe(1);
  expect(await page.evaluate(()=>scrollY)).toBe(0);
});

test('painted target: hidden overflow and persistent overlays remain unreachable',async({page})=>{
  await page.setViewportSize({width:568,height:360});
  await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;overflow:hidden}.event-status-menu{height:300px;overflow:hidden}.before{height:900px}.target{width:100px;height:44px}.nav{position:fixed;bottom:0;height:30px}</style><section class="event-status-menu"><div class="before"></div><button class="target">Hidden</button></section><nav class="nav" aria-label="ניווט ראשי"></nav>`);
  const hidden=await page.locator('.target').evaluate(alignPaintedTarget);
  expect(paintedTargetIsReachable(hidden,43.99)).toBe(false);
  expect(await page.locator('.event-status-menu').evaluate(e=>e.scrollTop)).toBe(0);
  await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}.target{width:100px;height:44px}.cover{position:fixed;inset:0;z-index:99}</style><button class="target">Covered</button><div class="cover"></div>`);
  const covered=await page.locator('.target').evaluate(alignPaintedTarget);
  expect(covered.hit).toBe(false);expect(paintedTargetIsReachable(covered,43.99)).toBe(false);
});

test('painted target: late dialog motion is not mistaken for final geometry',async({page})=>{
  await page.setViewportSize({width:568,height:390});
  await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html{font-size:16px}body{margin:0}.account-delete-dialog{position:fixed;top:14px;left:14px;width:540px;height:362px;box-sizing:border-box;padding:20px;background:white}.account-delete-actions{position:static}</style><section class="account-delete-dialog"><h2>Delete?</h2><div id="account-delete-description"><p>Only synthetic data.</p></div><label class="account-delete-confirmation"><span>Confirm</span></label><div class="account-delete-actions"><button>Cancel</button></div></section>`);
  const dialog=page.locator('.account-delete-dialog');
  await dialog.evaluate(e=>e.animate([{transform:'translateY(12px)'},{transform:'none'}],{duration:500,fill:'none'}));
  const geometry=await deletion.readFinalAccountDeletionGeometry(dialog,390);
  expect(geometry.transformFinal).toBe(true);expect(geometry.top).toBeGreaterThanOrEqual(13);expect(geometry.bottom).toBeLessThanOrEqual(377);
});

test('painted target: a permanently displaced dialog still fails its final-pose guard',async({page})=>{
  await page.setViewportSize({width:568,height:390});
  await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html{font-size:16px}.account-delete-dialog{position:fixed;top:14px;left:14px;width:540px;height:362px;transform:translateY(12px)}</style><section class="account-delete-dialog"><h2>Delete?</h2><p id="account-delete-description">Synthetic</p><label class="account-delete-confirmation"><span>Confirm</span></label><div class="account-delete-actions"><button>Cancel</button></div></section>`);
  await expect(deletionFinal.readFinalAccountDeletionGeometry(page.locator('.account-delete-dialog'),390)).rejects.toThrow(/toBe/);
});
