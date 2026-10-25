import {test,expect} from '@playwright/test';
import {personalPinsCloud} from './helpers/personalPinsCloud.mjs';
import {seed} from './helpers/closedSummaryFixture.mjs';
test.use({serviceWorkers:'block'});
const sizes=[['.friend-row-name > strong',.9375],['.friend-identity-heading strong',.9375],['.friend-privacy-summary-label',.75],['#referral-reward-card-friends .referral-reward-copy > strong',.875]];
async function setup(page,baseURL,{root=16,w=393,h=852,system=false,long=false,empty=false,many=false}={}){
 await page.setViewportSize({width:w,height:h});
 if(root>16&&!system)await page.addInitScript(root=>{const u=new URL(location.href);u.searchParams.set('dynamic-type-preview',root);history.replaceState(history.state,'',u)},root);
 if(system)await page.addInitScript(()=>{const supports=CSS.supports.bind(CSS);CSS.supports=(...a)=>a[0]==='font'&&a[1]==='-apple-system-body'?true:supports(...a);const media=matchMedia.bind(window);window.matchMedia=q=>{const m=media(q);return q.replaceAll(' ','')==='(any-pointer:coarse)'?{matches:true,media:q,addEventListener:m.addEventListener.bind(m),removeEventListener:m.removeEventListener.bind(m),addListener:m.addListener.bind(m),removeListener:m.removeListener.bind(m)}:m};const insert=()=>{const s=document.createElement('style');s.id='friends-system-text-fixture';s.textContent='#apple-system-body-size-probe{font-size:34px!important}';document.head.append(s)};if(document.head)insert();else document.addEventListener('DOMContentLoaded',insert,{once:true})});
 const state=seed();if(many)state.participants.push(...['נועם רז','רונית הדר','תמר שחר'].map((displayName,i)=>({id:'extra-friend-'+i,displayName,kind:'guest'})));if(long)state.participants[1].displayName='דנה אלכסנדרה לוי ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';state.friendContacts=empty?[]:state.participants.slice(1).map(p=>({id:'contact-'+p.id,participantId:p.id,active:true,source:'offline'}));
 const cloud=await personalPinsCloud(page,baseURL,state,{accountId:'friends-text-owner',profileUpdatedAt:'2026-09-03T08:00:00.000Z'});
 await page.getByRole('button',{name:'חברים',exact:true}).click();await expect(page.getByRole('heading',{name:'חברים',exact:true})).toBeVisible();await page.evaluate(()=>document.fonts.ready);await expect.poll(()=>page.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).fontSize))).toBe(root);return cloud;
}
async function flatRoster(page){
 await expect(page.locator('.friends-hub-screen > .top .muted')).toHaveCount(0);
 const lists=await page.locator('.friend-identity-section:visible').evaluateAll(es=>es.map(section=>{
  const heading=section.querySelector('.friend-identity-heading'),list=section.querySelector('.friend-list'),cs=getComputedStyle(section),hs=getComputedStyle(heading),ls=getComputedStyle(list);
  return {border:cs.borderWidth,radius:cs.borderRadius,shadow:cs.boxShadow,headingBackground:hs.backgroundColor,headingBorder:hs.borderWidth,headingAboveList:heading.getBoundingClientRect().bottom<=list.getBoundingClientRect().top+1,marker:getComputedStyle(heading.querySelector('.friend-identity-marker')).display,listBorder:ls.borderTopWidth,listShadow:ls.boxShadow,rows:[...list.querySelectorAll('.friend-row:not([hidden])')].map(e=>{const s=getComputedStyle(e);return {radius:s.borderRadius,shadow:s.boxShadow,borderTop:s.borderTopWidth,borderBottom:s.borderBottomWidth}})}
 }));
 for(const list of lists){expect(list.border).toBe('0px');expect(list.radius).toBe('0px');expect(list.shadow).toBe('none');expect(list.headingBackground).toBe('rgba(0, 0, 0, 0)');expect(list.headingBorder).toBe('0px');expect(list.headingAboveList).toBe(true);expect(list.marker).toBe('none');expect(list.listBorder).toBe('1px');expect(list.listShadow).toBe('none');list.rows.forEach((row,i)=>{expect(row.radius).toBe('0px');expect(row.shadow).toBe('none');expect(row.borderTop,'Only separators between visible rows should remain').toBe(i?'1px':'0px');expect(row.borderBottom).toBe('0px')})}
}
async function privacyPresentation(page){
 const note=page.locator('.friends-people-panel > .friend-privacy-note:not(.blocked-users-panel)'),summary=note.locator('summary');
 const geometry=await note.evaluate(e=>{const summary=e.querySelector('summary'),label=e.querySelector('.friend-privacy-summary-label'),path=e.querySelector('svg path'),roster=document.querySelector('[data-friends-roster]'),r=summary.getBoundingClientRect();return {gap:label.getBoundingClientRect().left-path.getBoundingClientRect().right,rosterGap:r.top-roster.getBoundingClientRect().bottom,width:r.width,height:r.height}});
 expect(geometry.gap,'privacy chevron must stay next to its text, not at the far screen edge').toBeGreaterThanOrEqual(0);expect(geometry.gap).toBeLessThanOrEqual(16);
 expect(geometry.rosterGap,'privacy help must remain attached directly below the roster').toBeGreaterThanOrEqual(-1);expect(geometry.rosterGap).toBeLessThanOrEqual(1);expect(geometry.width).toBeGreaterThanOrEqual(44);expect(geometry.height).toBeGreaterThanOrEqual(44);
 await reachable(summary);await summary.click();await expect(note).toHaveAttribute('open','');
 const fits=await note.locator('p').evaluate(e=>{const own=e.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(e);return [...range.getClientRects()].every(r=>r.left>=own.left-1&&r.right<=own.right+1)});expect(fits,'expanded privacy text must wrap within its own content width').toBe(true);
 await reachable(summary);await summary.press('Enter');await expect(note).not.toHaveAttribute('open','');await expect(summary).toBeFocused();
}
async function glyphs(page,root,{empty=false}={}){
 await flatRoster(page);
 await privacyPresentation(page);
 for(const [selector,ratio] of sizes){if(empty&&selector.startsWith('.friend-')){if(selector!=='.friend-privacy-summary-label')continue;}
 const xs=page.locator(selector);await expect(xs.first()).toBeVisible();const values=await xs.evaluateAll(es=>es.map(e=>{const own=e.getBoundingClientRect(),walk=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),leaves=[],bad=[];let n;while(n=walk.nextNode())for(let i=0;i<n.length;i++){if(!n.textContent[i].trim())continue;const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+1);for(const g of r.getClientRects())if(g.width&&g.height){leaves.push(parseFloat(getComputedStyle(n.parentElement).fontSize));if(g.left<own.left-1||g.right>own.right+1||g.top<own.top-1||g.bottom>own.bottom+1)bad.push(n.textContent[i]);}}return{font:parseFloat(getComputedStyle(e).fontSize),leaves,bad,text:e.textContent.trim()}}));for(const x of values){expect(x.font,selector+' must scale its real leaf text').toBeCloseTo(root*ratio,2);expect(x.leaves.length).toBeGreaterThan(0);for(const f of x.leaves)expect(f).toBeCloseTo(root*ratio,2);expect(x.bad,'wrapped glyphs must fit their own text box: '+selector).toEqual([]);}
 }
 if(!empty){
  const captions=page.locator('.friend-row-copy > small');
  await expect(captions).toHaveText(['1 אירוע משותף','1 אירוע משותף']);
  const values=await captions.evaluateAll(es=>es.map(e=>{const own=e.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(e);return {font:parseFloat(getComputedStyle(e).fontSize),fits:[...range.getClientRects()].every(r=>r.left>=own.left-1&&r.right<=own.right+1&&r.top>=own.top-1&&r.bottom<=own.bottom+1)}}));
  for(const value of values){expect(value.fits,'shared-event caption glyphs must reflow within their own box').toBe(true);expect(value.font).toBeGreaterThanOrEqual(root>16?13:12)}
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth)).toBe(false);
}
async function reachable(locator){
 // Match a user's scroll into the usable space between floating Back controls
 // and persistent navigation. scrollIntoViewIfNeeded alone only considers the
 // viewport and can leave an already-visible control behind a fixed overlay.
 await locator.evaluate(e=>{
  e.scrollIntoView({block:'center',behavior:'instant'});
  const back=document.querySelector('[aria-label="ניווט מהיר"]')?.getBoundingClientRect();
  const nav=document.querySelector('.product-app-nav')?.getBoundingClientRect();
  const top=Math.max(0,back?.bottom||0)+8,bottom=Math.min(innerHeight,nav?.top??innerHeight)-8;
  const r=e.getBoundingClientRect();window.scrollBy({top:r.top+r.height/2-(top+bottom)/2,behavior:'instant'});
 });
 const read=()=>locator.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {w:r.width,h:r.height,hit:e.contains(hit),cover:hit?.outerHTML.slice(0,160),top:r.top,bottom:r.bottom,height:innerHeight}});
 await expect.poll(async()=>(await read()).hit,{message:'The actual touch center must be clear after user scrolling'}).toBe(true);
 const v=await read();expect(v.w).toBeGreaterThanOrEqual(44);expect(v.h).toBeGreaterThanOrEqual(44);expect(v.top).toBeGreaterThanOrEqual(0);expect(v.bottom).toBeLessThanOrEqual(v.height);expect(v.hit,JSON.stringify(v)).toBe(true);
}
for(const c of [{name:'normal',root:16},{name:'enlarged long names',root:32,w:320,long:true},{name:'short text',root:20,w:393,h:390},{name:'short enlarged',root:32,w:320,h:390,long:true},{name:'system text at startup',root:32,system:true}])test('friend glyph scaling and trash confirmation '+c.name,async({page,baseURL})=>{
 const cloud=await setup(page,baseURL,c),before=cloud.state();await glyphs(page,c.root);const buttons=page.locator('.friend-remove-button');await expect(buttons).toHaveCount(2);await expect(buttons.first().locator('svg path').first()).toHaveAttribute('d','M4 7h16');await reachable(buttons.first());await buttons.first().click();const d=page.locator('.important-action-dialog');await expect(d).toBeVisible();await expect(d).toContainText('השם יישאר באירועים ובהוצאות קיימים');await d.locator('[data-action="cancel-important-action"]').click();await expect(d).toBeHidden();await expect(buttons).toHaveCount(2);await reachable(page.locator('#referral-reward-card-friends'));expect(cloud.state()).toEqual(before);expect(cloud.errors).toEqual([]);
});
test('friend text survives reload rotation and resetting to normal size',async({page,baseURL})=>{
 const cloud=await setup(page,baseURL,{root:32,w:320,long:true,system:true}),before=cloud.state();await glyphs(page,32);await cloud.reload();await page.getByRole('button',{name:'חברים',exact:true}).click();await glyphs(page,32);await page.setViewportSize({width:852,height:320});await glyphs(page,32);await reachable(page.locator('#referral-reward-card-friends'));await page.evaluate(()=>{document.getElementById('friends-system-text-fixture').textContent='#apple-system-body-size-probe{font-size:17px!important}';window.dispatchEvent(new Event('resize'))});await expect.poll(()=>page.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).fontSize))).toBe(16);await page.setViewportSize({width:393,height:852});await glyphs(page,16);expect(cloud.state()).toEqual(before);expect(cloud.errors).toEqual([]);
});
test('empty friends keep enlarged privacy reward and add action reachable',async({page,baseURL})=>{
 const cloud=await setup(page,baseURL,{root:32,w:320,empty:true});await expect(page.getByRole('heading',{name:'עוד אין חברים',exact:true})).toBeVisible();await glyphs(page,32,{empty:true});await reachable(page.getByRole('button',{name:'הוסף חבר',exact:true}));await reachable(page.locator('#referral-reward-card-friends'));expect(cloud.errors).toEqual([]);
});

