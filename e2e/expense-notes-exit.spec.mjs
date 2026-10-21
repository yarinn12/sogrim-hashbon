import {expect,test} from "@playwright/test";
import {personalPinsCloud} from "./helpers/personalPinsCloud.mjs";
test.use({serviceWorkers:"block"});
const png="iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAD0lEQVR42mP8z8DAwMAAAAYAAQHLR3cAAAAASUVORK5CYII=";
const imageFile={name:"receipt.png",mimeType:"image/png",buffer:Buffer.from(png,"base64")};
const expense={id:"exit-expense",name:"ארוחת ערב",notes:"הערה קיימת",total:24000,
  payers:[{participantId:"exit-owner",amount:24000}],sharedByParticipantIds:["exit-owner"],
  createdByParticipantId:"exit-owner",occurredOn:"2026-10-20",updatedAt:"2026-10-10T12:00:00.000Z"};
const initial={currentParticipantId:"exit-owner",participants:[{id:"exit-owner",displayName:"בודק הערות",kind:"user"}],
  friendContacts:[],groups:[],deletedEvents:[],deletedParticipants:[],
  events:[{id:"exit-event",name:"ערב חברים",eventType:"standard",currency:"ILS",participantIds:["exit-owner"],
    adminIds:["exit-owner"],createdByParticipantId:"exit-owner",createdAt:"2026-10-10T12:00:00.000Z",
    updatedAt:"2026-10-10T12:00:00.000Z",expenses:[expense],transfers:[],activityLog:[]}]};
