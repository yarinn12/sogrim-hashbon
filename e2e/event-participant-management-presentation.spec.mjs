import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {openRenderedHome} from './helpers/typographyReadiness.mjs';
import {installSyntheticSystemText} from './helpers/accessibilityPresentation.mjs';
import {paint,pointClick,settled} from './helpers/eventNotesBatchPresentation.mjs';

const fixture=readFileSync(new URL('./fixtures/eventNotesBatchBootstrap.js',import.meta.url),'utf8');
const owner='account-11111111-1111-4111-8111-111111111111',account='account-22222222-2222-4222-8222-222222222222',offline='saved-manual-yael';
const evidence=new WeakMap();
test.use({serviceWorkers:'block'});
test.beforeEach(async({page})=>{
 const record={errors:[],external:[],baselineServed:0};evidence.set(page,record);
 page.on('pageerror',e=>record.errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(record.external.push(r.request().url()),r.abort()));
 if(process.env.PARTICIPANT_BASELINE_LEDGER)await page.route(/\/src\/publicLedgerWorkspaceLayer\.mjs(?:\?|$)/,r=>{record.baselineServed++;return r.fulfill({contentType:'text/javascript',body:readFileSync(process.env.PARTICIPANT_BASELINE_LEDGER,'utf8')})});
 await page.addInitScript({content:fixture});
});
test.afterEach(async({page})=>{const r=evidence.get(page);expect(r.errors).toEqual([]);expect(r.external).toEqual([]);if(process.env.PARTICIPANT_BASELINE_LEDGER)expect(r.baselineServed).toBeGreaterThan(0)});
async function start(page,{width=393,height=852,root=16,query='',system=false}={}){
 if(system)await page.addInitScript(installSyntheticSystemText);
 await page.setViewportSize({width,height});await openRenderedHome(page,{path:'/?participants-batch=1&requests=accepted&reward=inactive'+(!system&&root>16?'&dynamic-type-preview='+root:'')+query,bootTimeoutMs:30000,readyTimeoutMs:8000});
 await pointClick(page.locator('.product-home-screen .event-list [data-action="open-event"][data-event-id="friend-weekend"]'));
 await pointClick(page.locator('[data-action="open-event-participants"]'));
 const roster=page.locator('.event-participant-roster-modal');await expect(roster).toBeVisible();await paint(page);await settled(page);return{page,roster,root:system?32:root};
}
async function detail(x,id){await pointClick(x.page.locator('.event-participant-roster-row[data-participant-id="'+id+'"]'));const v=x.page.locator('.event-participant-management-modal');await expect(v).toBeVisible();await expect(v.locator('#event-modal-title')).toHaveText('פרטי משתתף');await paint(x.page);return v}
async function back(page,scope){await pointClick(scope.locator('[data-action="event-participants-back"]'));await paint(page)}
async function geometry(x,scope,specs){
 await paint(x.page);
 const m=await scope.evaluate((modal,specs)=>{
  let lines=0;const bad=[],fonts=[];const owner=modal;
  for(const [s,ratio]of specs)for(const e of modal.querySelectorAll(s)){
   const range=document.createRange();range.selectNodeContents(e);fonts.push({s,ratio,size:parseFloat(getComputedStyle(e).fontSize)});
   for(let i=0;i<range.getClientRects().length;i++){
    let r=range.getClientRects()[i];if(!r.width||!r.height)continue;
    const frame=owner.getBoundingClientRect();owner.scrollTop+=r.top-(frame.top+frame.bottom)/2;r=range.getClientRects()[i];
    const host=owner.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);lines++;
    if(r.left<-.5||r.right>innerWidth+.5||r.top<Math.max(0,host.top)-1.5||r.bottom>Math.min(innerHeight,host.bottom)+1.5||!(hit&&(hit===e||e.contains(hit))))bad.push({s,text:e.textContent,line:i});
   }
  }
  return{bad,fonts,lines,overflow:document.documentElement.scrollWidth-innerWidth,localOverflow:modal.scrollWidth-modal.clientWidth};
 },[['.event-modal-header h2',1.5],['#event-modal-description',.8125],...specs]);
 expect(m.bad).toEqual([]);expect(m.lines).toBeGreaterThan(0);expect(m.overflow).toBe(0);expect(m.localOverflow).toBe(0);
 for(const f of m.fonts)expect(f.size,f.s).toBe(x.root*f.ratio);
 for(const button of await scope.locator('button').all())if(await button.isVisible()){const b=await button.boundingBox();expect(b.width).toBeGreaterThanOrEqual(44);expect(b.height).toBeGreaterThanOrEqual(44)}
 const last=scope.locator('button').last();await last.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));
 expect(await last.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return!!hit&&e.contains(hit)})).toBe(true);
 await paint(x.page);
}
const rosterSpecs=[['.event-participant-count',.875],['.event-participant-person-copy>strong',1],['.participant-username',.8125]];
const detailSpecs=[['.event-participant-management-identity strong',1.25],['.event-participant-management-copy strong',1],['.event-participant-management-copy small',.8125],['.participant-detail-explanation',.875]];
const linkSpecs=[['.event-participant-link-intro p',.875],['.participant-account-list-label',.875],['.event-participant-link-candidate strong',1]];
test('enlarged participant names and count honor the requested text size before any navigation',async({page})=>{
 const x=await start(page,{width:320,root:32});await expect(x.roster.locator('.event-participant-person-copy>strong').first()).toHaveCSS('font-size','32px');await expect(x.roster.locator('.event-participant-count')).toHaveCSS('font-size','28px');
});
async function unchangedMoney(page){
 const result=await page.evaluate(()=>{const q=__friendInviteQa,keys=['currency','expenses','transfers','notes','createdByParticipantId','locked'];const bad=s=>s.events.some(e=>{const before=q.seedFinancialEvents.find(x=>x.id===e.id);return !before||keys.some(k=>JSON.stringify(e[k])!==JSON.stringify(before[k]))});const saved=JSON.parse(localStorage.getItem('qa-invite-server-row')).state;return{canonical:q.canonicalWrites.some(bad),personal:q.snapshotWrites.some(w=>bad((Array.isArray(w.body)?w.body[0]:w.body).state)),saved:bad(saved),rewards:q.rewardWrites.length,profile:q.profileWrites.length}});
 expect(result).toEqual({canonical:false,personal:false,saved:false,rewards:0,profile:0});
}
for(const [name,width,height,root,system]of[['normal',393,852,16,false],['narrow',320,852,16,false],['enlarged',320,852,32,false],['landscape',568,360,32,false],['system-text',320,390,32,true]])test('participant four-screen navigation and real glyph reflow '+name,async({page})=>{
 const x=await start(page,{width,height,root,system});await geometry(x,x.roster,rosterSpecs);await expect(x.roster.locator('.event-participant-roster-row')).toHaveCount(4);await expect(x.roster).not.toContainText('לחצו על שם לניהול');
 let v=await detail(x,account);await geometry(x,v,detailSpecs);await expect(v.locator('.eyebrow')).toHaveCount(0);await expect(v).not.toContainText('הישארו בקשר גם אחרי האירוע');await back(page,v);await expect(x.roster).toBeVisible();
 v=await detail(x,offline);await expect(v.locator('.participant-detail-explanation')).toContainText('אין גישה לאירוע');await geometry(x,v,detailSpecs);await pointClick(v.locator('[data-action="open-event-participant-link"]'));
 const link=page.locator('.event-participant-link-modal');await expect(link).toBeVisible();await expect(link.locator('.event-participant-link-candidate')).toHaveCount(3);await expect(link).not.toContainText('משתמש בסוגרים חשבון');await geometry(x,link,linkSpecs);await back(page,link);await expect(v).toBeVisible();await back(page,v);await expect(x.roster).toBeVisible();await settled(page);await unchangedMoney(page);
});
test('long names and roster search remain readable and reversible at 200 percent',async({page})=>{
 const x=await start(page,{width:320,root:32,query:'&participants-many=1&long-names=1&settings-long-title=1'});await geometry(x,x.roster,rosterSpecs);
 const input=x.roster.locator('[name="eventParticipantSearch"]');await input.fill('משתתף נוסף 7');await expect(x.roster.locator('.event-participant-roster-row:visible')).toHaveCount(1);await input.fill('לא קיים');await expect(x.roster.locator('[data-participant-search-empty]')).toBeVisible();await input.fill('');await expect(x.roster.locator('.event-participant-roster-row:visible')).toHaveCount(12);await unchangedMoney(page);
});
test('read-only participants retain disabled admin and offline-link controls',async({page})=>{
 const x=await start(page,{root:32,width:320,query:'&settings-readonly=1'});await expect(x.roster.locator('[data-action="open-event-participant-add"]')).toBeDisabled();
 let v=await detail(x,account);await expect(v.locator('[data-action="toggle-event-participant-admin"]')).toBeDisabled();await expect(v.locator('[data-action="remove-event-participant"]')).toHaveCount(0);await back(page,v);
 v=await detail(x,offline);await expect(v.locator('[data-action="open-offline-participant-rename"]')).toBeDisabled();await expect(v.locator('[data-action="open-event-participant-link"]')).toBeDisabled();await expect(v.locator('[data-action="remove-event-participant"]')).toHaveCount(0);await unchangedMoney(page);
});
test('admin toggle waits for canonical ACK then persists the exact scoped grant and revoke',async({page})=>{
 const x=await start(page);let v=await detail(x,account);await page.evaluate(()=>__friendInviteQa.participantWriteMode='hold');
 await pointClick(v.locator('.is-admin-control'));await expect.poll(()=>page.evaluate(()=>__friendInviteQa.participantAttempts.length)).toBeGreaterThan(0);await expect(v).toContainText('שומרים את הרשאת הניהול');
 expect(await page.evaluate(()=>__friendInviteQa.canonicalSnapshot.state.events[0].adminIds)).toEqual([owner]);await page.evaluate(()=>__friendInviteQa.releaseParticipantWrite());
 await expect(v).toContainText('הוגדר כמנהל אירוע');await settled(page);
 await expect.poll(()=>page.evaluate(id=>{const q=__friendInviteQa,p=JSON.parse(localStorage.getItem('qa-invite-server-row')).state.events[0];return q.canonicalSnapshot.state.events[0].adminIds.includes(id)&&p.adminIds.includes(id)&&q.canonicalRequests.some(r=>r.p_snapshot_id==='synthetic-share-event-space'&&r.p_state.events[0].adminIds.includes(id))},account)).toBe(true);
 await pointClick(v.locator('.is-admin-control'));await expect(v).toContainText('הרשאת הניהול של');await settled(page);expect(await page.evaluate(()=>__friendInviteQa.canonicalSnapshot.state.events[0].adminIds)).toEqual([owner]);await unchangedMoney(page);
});
test('rejected admin grant restores the original control and never announces success',async({page})=>{
 const x=await start(page);const v=await detail(x,account);await page.evaluate(()=>__friendInviteQa.participantWriteMode='reject');await pointClick(v.locator('.is-admin-control'));
 await expect(v).toContainText('לא הצלחנו לשנות את הרשאת הניהול');await expect(v.locator('[data-action="toggle-event-participant-admin"]')).not.toBeChecked();await expect(v).not.toContainText('הוגדר כמנהל אירוע');expect(await page.evaluate(()=>__friendInviteQa.canonicalSnapshot.state.events[0].adminIds)).toEqual([owner]);await unchangedMoney(page);
});
test('account-link confirmation can be cancelled by Escape without writing identities or money',async({page})=>{
 const x=await start(page,{root:32,width:320});let v=await detail(x,offline);await pointClick(v.locator('[data-action="open-event-participant-link"]'));const link=page.locator('.event-participant-link-modal');await expect(link).toBeVisible();
 const candidate=link.locator('[data-action="link-offline-participant-account"][data-target-participant-id="'+account+'"]');await pointClick(candidate);const dialog=page.locator('.important-action-dialog[data-important-action-kind="merge-participants"]');await expect(dialog).toBeVisible();await expect(dialog).toContainText('יעל ישראלי');await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(candidate).toBeFocused();await settled(page);await unchangedMoney(page);
 expect(await page.evaluate(()=>__friendInviteQa.canonicalSnapshot.state.events[0].participantIds)).toContain(offline);
});
test('offline rename and removal dialogs both cancel back into the correct participant',async({page})=>{
 const x=await start(page);const v=await detail(x,offline);await pointClick(v.locator('[data-action="open-offline-participant-rename"]'));const rename=page.locator('.event-modal:has(.event-participant-rename-card)');await expect(rename).toBeVisible();await pointClick(rename.getByRole('button',{name:'ביטול',exact:true}));await expect(v).toContainText('יעל ישראלי');
 await pointClick(v.locator('[data-action="remove-event-participant"]'));const dialog=page.locator('.important-action-dialog[data-important-action-kind="remove-event-participant"]');await expect(dialog).toBeVisible();await pointClick(dialog.locator('[data-action="cancel-important-action"]'));await expect(v).toBeVisible();await settled(page);await unchangedMoney(page);
});
