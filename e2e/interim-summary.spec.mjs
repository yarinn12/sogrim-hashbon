import {expect,test} from "@playwright/test";import {personalPinsCloud} from "./helpers/personalPinsCloud.mjs";
test.use({serviceWorkers:"block"});
const eventId="interim-event",owner="interim-owner",a="interim-a",b="interim-b";
function seed({single=false,empty=false,closed=false}={}){
 const ids=single?[owner,a]:[owner,a,b];
 return {currentParticipantId:owner,participants:ids.map(id=>({id,displayName:id===owner?"ירין ישראלי":id===a?"דנה לוי":"איתי כהן",kind:id===owner?"user":"guest"})),friendContacts:[],groups:[],deletedEvents:[],deletedParticipants:[],events:[{id:eventId,name:"סוף שבוע בצפון",eventType:"standard",currency:"ILS",participantIds:ids,adminIds:[owner],createdByParticipantId:owner,createdAt:"2026-10-10T10:00:00.000Z",updatedAt:"2026-10-10T10:00:00.000Z",locked:closed,expenses:empty?[]:[{id:"dinner",name:"ארוחת ערב",total:12000,payers:[{participantId:owner,amount:7000},{participantId:a,amount:5000}],sharedByParticipantIds:ids,createdByParticipantId:owner,occurredOn:"2026-10-20",updatedAt:"2026-10-10T10:00:00.000Z"},{id:"shopping",name:"קניות",total:12000,payers:[{participantId:owner,amount:12000}],sharedByParticipantIds:ids,createdByParticipantId:owner,occurredOn:"2026-10-20",updatedAt:"2026-10-10T10:00:00.000Z"}],transfers:[],activityLog:[]}]};
}
async function setup(page,baseURL,{root=16,height=852,...options}={}){
 await page.setViewportSize({width:root===32?320:393,height});
 const cloud=await personalPinsCloud(page,baseURL,seed(options),{accountId:"interim-summary-owner"});
 await page.evaluate(root=>{const url=new URL(location.href);if(root>16)url.searchParams.set("dynamic-type-preview",String(root));history.replaceState(history.state,"",url);document.documentElement.classList.toggle("dynamic-type-preview",root>16);document.documentElement.style.setProperty("font-size",root+"px","important");},root);
 await page.locator('[data-action="open-event"][data-event-id="'+eventId+'"]').click();
 await page.getByRole("button",{name:"פתיחת הסיכום: מי מעביר למי",exact:true}).click();
 const screen=page.locator(".settlement-screen");await expect(screen).toBeVisible();return {cloud,screen};
}
const amounts=cloud=>cloud.state().events[0].expenses.map(e=>({id:e.id,total:e.total,payers:e.payers,sharedByParticipantIds:e.sharedByParticipantIds}));
async function controls(screen){
 const last=screen.locator('.settlement-list-actions [data-action="copy-event-report"]');
 await screen.locator(".settlement-list-actions > summary").click();await last.scrollIntoViewIfNeeded();
 const g=await last.evaluate(e=>{const r=e.getBoundingClientRect();return {w:r.width,h:r.height,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});
 expect(g.w).toBeGreaterThanOrEqual(44);expect(g.h).toBeGreaterThanOrEqual(44);expect(g.hit).toBe(true);
 await screen.locator(".settlement-list-actions > summary").click();
}
for(const root of [16,20,32]){
 test("open interim copy and cancellation preserve the exact expenses at root "+root,async({page,baseURL})=>{
  const {cloud,screen}=await setup(page,baseURL,{root});const before=amounts(cloud);
  await expect(screen.locator(".settlement-hero")).toHaveAttribute("data-settlement-phase","interim");
  await expect(screen.locator(".settlement-hero")).toContainText("סיכום ביניים");
  await expect(screen.locator(".settlement-close-primary")).toHaveText("סגור אירוע והתחל להתחשבן");
  await expect(screen.locator(".settlement-hero-title-row p")).toHaveText("הסגירה נועלת את ההוצאות ומאפשרת לסמן תשלומים.");
  const glyphs=await screen.locator(".settlement-close-primary").evaluate(button=>{
   const b=button.getBoundingClientRect(),walker=document.createTreeWalker(button,NodeFilter.SHOW_TEXT),outside=[];let node;
   while(node=walker.nextNode())for(let i=0;i<node.length;i++){if(!node.textContent[i].trim())continue;const range=document.createRange();range.setStart(node,i);range.setEnd(node,i+1);for(const r of range.getClientRects())if(r.left<b.left-.5||r.right>b.right+.5||r.top<b.top-.5||r.bottom>b.bottom+.5)outside.push(node.textContent[i]);}
   return outside;
  });expect(glyphs).toEqual([]);

  await expect(screen.locator(".transfer-status")).toHaveText(["סכום לא סופי","סכום לא סופי"]);
  await expect(screen.locator('[data-action="mark-paid"]')).toHaveCount(0);
  const style=await screen.evaluate(e=>({copy:parseFloat(getComputedStyle(e.querySelector(".settlement-hero-title-row p")).fontSize),title:parseFloat(getComputedStyle(e.querySelector(".settlement-hero-title-row h2")).fontSize),background:getComputedStyle(e.querySelector(".settlement-hero-actions")).backgroundColor,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth}));
  expect(style.copy).toBe(root*.875);expect(style.title).toBe(root*1.25);expect(style.background).toBe("rgba(0, 0, 0, 0)");expect(style.overflow).toBe(false);
  await controls(screen);await screen.locator(".settlement-close-primary").click();
  const dialog=page.locator(".settlement-close-confirmation");await expect(dialog).toBeVisible();
  await dialog.getByRole("button",{name:"ביטול",exact:true}).click();await expect(dialog).toBeHidden();
  expect(amounts(cloud)).toEqual(before);expect(!!cloud.state().events[0].locked).toBe(false);expect(cloud.errors).toEqual([]);
 });
 test("closing enables real payment completion and preserves its final cloud ACK at root "+root,async({page,baseURL})=>{
  const {cloud,screen}=await setup(page,baseURL,{root}),before=amounts(cloud);
  await screen.locator(".settlement-close-primary").click();await page.locator('[data-action="confirm-close-event"]').click();
  await expect.poll(()=>cloud.state().events[0].locked).toBe(true);await expect(screen.locator(".settlement-hero")).toHaveAttribute("data-settlement-phase","existing");
  await expect(screen.locator(".transfer-status")).toHaveText(["מחכה שיגיע","מחכה שיגיע"]);
  const row=screen.locator(".transfer-row").first(),id=await row.getAttribute("data-transfer-id");
  await row.locator('[data-action="mark-paid"]').click();
  await expect.poll(()=>cloud.state().events[0].transfers.find(t=>t.id===id)?.status).toBe("paid");
  expect(amounts(cloud)).toEqual(before);
  expect(cloud.writes.at(-1).state.events[0].transfers.find(t=>t.id===id)?.status).toBe("paid");
  await cloud.reload();await page.locator('[data-action="open-event"][data-event-id="'+eventId+'"]').click();await page.getByRole("button",{name:"פתיחת הסיכום: מי מעביר למי",exact:true}).click();
  await expect(screen.locator('.transfer-row[data-transfer-id="'+id+'"]')).toHaveAttribute("data-transfer-status","paid");expect(amounts(cloud)).toEqual(before);expect(cloud.errors).toEqual([]);
 });
}
test("large type gives the transfer heading full width and keeps the shortcut compact",async({page,baseURL})=>{
 const {screen}=await setup(page,baseURL,{root:32});
 const g=await screen.locator(".settlement-stage-heading").evaluate(e=>{const p=e.getBoundingClientRect(),copy=e.querySelector(":scope > div").getBoundingClientRect(),button=e.querySelector("button").getBoundingClientRect();return {parent:p.width,copy:copy.width,below:button.top>=copy.bottom,buttonH:button.height};});
 expect(g.copy).toBeGreaterThanOrEqual(g.parent-1);expect(g.below).toBe(true);expect(g.buttonH).toBeLessThan(110);
 await controls(screen);
});
test("single transfer uses interim language and only gets payment controls after closure",async({page,baseURL})=>{
 const {screen,cloud}=await setup(page,baseURL,{single:true});
 await expect(screen.locator(".settlement-hero.is-explained")).toHaveAttribute("data-settlement-phase","interim");
 await expect(screen.locator(".settlement-featured-action")).toContainText("סיכום ביניים");
 await expect(screen.locator(".settlement-featured-route")).toContainText("סכום לא סופי לקבלה");
 await expect(screen.locator(".settlement-featured-amount")).toHaveText("₪70.00");
 await expect(screen.locator('[data-action="mark-paid"]')).toHaveCount(0);
 await screen.locator(".settlement-close-primary").click();await page.locator('[data-action="confirm-close-event"]').click();
 await expect(screen.locator(".settlement-featured-complete")).toBeVisible();expect(cloud.errors).toEqual([]);
});
test("short viewport preserves the bottom sharing action and closure cancellation",async({page,baseURL})=>{
 const {screen,cloud}=await setup(page,baseURL,{root:20,height:390});await controls(screen);
 await screen.locator(".settlement-close-primary").click();await page.locator(".settlement-close-confirmation").getByRole("button",{name:"ביטול",exact:true}).click();
 await expect(screen).toBeVisible();expect(!!cloud.state().events[0].locked).toBe(false);expect(cloud.errors).toEqual([]);
});
test("empty summary keeps the existing add-expense action without an interim payment panel",async({page,baseURL})=>{
 const {screen}=await setup(page,baseURL,{empty:true});
 await expect(screen).toContainText("אין עדיין סיכום");await expect(screen.locator('[data-action="show-expense-form"]')).toBeVisible();
 await expect(screen.locator(".transfer-row")).toHaveCount(0);await expect(screen.locator('[data-settlement-phase="interim"]')).toHaveCount(0);
});


async function expectSettledDisclosureRotation(row,direction){
 // Bounding rectangles include the in-flight rotated square. Wait for both
 // diagonal and off-diagonal terms to settle before checking the exact size.
 await expect.poll(()=>row.locator(".transfer-expand-indicator").evaluate((element,target)=>{
  const m=new DOMMatrix(getComputedStyle(element).transform),epsilon=.000001;
  return Math.abs(m.a-target)<epsilon&&Math.abs(m.d-target)<epsilon&&Math.abs(m.b)<epsilon&&Math.abs(m.c)<epsilon;
 },direction)).toBe(true);
}
async function expectCenteredStatus(row){
 const geometry=await row.locator(".transfer-status-cluster").evaluate(e=>{
  const arrow=e.querySelector(".transfer-expand-indicator"),label=e.querySelector(".transfer-status"),a=arrow.getBoundingClientRect(),t=label.getBoundingClientRect();
  const path=arrow.querySelector("svg path");let paintedCenter=null;
  if(path){const b=path.getBBox(),point=new DOMPoint(b.x+b.width/2,b.y+b.height/2).matrixTransform(path.getScreenCTM());paintedCenter=point.y;}
  return {centerDifference:Math.abs(a.y+a.height/2-t.y-t.height/2),paintedDifference:paintedCenter===null?null:Math.abs(paintedCenter-t.y-t.height/2),
   iconSize:a.width,root:parseFloat(getComputedStyle(document.documentElement).fontSize),labelVisible:t.width>0&&t.height>0,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth};
 });
 expect(geometry.centerDifference,"the actual status and indicator boxes must share a vertical center").toBeLessThanOrEqual(.5);
 expect(geometry.paintedDifference,"the shared source chevron must paint at the label center").not.toBeNull();
 expect(geometry.paintedDifference).toBeLessThanOrEqual(.5);
 expect(geometry.iconSize).toBeCloseTo(geometry.root*.875,1);
 expect(geometry.labelVisible).toBe(true);expect(geometry.overflow).toBe(false);
}
for(const root of [16,20,32])for(const closed of [false,true]){
 test("status disclosure remains centered before and after opening at root "+root+" closed "+closed,async({page,baseURL})=>{
  const {screen,cloud}=await setup(page,baseURL,{root,closed});await page.evaluate(()=>document.fonts.ready);
  const before=structuredClone(cloud.state().events[0]),row=screen.locator(".transfer-row").first(),cluster=row.locator(".transfer-status-cluster");
  await expect(row).toHaveAttribute("aria-expanded","false");await expectCenteredStatus(row);
  await cluster.click();await expect(row).toHaveAttribute("aria-expanded","true");
  await expect(row.locator(".transfer-explanation")).toHaveAttribute("open","");
  await expectSettledDisclosureRotation(row,-1);
  await expectCenteredStatus(row);
  await row.focus();await row.press("Enter");await expect(row).toHaveAttribute("aria-expanded","false");
  await expectSettledDisclosureRotation(row,1);
  await expectCenteredStatus(row);
  const after=cloud.state().events[0];expect(after.expenses).toEqual(before.expenses);expect(after.transfers).toEqual(before.transfers);expect(after.locked).toBe(before.locked);expect(cloud.errors).toEqual([]);
 });
}
