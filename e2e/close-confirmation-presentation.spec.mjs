import {test,expect} from "@playwright/test";
import {personalPinsCloud} from "./helpers/personalPinsCloud.mjs";
test.use({serviceWorkers:"block"});
const eventId="close-presentation",owner="close-owner",guest="close-guest",other="close-other";
function seed(single=false){
 const ids=single?[owner,guest]:[owner,guest,other];
 return {currentParticipantId:owner,participants:ids.map(id=>({id,displayName:id===owner?"ירין ישראלי":id===guest?"דנה לוי":"איתי כהן",kind:id===owner?"user":"guest"})),friendContacts:[],groups:[],deletedEvents:[],deletedParticipants:[],events:[{id:eventId,name:"סוף שבוע בצפון",currency:"ILS",eventType:"standard",participantIds:ids,adminIds:[owner],createdByParticipantId:owner,createdAt:"2026-10-10T10:00:00.000Z",updatedAt:"2026-10-10T10:00:00.000Z",locked:false,expenses:[{id:"dinner",name:"ארוחת ערב",total:12000,payers:[{participantId:owner,amount:7000},{participantId:guest,amount:5000}],sharedByParticipantIds:ids,createdByParticipantId:owner,occurredOn:"2026-10-20",updatedAt:"2026-10-10T10:00:00.000Z"},{id:"shopping",name:"קניות",total:12000,payers:[{participantId:owner,amount:12000}],sharedByParticipantIds:ids,createdByParticipantId:owner,occurredOn:"2026-10-20",updatedAt:"2026-10-10T10:00:00.000Z"}],transfers:[],activityLog:[]}]};
}
async function setup(page,baseURL,{root=16,w=393,h=852,single=false,system=false}={}){
 await page.setViewportSize({width:w,height:h});
 if(root>16&&!system)await page.addInitScript(root=>{
  const url=new URL(location.href);url.searchParams.set("dynamic-type-preview",String(root));history.replaceState(history.state,"",url);
 },root);
 if(system)await page.addInitScript(()=>{
  const supports=CSS.supports.bind(CSS);
  CSS.supports=(...a)=>a[0]==="font"&&a[1]==="-apple-system-body"?true:supports(...a);
  const media=matchMedia.bind(window);window.matchMedia=q=>{
   const m=media(q);if(q.replaceAll(" ","")!=="(any-pointer:coarse)")return m;
   return {matches:true,media:q,addEventListener:m.addEventListener.bind(m),removeEventListener:m.removeEventListener.bind(m),addListener:m.addListener.bind(m),removeListener:m.removeListener.bind(m)};
  };
  const insert=()=>{const s=document.createElement("style");s.textContent="#apple-system-body-size-probe{font-size:34px!important}";document.head.append(s)};
  if(document.head)insert();else document.addEventListener("DOMContentLoaded",insert,{once:true});
 });
 const cloud=await personalPinsCloud(page,baseURL,seed(single),{accountId:"close-presentation-owner"});
 await expect.poll(()=>page.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).fontSize))).toBe(root);
 await page.locator('[data-action="open-event"][data-event-id="'+eventId+'"]').click();
 await page.getByRole("button",{name:"פתיחת הסיכום: מי מעביר למי",exact:true}).click();
 await page.evaluate(()=>document.fonts.ready);
 return cloud;
}
const state=cloud=>{const e=cloud.state().events[0];return {expenses:e.expenses,transfers:e.transfers,locked:!!e.locked}};
async function open(page){
 await page.locator(".settlement-close-primary").click();const d=page.locator(".settlement-close-confirmation");
 await expect(d).toBeVisible();return d;
}
async function layout(d,root,{initial=false}={}){
 const g=await d.evaluate(e=>{
  const r=e.getBoundingClientRect(),title=e.querySelector("h2").getBoundingClientRect(),bad=[];
  for(const x of e.querySelectorAll("h2,p,button")){
   const range=document.createRange();range.selectNodeContents(x);const b=x.getBoundingClientRect();
   for(const t of range.getClientRects()){
    if(t.x<r.x-1||t.right>r.right+1)bad.push("horizontal: "+x.textContent.trim());
    if(x.tagName==="BUTTON"&&(t.y<b.y-1||t.bottom>b.bottom+1))bad.push("button vertical: "+x.textContent.trim());
   }
  }
  return {root:parseFloat(getComputedStyle(document.documentElement).fontSize),titleFont:parseFloat(getComputedStyle(e.querySelector("h2")).fontSize),bodyFont:parseFloat(getComputedStyle(e.querySelector("#settlement-close-confirmation-description")).fontSize),summaryFont:parseFloat(getComputedStyle(e.querySelector("#settlement-close-confirmation-summary")).fontSize),buttonFonts:[...e.querySelectorAll(".settlement-close-confirmation-actions button")].map(x=>parseFloat(getComputedStyle(x).fontSize)),bad,titleVisible:title.y>=r.y-1&&title.bottom<=r.bottom+1,inside:r.x>=0&&r.right<=innerWidth+1&&r.y>=0&&r.bottom<=innerHeight+1,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth};
 });
 expect(g.root).toBe(root);expect(g.titleFont,"heading scales with root/system text").toBe(root*1.25);
 expect(g.bodyFont,"body scales with root/system text").toBe(root*.9375);expect(g.summaryFont).toBe(root);
 expect(g.buttonFonts).toEqual([root*.9375,root*.9375]);expect(g.bad).toEqual([]);expect(g.inside).toBe(true);expect(g.overflow).toBe(false);
 if(initial){expect(g.titleVisible).toBe(true);await expect(d.locator("h2")).toBeFocused();}
}
async function reachable(button){
 await button.scrollIntoViewIfNeeded();
 const g=await button.evaluate(e=>{
  const r=e.getBoundingClientRect(),d=e.closest(".settlement-close-confirmation").getBoundingClientRect();
  const nav=[...document.querySelectorAll(".event-route-primary-nav")].map(e=>e.getBoundingClientRect()).filter(r=>r.height>0);
  return {w:r.width,h:r.height,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),inside:r.y>=d.y-1&&r.bottom<=d.bottom+1,navClear:nav.length>0&&nav.every(n=>r.bottom<=n.y+1)};
 });
 expect(g.w).toBeGreaterThanOrEqual(44);expect(g.h).toBeGreaterThanOrEqual(44);expect(g.hit).toBe(true);expect(g.inside).toBe(true);expect(g.navClear).toBe(true);
}
for(const c of [{root:16,w:393,h:852},{root:20,w:411,h:852},{root:32,w:320,h:852},{root:20,w:393,h:390},{root:32,w:320,h:390}]){
 test("close confirmation scales actual glyphs and preserves all cancel paths root "+c.root+" "+c.w+"x"+c.h,async({page,baseURL},info)=>{
  const cloud=await setup(page,baseURL,c),before=state(cloud);
  const d=await open(page);await layout(d,c.root,{initial:true});
  await expect(d.locator("#settlement-close-confirmation-summary")).toHaveText("2 העברות בסך ₪110.00");
  await expect(d.locator("#settlement-close-confirmation-description")).toHaveText("ההוצאות יינעלו לעריכה ותוכלו לסמן תשלומים שבוצעו. יישלח עדכון למשתתפים באפליקציה.");
  await reachable(d.locator('[data-action="confirm-close-event"]'));
  await page.screenshot({path:info.outputPath("actions.png"),animations:"disabled"});
  const cancel=d.locator('.settlement-close-confirmation-actions [data-action="cancel-close-event-confirmation"]');
  await reachable(cancel);await cancel.click();await expect(d).toBeHidden();expect(state(cloud)).toEqual(before);
  await open(page);
  for(const key of ["Tab","Tab","Tab","Tab","Shift+Tab","Shift+Tab"]){
   await page.keyboard.press(key);expect(await d.evaluate(e=>e.contains(document.activeElement))).toBe(true);
   await reachable(page.locator(".settlement-close-confirmation button:focus"));
  }
  await page.keyboard.press("Escape");await expect(d).toBeHidden();expect(state(cloud)).toEqual(before);
  await open(page);const x=d.locator(".settlement-close-confirmation-dismiss");await reachable(x);await x.click();await expect(d).toBeHidden();
  expect(state(cloud)).toEqual(before);expect(cloud.errors).toEqual([]);
 });
}
test("single transfer copy closes only after confirmation and preserves amounts through final ACK and reload",async({page,baseURL})=>{
 const cloud=await setup(page,baseURL,{root:32,w:320,single:true}),before=state(cloud),d=await open(page);
 await layout(d,32,{initial:true});
 await expect(d.locator("#settlement-close-confirmation-summary")).toHaveText("העברה אחת בסך ₪70.00");
 const confirm=d.getByRole("button",{name:"סגור אירוע",exact:true});await reachable(confirm);await confirm.click();
 await expect(d).toBeHidden();await expect.poll(()=>cloud.state().events[0].locked).toBe(true);
 expect(cloud.writes.at(-1).state.events[0].locked).toBe(true);
 expect(cloud.writes.at(-1).state.events[0].expenses).toEqual(before.expenses);
 await cloud.reload();await page.locator('[data-action="open-event"][data-event-id="'+eventId+'"]').click();
 await page.getByRole("button",{name:"פתיחת הסיכום: מי מעביר למי",exact:true}).click();
 await expect(page.locator(".settlement-featured-complete")).toBeVisible();
 expect(cloud.state().events[0].expenses).toEqual(before.expenses);expect(cloud.errors).toEqual([]);
});
test("system text detected before startup scales close copy and permits return to normal size",async({page,baseURL})=>{
 const cloud=await setup(page,baseURL,{root:32,w:320,system:true}),before=state(cloud),d=await open(page);
 await expect(page.locator("html")).toHaveClass(/dynamic-type-active/);await layout(d,32,{initial:true});
 await reachable(d.locator('[data-action="confirm-close-event"]'));await page.keyboard.press("Escape");expect(state(cloud)).toEqual(before);
 // Refresh the existing system probe, rather than overriding app font size.
 await page.evaluate(()=>{document.querySelector("#apple-system-body-size-probe").style.setProperty("font-size","17px","important")});
 await expect.poll(()=>page.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).fontSize))).toBe(16);
 await open(page);await layout(d,16,{initial:true});await page.keyboard.press("Escape");
 expect(state(cloud)).toEqual(before);expect(cloud.errors).toEqual([]);
});