// Filtering must not leave a separator above the first visible friend. Navigation
// and read-only controls must preserve all contacts and financial history.
test('flat friends roster preserves search privacy request tabs and add navigation',async({page,baseURL})=>{
 const cloud=await setup(page,baseURL,{many:true}),before=cloud.state(),search=page.getByRole('searchbox',{name:'חיפוש ברשימת החברים'});
 await expect(page.locator('.friend-row:visible')).toHaveCount(5);await flatRoster(page);
 await search.fill('דנה');await expect(page.locator('.friend-row:visible')).toHaveCount(1);await expect(page.locator('.friend-row:visible')).toContainText('דנה לוי');await flatRoster(page);
 await search.fill('איןכזהחבר');await expect(page.locator('.friend-row:visible')).toHaveCount(0);await expect(page.locator('[data-friends-search-empty]')).toBeVisible();
 await search.fill('');await expect(page.locator('.friend-row:visible')).toHaveCount(5);await flatRoster(page);
 const privacy=page.locator('.friend-privacy-note summary');await reachable(privacy);await privacy.click();await expect(page.locator('.friend-privacy-note')).toHaveAttribute('open','');await privacy.click();
 await reachable(page.locator('#friends-tab-requests'));await page.locator('#friends-tab-requests').click();await expect(page.getByRole('heading',{name:'בקשות',exact:true})).toBeVisible();await expect(page.getByText('אין בקשות שממתינות עכשיו',{exact:true})).toBeVisible();await expect(page.locator('.friends-hub-screen > .top .muted')).toHaveCount(0);
 await reachable(page.locator('#friends-tab-people'));await page.locator('#friends-tab-people').click();await expect(page.locator('.friend-row:visible')).toHaveCount(5);
 await reachable(page.getByRole('button',{name:'הוסף חבר',exact:true}));await page.getByRole('button',{name:'הוסף חבר',exact:true}).click();await expect(page.locator('.friend-add-screen')).toBeVisible();await page.getByRole('button',{name:'חזרה למסך הקודם',exact:true}).click();await expect(page.getByRole('heading',{name:'חברים',exact:true})).toBeVisible();await flatRoster(page);
 expect(cloud.state()).toEqual(before);expect(cloud.errors).toEqual([]);
});

