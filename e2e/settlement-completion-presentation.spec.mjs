import {test,expect} from "@playwright/test";
import {personalPinsCloud} from "./helpers/personalPinsCloud.mjs";

test.use({serviceWorkers:"block"});
const eventId="completion-event",owner="completion-owner",guest="completion-guest",other="completion-other";
function seed(){
 const ids=[owner,guest,other];
 return {currentParticipantId:owner,participants:ids.map(id=>({id,displayName:id===owner?"ירין ישראלי":id===guest?"דנה לוי":"איתי כהן",kind:id===owner?"user":"guest"})),friendContacts:[],groups:[],deletedEvents:[],deletedParticipants:[],events:[{id:eventId,name:"סוף שבוע בצפון",currency:"ILS",eventType:"standard",participantIds:ids,adminIds:[owner],createdByParticipantId:owner,createdAt:"2026-10-10T10:00:00.000Z",updatedAt:"2026-10-10T10:00:00.000Z",locked:true,expenses:[{id:"dinner",name:"ארוחת ערב",total:12000,payers:[{participantId:owner,amount:7000},{participantId:guest,amount:5000}],sharedByParticipantIds:ids,createdByParticipantId:owner,occurredOn:"2026-10-20",updatedAt:"2026-10-10T10:00:00.000Z"},{id:"shopping",name:"קניות",total:12000,payers:[{participantId:owner,amount:12000}],sharedByParticipantIds:ids,createdByParticipantId:owner,occurredOn:"2026-10-20",updatedAt:"2026-10-10T10:00:00.000Z"}],transfers:[],activityLog:[]}]};
}
async function setup(page,baseURL,{root=16,w=393,h=852,system=false}={}){
 await page.setViewportSize({width:w,height:h});
 if(root>16&&!system)await page.addInitScript(root=>{const url=new URL(location.href);url.searchParams.set("dynamic-type-preview",String(root));history.replaceState(history.state,"",url);},root);
 if(system)await page.addInitScript(()=>{
  const supports=CSS.supports.bind(CSS);CSS.supports=(...a)=>a[0]==="font"&&a[1]==="-apple-system-body"?true:supports(...a);
  const media=matchMedia.bind(window);window.matchMedia=q=>{const m=media(q);if(q.replaceAll(" ","")!=="(any-pointer:coarse)")return m;return {matches:true,media:q,addEventListener:m.addEventListener.bind(m),removeEventListener:m.removeEventListener.bind(m),addListener:m.addListener.bind(m),removeListener:m.removeListener.bind(m)}};
  const insert=()=>{const s=document.createElement("style");s.textContent="#apple-system-body-size-probe{font-size:34px!important}";document.head.append(s)};if(document.head)insert();else document.addEventListener("DOMContentLoaded",insert,{once:true});
 });
 const cloud=await personalPinsCloud(page,baseURL,seed(),{accountId:"completion-owner",profileUpdatedAt:"2026-09-03T08:00:00.000Z"});
 await expect.poll(()=>page.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).fontSize))).toBe(root);
 await page.locator('[data-action="open-event"][data-event-id="'+eventId+'"]').click();await page.getByRole("button",{name:"פתיחת הסיכום: מי מעביר למי",exact:true}).click();await page.evaluate(()=>document.fonts.ready);return cloud;
}
const current=cloud=>cloud.state().events[0];
async function complete(page,cloud){
 const expenses=structuredClone(current(cloud).expenses),pending=page.locator('.transfer-row[data-transfer-status="pending"]');
 await expect(pending).toHaveCount(2);await pending.first().locator('[data-action="mark-paid"]').click();await expect(pending).toHaveCount(1);await expect(page.locator(".settlement-celebration-dialog")).toHaveCount(0);
 await pending.first().locator('[data-action="mark-paid"]').click();const dialog=page.locator(".settlement-celebration-dialog");await expect(dialog).toBeVisible();
 await expect.poll(()=>current(cloud).transfers.length===2&&current(cloud).transfers.every(t=>t.status==="paid")).toBe(true);
 expect(cloud.writes.at(-1).state.events[0].transfers.every(t=>t.status==="paid")).toBe(true);expect(current(cloud).expenses).toEqual(expenses);return {dialog,expenses};
}
async function layout(dialog,root){
 // Measure the completed layout, rather than an in-flight entry translation.
 await dialog.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await expect.poll(()=>dialog.evaluate(e=>[e,e.closest(".settlement-celebration-backdrop")].every(n=>{
  const m=new DOMMatrix(getComputedStyle(n).transform),epsilon=.000001;
  return Math.abs(m.a-1)<epsilon&&Math.abs(m.d-1)<epsilon&&Math.abs(m.b)<epsilon&&Math.abs(m.c)<epsilon&&Math.abs(m.e)<epsilon&&Math.abs(m.f)<epsilon;
 }))).toBe(true);
 const g=await dialog.evaluate(e=>{const b=e.getBoundingClientRect(),bad=[];
  for(const x of e.querySelectorAll("h2,p,button")){const own=x.getBoundingClientRect(),walker=document.createTreeWalker(x,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode())for(let i=0;i<n.length;i++){if(!n.textContent[i].trim())continue;const range=document.createRange();range.setStart(n,i);range.setEnd(n,i+1);for(const r of range.getClientRects()){if(r.left<b.left-.5||r.right>b.right+.5)bad.push("horizontal "+x.textContent.trim());if(x.tagName==="BUTTON"&&(r.top<own.top-.5||r.bottom>own.bottom+.5))bad.push("button "+x.textContent.trim());}}}
  return {inside:b.top>=13.5&&b.bottom<=innerHeight-13.5&&b.left>=13.5&&b.right<=innerWidth-13.5,top:b.top,bottom:b.bottom,viewportHeight:innerHeight,bad,root:parseFloat(getComputedStyle(document.documentElement).fontSize),title:parseFloat(getComputedStyle(e.querySelector("h2")).fontSize),body:parseFloat(getComputedStyle(e.querySelector("p")).fontSize),buttons:[...e.querySelectorAll("button")].map(n=>parseFloat(getComputedStyle(n).fontSize)),pageOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,markShadow:getComputedStyle(e.querySelector(".settlement-celebration-mark")).boxShadow};
 });
 expect(g.inside,"completion dialog must fit within the viewport with safe margins: "+JSON.stringify(g)).toBe(true);
 expect(g.bad).toEqual([]);expect(g.root).toBe(root);expect(g.title).toBe(root*1.5);expect(g.body).toBe(root*.875);expect(g.buttons).toEqual([root*.9375,root*.9375]);expect(g.pageOverflow).toBe(false);expect(g.markShadow).toBe("none");
 await expect(dialog.locator("h2")).toHaveText("הכול שולם");await expect(dialog.locator("p")).toHaveText("כל התשלומים באירוע סומנו כשולמו.");await expect(dialog.locator(".settlement-celebration-eyebrow,.settlement-confetti")).toHaveCount(0);
}
async function reachable(button){
 await button.scrollIntoViewIfNeeded();const g=await button.evaluate(e=>{const b=e.getBoundingClientRect(),d=e.closest(".settlement-celebration-dialog").getBoundingClientRect();return {w:b.width,h:b.height,inside:b.top>=d.top-.5&&b.bottom<=d.bottom+.5,hit:e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))}});
 expect(g.w).toBeGreaterThanOrEqual(44);expect(g.h).toBeGreaterThanOrEqual(44);expect(g.inside).toBe(true);expect(g.hit).toBe(true);
}
for(const c of [{name:"normal",root:16,w:393,h:852},{name:"enlarged",root:32,w:320,h:852},{name:"short viewport",root:20,w:393,h:390},{name:"short enlarged",root:32,w:320,h:390},{name:"system text",root:32,w:393,h:852,system:true}]){
 test("completion "+c.name+" root "+c.root+" retains payments and reachable actions",async({page,baseURL},info)=>{
  const cloud=await setup(page,baseURL,c),{dialog,expenses}=await complete(page,cloud);await layout(dialog,c.root);await page.screenshot({path:info.outputPath("completion.png"),animations:"disabled"});
  const primary=dialog.getByRole("button",{name:"חזרה לאירועים",exact:true}),secondary=dialog.getByRole("button",{name:"הישאר בסיכום",exact:true});
  await reachable(primary);await reachable(secondary);await secondary.focus();await secondary.press("Tab");await expect(primary).toBeFocused();await primary.press("Shift+Tab");await expect(secondary).toBeFocused();
  await secondary.click();await expect(dialog).toBeHidden();await expect(page.locator(".settlement-hero")).toContainText("הכול שולם");expect(current(cloud).expenses).toEqual(expenses);expect(!!current(cloud).archivedAt).toBe(false);
  await cloud.reload();await page.locator('[data-action="open-event"][data-event-id="'+eventId+'"]').click();await page.getByRole("button",{name:"פתיחת הסיכום: מי מעביר למי",exact:true}).click();await expect(page.locator('.transfer-row[data-transfer-status="paid"]')).toHaveCount(2);await expect(page.locator(".settlement-celebration-dialog")).toHaveCount(0);expect(current(cloud).expenses).toEqual(expenses);expect(cloud.errors).toEqual([]);
 });
}
test("completion returns to events without archiving the paid event",async({page,baseURL})=>{
 const cloud=await setup(page,baseURL),{dialog,expenses}=await complete(page,cloud),before=structuredClone(cloud.state());await dialog.getByRole("button",{name:"חזרה לאירועים",exact:true}).click();await expect(page.getByRole("heading",{name:"מה סוגרים היום?",exact:true})).toBeVisible();await expect(page.locator('[data-action="open-event"][data-event-id="'+eventId+'"]')).toBeVisible();expect(cloud.state()).toEqual(before);expect(current(cloud).expenses).toEqual(expenses);expect(cloud.errors).toEqual([]);
});
test("completion Escape and browser Back preserve the final payment state",async({page,baseURL})=>{
 const cloud=await setup(page,baseURL),{dialog}=await complete(page,cloud),before=structuredClone(cloud.state());await dialog.press("Escape");await expect(dialog).toBeHidden();expect(cloud.state()).toEqual(before);
 const row=page.locator('.transfer-row[data-transfer-status="paid"]').first();await row.locator('[data-action="mark-pending"]').click();await page.locator('.transfer-row[data-transfer-status="pending"] [data-action="mark-paid"]').click();await expect(dialog).toBeVisible();const final=structuredClone(cloud.state());await page.goBack();await expect(dialog).toBeHidden();await expect(page.locator(".settlement-screen")).toBeVisible();expect(cloud.state()).toEqual(final);expect(cloud.errors).toEqual([]);
});
test("completion reflows through rotation and restoring ordinary text",async({page,baseURL})=>{
 const cloud=await setup(page,baseURL,{root:32,w:320,h:852}),{dialog}=await complete(page,cloud),before=structuredClone(cloud.state());await page.setViewportSize({width:852,height:320});await layout(dialog,32);await reachable(dialog.getByRole("button",{name:"הישאר בסיכום",exact:true}));
 await page.evaluate(()=>{document.documentElement.classList.remove("dynamic-type-preview");document.documentElement.style.setProperty("font-size","16px","important");});await page.setViewportSize({width:393,height:852});await layout(dialog,16);expect(cloud.state()).toEqual(before);expect(cloud.errors).toEqual([]);
});