async function setup(page,baseURL,root=16){
  await page.setViewportSize({width:root===32?320:393,height:852});
  const cloud=await personalPinsCloud(page,baseURL,initial,{accountId:"notes-exit-owner"});
  await page.evaluate(root=>{
    const url=new URL(location.href);
    if(root>16)url.searchParams.set("dynamic-type-preview",String(root));
    history.replaceState(history.state,"",url);
    document.documentElement.classList.toggle("dynamic-type-preview",root>16);
    document.documentElement.style.setProperty("font-size",root+"px","important");
  },root);
  await page.locator('[data-action="open-event"][data-event-id="exit-event"]').click();
  const modal=page.locator(".expense-notes-modal"),notes=modal.locator('[data-action="expense-notes"]');
  const prompt=page.locator('[data-important-action-kind="discard-expense-notes"]');
  const open=async()=>{
    const row=page.locator('.expense-row[data-expense-id="exit-expense"]');
    await row.locator(".expense-row-actions-menu > summary").click();
    await row.locator('[data-action="edit-expense-notes"]').click();
    await expect(modal).toBeVisible();
  };
  await open();return {cloud,modal,notes,prompt,open,back:modal.locator('[data-action="cancel-expense"]'),
    keep:prompt.getByRole("button",{name:"המשך לערוך",exact:true}),
    discard:prompt.getByRole("button",{name:"צא בלי לשמור",exact:true}),
    save:modal.locator('[data-action="save-expense"]')};
}
async function upload(page,modal){
  const pending=page.waitForEvent("filechooser");
  await modal.locator('[data-action="select-expense-attachment"]').click();
  await (await pending).setFiles(imageFile);
  await expect(modal.locator(".expense-attachment-preview")).toBeVisible();
}
async function checkPrompt(prompt){
  await expect(prompt).toHaveAttribute("role","alertdialog");
  await expect(prompt).toHaveAccessibleName("לצאת בלי לשמור?");
  for(const button of await prompt.getByRole("button").all()){
    await button.scrollIntoViewIfNeeded();
    const fits=await button.evaluate(e=>{
      const b=e.getBoundingClientRect(),r=document.createRange();r.selectNodeContents(e);
      return {w:b.width,h:b.height,hit:e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)),
        fits:[...r.getClientRects()].every(g=>g.left>=b.left-1&&g.right<=b.right+1&&g.top>=b.top-1&&g.bottom<=b.bottom+1),
        inside:b.top>=0&&b.bottom<=innerHeight};
    });
    expect(fits.w).toBeGreaterThanOrEqual(44);expect(fits.h).toBeGreaterThanOrEqual(44);
    expect(fits.hit&&fits.fits&&fits.inside).toBe(true);
  }
}
for(const root of [16,20,32]){
  test("changed notes require explicit discard and keep the draft on cancel at root "+root,async({page,baseURL})=>{
    const s=await setup(page,baseURL,root),before=s.cloud.state(),writes=s.cloud.writes.length;
    await s.notes.fill("הערה ששיניתי ועדיין לא שמרתי");await s.back.click();
    await expect(s.prompt).toBeVisible();await expect(s.keep).toBeFocused();await checkPrompt(s.prompt);
    if(process.env.QA_NOTES_EXIT_CAPTURE_DIR)
      await page.screenshot({path:process.env.QA_NOTES_EXIT_CAPTURE_DIR+"/prompt-root"+root+".png"});
    expect(s.cloud.state()).toEqual(before);expect(s.cloud.writes.length).toBe(writes);
    await page.keyboard.press("Escape");await expect(s.prompt).toBeHidden();
    await expect(s.notes).toHaveValue("הערה ששיניתי ועדיין לא שמרתי");
    await s.back.click();await s.keep.click();await expect(s.prompt).toBeHidden();
    await expect(s.notes).toHaveValue("הערה ששיניתי ועדיין לא שמרתי");
    await s.back.click();await s.discard.click();await expect(s.modal).toBeHidden();
    await expect(s.prompt).toBeHidden();expect(s.cloud.state()).toEqual(before);
    await s.open();await expect(s.notes).toHaveValue("הערה קיימת");
    await s.back.click();await expect(s.modal).toBeHidden();await expect(s.prompt).toBeHidden();
    expect(s.cloud.errors).toEqual([]);
  });
  test("image changes remain editable and only Save publishes them at root "+root,async({page,baseURL})=>{
    const s=await setup(page,baseURL,root),before=s.cloud.state().events[0].expenses[0];
    await upload(page,s.modal);const image=await s.modal.locator(".expense-attachment-preview").getAttribute("src");
    await s.back.click();await expect(s.prompt).toBeVisible();await s.keep.click();
    await expect(s.modal.locator(".expense-attachment-preview")).toHaveAttribute("src",image);
    expect(s.cloud.state().events[0].expenses[0]).toEqual(before);
    await s.save.click();await expect(s.modal).toBeHidden();
    await expect.poll(()=>s.cloud.state().events[0].expenses[0].attachmentImage).toBe(image);
    const after=s.cloud.state().events[0].expenses[0];
    for(const key of ["id","name","total","payers","sharedByParticipantIds","createdByParticipantId","occurredOn"])
      expect(after[key]).toEqual(before[key]);
    expect(s.cloud.writes.at(-1).state.events[0].expenses[0]).toEqual(after);
    await s.open();await s.back.click();await expect(s.modal).toBeHidden();await expect(s.prompt).toBeHidden();
    await s.open();await s.modal.locator('[data-action="remove-expense-attachment"]').click();
    await s.back.click();await expect(s.prompt).toBeVisible();await s.keep.click();
    await expect(s.modal.locator(".expense-attachment-preview")).toHaveCount(0);
    expect(s.cloud.state().events[0].expenses[0]).toEqual(after);
    await s.back.click();await s.discard.click();await s.open();
    await expect(s.modal.locator(".expense-attachment-preview")).toHaveAttribute("src",image);
    expect(s.cloud.errors).toEqual([]);
  });
}
test("reverting note text and cancelling a picker leave no false unsaved warning",async({page,baseURL})=>{
  const s=await setup(page,baseURL);
  await s.notes.fill("שינוי");await s.notes.fill("הערה קיימת");
  const pending=page.waitForEvent("filechooser");
  await s.modal.locator('[data-action="select-expense-attachment"]').click();
  await (await pending).setFiles([]);
  await s.back.click();await expect(s.modal).toBeHidden();await expect(s.prompt).toBeHidden();
  expect(s.cloud.errors).toEqual([]);
});
for(const action of ["home","groups","open-notifications","edit-profile"]){
  test("bottom navigation "+action+" respects unsaved notes and discards only after confirmation",async({page,baseURL})=>{
    const s=await setup(page,baseURL),before=s.cloud.state();
    await s.notes.fill("שינוי לפני מעבר");
    await page.locator('.event-route-primary-nav [data-action="'+action+'"]').click();
    await expect(s.prompt).toBeVisible();await s.keep.click();await expect(s.notes).toHaveValue("שינוי לפני מעבר");
    await page.locator('.event-route-primary-nav [data-action="'+action+'"]').click();
    await s.discard.click();await expect(s.modal).toBeHidden();await expect(s.prompt).toBeHidden();
    expect(s.cloud.state()).toEqual(before);expect(s.cloud.errors).toEqual([]);
    await page.goBack();await expect(s.modal).toBeHidden();await expect(s.prompt).toBeHidden();
  });
}
test("native and browser Back cancel the warning before leaving edited notes",async({page,baseURL})=>{
  const s=await setup(page,baseURL);await s.notes.fill("לא לאבד בחזרה");
  const nativeBack=()=>page.evaluate(()=>{
    const event=new CustomEvent("settle-friends:native-back",{cancelable:true});
    window.dispatchEvent(event);return event.defaultPrevented;
  });
  expect(await nativeBack()).toBe(true);await expect(s.prompt).toBeVisible();
  expect(await nativeBack()).toBe(true);await expect(s.prompt).toBeHidden();
  await expect(s.notes).toHaveValue("לא לאבד בחזרה");
  await page.goBack();await expect(s.prompt).toBeVisible();
  await page.goBack();await expect(s.prompt).toBeHidden();await expect(s.notes).toHaveValue("לא לאבד בחזרה");
  await s.back.click();await s.discard.click();await expect(s.modal).toBeHidden();
  await page.goBack();await expect(s.modal).toBeHidden();await expect(s.prompt).toBeHidden();
  expect(s.cloud.errors).toEqual([]);
});
test("Back cannot discard an expense while its real save is in flight",async({page,baseURL})=>{
  const s=await setup(page,baseURL);let release,started=false;
  const gate=new Promise(resolve=>release=resolve);
  await page.route("**/rest/v1/app_snapshots*",async route=>{
    if(["POST","PATCH"].includes(route.request().method())){started=true;await gate;}
    await route.fallback();
  });
  await s.notes.fill("שמירה ממתינה");await s.save.click();
  await expect.poll(()=>started).toBe(true);await s.back.click();
  await expect(s.modal).toBeVisible();await expect(s.prompt).toBeHidden();await expect(s.notes).toHaveValue("שמירה ממתינה");
  release();await expect(s.modal).toBeHidden();
  await expect.poll(()=>s.cloud.state().events[0].expenses[0].notes).toBe("שמירה ממתינה");
  expect(s.cloud.errors).toEqual([]);
});