for(const root of [16,32])test('online caption stays unfilled while friend modes and history work at root '+root,async({page,baseURL})=>{
 const cloud=await setup(page,baseURL,{root,w:root===32?320:393}),before=cloud.state(),add=page.getByRole('button',{name:'הוסף חבר',exact:true});await reachable(add);await add.click();await expect(page.locator('.friend-add-screen')).toBeVisible();
 const online=page.locator('.friend-add-kind.is-online');await expect(online).toHaveText('אונליין');await expect(online).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await reachable(page.locator('[data-action="send-friend-request"]'));
 const offline=page.locator('[data-action="friend-add-mode"][data-mode="offline"]');await reachable(offline);await offline.click();await expect(page.locator('[data-action="friends-new-offline-name"]')).toBeFocused();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await expect(page.locator('.friend-add-kind.is-offline')).toHaveText('אופליין');await expect(page.locator('.friend-add-kind.is-offline')).not.toHaveCSS('background-color','rgba(0, 0, 0, 0)');await reachable(page.locator('[data-action="friends-add-offline"]'));
 const tab=page.locator('[data-action="friend-add-mode"][data-mode="online"]');await reachable(tab);await tab.click();await expect(online).toHaveCSS('background-color','rgba(0, 0, 0, 0)');await page.getByRole('button',{name:'חזרה למסך הקודם',exact:true}).click();await expect(page.getByRole('heading',{name:'חברים',exact:true})).toBeVisible();expect(cloud.state()).toEqual(before);expect(cloud.errors).toEqual([]);
});


