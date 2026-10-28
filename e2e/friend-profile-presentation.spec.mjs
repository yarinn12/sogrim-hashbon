import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {geometry} from './helpers/friendProfilePresentation.mjs';
import {installSyntheticSystemText} from './helpers/accessibilityPresentation.mjs';

const fixture = readFileSync(new URL('./fixtures/friendProfileBootstrap.js', import.meta.url), 'utf8');
const evidence = new WeakMap();
test.use({serviceWorkers:'block'});
test.beforeEach(async ({page}) => {
  const record = {errors:[], external:[]};
  evidence.set(page,record);
  page.on('pageerror', error => record.errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : (record.external.push(route.request().url()), route.abort()));
  await page.addInitScript({content:fixture});
  for (const [env,file] of [['FRIEND_PROFILE_TEST_APP','app.mjs'],['FRIEND_PROFILE_TEST_LEDGER','publicLedgerWorkspaceLayer.mjs']]) {
    if (process.env[env]) await page.route('**/src/'+file+'*', route => route.fulfill({contentType:'text/javascript',body:readFileSync(process.env[env],'utf8')}));
  }
});
test.afterEach(async ({page}) => {
  expect(evidence.get(page).errors).toEqual([]);
  expect(evidence.get(page).external).toEqual([]);
  const result = await page.evaluate(() => ({
    profile:__friendInviteQa.profileWrites.length,
    friends:__friendInviteQa.writes.length,
    reward:__friendInviteQa.rewardWrites.length,
    deletion:__friendInviteQa.deletionRequests?.length ?? 0,
    changedFinancialPayloads:__friendInviteQa.snapshotWrites.filter(write => {
      const row = Array.isArray(write.body) ? write.body[0] : write.body;
      return row.state && JSON.stringify(row.state.events) !== JSON.stringify(__friendInviteQa.seedFinancialEvents);
    }).length
  }));
  expect(result).toEqual({profile:0,friends:0,reward:0,deletion:0,changedFinancialPayloads:0});
});
async function open(page,root=16,query='') {
  await page.goto('/?requests=accepted&reward=inactive'+(root>16?'&dynamic-type-preview='+root:'')+query);
  await page.locator('.product-app-nav [data-nav-destination="friends"]').press('Enter');
  await page.locator('[data-action="open-participant-statistics"][data-participant-id="account-22222222-2222-4222-8222-222222222222"]').press('Enter');
  await expect(page.locator('[data-friend-profile-id]')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
test('friend profile identity grows with enlarged text instead of staying18px',async ({page}) => {
  await page.setViewportSize({width:320,height:852});
  await open(page,32);
  await expect.poll(() => page.locator('.relationship-identity-copy > strong').evaluate(e => parseFloat(getComputedStyle(e).fontSize))).toBe(36);
  await expect.poll(() => page.locator('.friend-activity-values strong').first().evaluate(e => parseFloat(getComputedStyle(e).fontSize))).toBe(48);
});
for (const [name,root,width,height,query] of [
  ['normal',16,393,852,''], ['text20',20,360,740,''], ['text32',32,320,852,''],
  ['short',32,320,390,''], ['landscape',32,852,393,''], ['long',32,320,852,'&qa-long-name=1']
]) test('friend profile presentation '+name,async ({page},info) => {
  await page.setViewportSize({width,height});
  await open(page,root,query);
  const screen = page.locator('[data-friend-profile-id]');
  await expect(screen.locator('h1')).toHaveText('פרטי חבר');
  await expect(screen.locator('.relationship-duo,.relationship-comparison-leader,progress')).toHaveCount(0);
  await expect(screen.locator('.friend-activity-overview .friend-activity-values strong')).toHaveText(['₪420.00','₪240.00','2','2']);
  await geometry(page,root);
  await page.evaluate(() => scrollTo(0,0));
  await page.screenshot({path:info.outputPath(name+'-top.png'),animations:'disabled'});
  const details = screen.locator('.friend-activity-more');
  await expect(details).not.toHaveAttribute('open','');
  await details.locator('summary').evaluate(e => e.scrollIntoView({block:'center',behavior:'instant'}));
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open','');
  await expect(screen.locator('.friend-activity-values strong')).toHaveText(['₪420.00','₪240.00','2','2','7','4']);
  await expect(screen.locator('.relationship-facts')).toContainText('3 אירועים');
  await geometry(page,root);
  await details.locator('summary').press('Enter');
  await expect(details).not.toHaveAttribute('open','');
  const safety = screen.locator('.relationship-safety-management');
  await safety.locator('summary').press('Enter');
  await expect(safety).toHaveAttribute('open','');
  await expect(safety.locator('p')).toHaveText('חסימה מונעת בקשות חברות חדשות. האירועים וההוצאות המשותפים נשארים בהיסטוריה.');
  await expect(safety.locator('[data-action="block-connected-user"]')).toBeVisible();
  await geometry(page,root);
  await page.getByRole('button',{name:'חזרה למסך הקודם',exact:true}).press('Enter');
  await expect(page.getByRole('heading',{name:'חברים',exact:true})).toBeVisible();
});
test('friend profile with no history shows one explanation and no zero dashboard',async ({page}) => {
  await page.setViewportSize({width:320,height:390});
  await open(page,32,'&empty-history=1');
  await expect(page.locator('.friend-activity-empty h2')).toHaveText('עדיין אין הוצאות משותפות');
  await expect(page.locator('.friend-activity-metric,.friend-activity-more')).toHaveCount(0);
  await geometry(page,32);
});
test('friend profile respects system text and restores it after an app preference',async ({page}) => {
  await page.setViewportSize({width:320,height:390});
  await page.addInitScript(installSyntheticSystemText);
  await open(page);
  await geometry(page,32);
  const accessibility = page.locator('.product-route-controls [data-open-accessibility]');
  await accessibility.click();
  await page.locator('.accessibility-segmented-control label:has(input[value="extra-large"])').click();
  await page.keyboard.press('Escape');
  await geometry(page,20);
  await accessibility.click();
  await page.locator('.accessibility-segmented-control label:has(input[value="system"])').click();
  await page.keyboard.press('Escape');
  await geometry(page,32);
});