async function addFriendText(page,root,mode){
 const targets=[['.friend-add-mode-button strong',.8125],['.friend-network-heading strong',.9375],['.friend-add-screen :is(.friend-request-form,.friends-add-offline-form) .field > span',.78125],['.friend-add-kind',.625]];
 await expect(page.locator('.friend-add-mode-button strong')).toHaveCount(2);
 for(const [selector,ratio] of targets){
  const rows=await page.locator(selector).evaluateAll(es=>es.map(e=>{const own=e.getBoundingClientRect(),walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),fonts=[],overflow=[];let n;while(n=walker.nextNode()){if(!n.textContent.trim())continue;fonts.push(parseFloat(getComputedStyle(n.parentElement).fontSize));const r=document.createRange();r.selectNodeContents(n);for(const g of r.getClientRects())if(g.width&&(g.left<own.left-1||g.right>own.right+1||g.top<own.top-1||g.bottom>own.bottom+1))overflow.push(n.textContent)}return{font:parseFloat(getComputedStyle(e).fontSize),fonts,overflow}}));
  if(selector!=='.friend-network-heading strong'||mode==='online')expect(rows.length,selector+' must exist').toBeGreaterThan(0);
  for(const row of rows){expect(row.font,'actual add-friend text must respect the selected root size: '+selector).toBeCloseTo(root*ratio,2);for(const font of row.fonts)expect(font).toBeCloseTo(root*ratio,2);expect(row.overflow).toEqual([])}
 }
 const input=page.locator('[data-action="'+(mode==='online'?'friend-code':'friends-new-offline-name')+'"]');
 const v=await input.evaluate(e=>{const s=getComputedStyle(e),p=getComputedStyle(e,'::placeholder'),c=document.createElement('canvas'),ctx=c.getContext('2d');ctx.font=[p.fontStyle,p.fontWeight,p.fontSize,p.fontFamily].join(' ');return{font:parseFloat(s.fontSize),placeholderFont:parseFloat(p.fontSize),placeholder:e.placeholder,width:ctx.measureText(e.placeholder).width+(parseFloat(p.letterSpacing)||0)*Math.max(0,e.placeholder.length-1),available:e.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)}});
 expect(v.font,'editable text itself must scale').toBe(root);expect(v.placeholderFont,'placeholder itself must scale').toBe(root);expect(v.width,'the full hint must fit the narrow input').toBeLessThanOrEqual(v.available+1);expect(v.placeholder).toBe(mode==='offline'?'שם החבר':'username');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth)).toBe(false);
}
for(const c of [{name:'normal',root:16,w:393},{name:'enlarged',root:32,w:320},{name:'short enlarged',root:32,w:320,h:390},{name:'system startup reload rotation reset',root:32,w:320,system:true}])test('add friend actual text and placeholder '+c.name,async({page,baseURL})=>{
 const cloud=await setup(page,baseURL,c),before=cloud.state(),open=async()=>{const add=page.getByRole('button',{name:'הוסף חבר',exact:true});await reachable(add);await add.click();await expect(page.locator('.friend-add-screen')).toBeVisible();await page.evaluate(()=>document.fonts.ready)};await open();
 for(const mode of ['online','offline']){
  const changed=await page.locator('.friend-add-screen').getAttribute('data-friend-add-mode')!==mode,tab=page.locator('[data-action="friend-add-mode"][data-mode="'+mode+'"]');await reachable(tab);await tab.click();await expect(page.locator('.friend-add-screen')).toHaveAttribute('data-friend-add-mode',mode);
  const input=page.locator('[data-action="'+(mode==='online'?'friend-code':'friends-new-offline-name')+'"]');if(changed){await expect(input).toBeFocused();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))}
  await addFriendText(page,c.root,mode);
  if(mode==='online'){await expect(page.locator('.friend-network-heading')).toContainText('מזינים שם משתמש או קישור שקיבלת מהחבר');await expect(page.locator('.friend-network-heading')).toContainText('החיבור יושלם אחרי שיאשר');await expect(page.locator('.friend-add-kind.is-online')).toHaveCSS('background-color','rgba(0, 0, 0, 0)')}
  for(const draft of mode==='online'?['friend_qa','@friend_qa']:['שם לבדיקה']){await input.fill(draft);await expect(input).toHaveValue(draft);await addFriendText(page,c.root,mode)}await input.fill('');await reachable(page.locator('[data-action="'+(mode==='online'?'send-friend-request':'friends-add-offline')+'"]'));
 }
 if(c.system){await cloud.reload();await page.getByRole('button',{name:'חברים',exact:true}).click();await open();await addFriendText(page,32,'online');await page.setViewportSize({width:852,height:320});await addFriendText(page,32,'online');await page.evaluate(()=>{document.getElementById('friends-system-text-fixture').textContent='#apple-system-body-size-probe{font-size:17px!important}';window.dispatchEvent(new Event('resize'))});await expect.poll(()=>page.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).fontSize))).toBe(16);await page.setViewportSize({width:393,height:852});await addFriendText(page,16,'online')}
 await page.getByRole('button',{name:'חזרה למסך הקודם',exact:true}).click();await expect(page.getByRole('heading',{name:'חברים',exact:true})).toBeVisible();expect(cloud.state()).toEqual(before);expect(cloud.errors).toEqual([]);
});
