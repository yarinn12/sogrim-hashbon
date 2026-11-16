import{expect}from'@playwright/test';import{readFileSync}from'node:fs';
export const paint=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
export async function reach(page,locator){
 await locator.evaluate(e=>e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));await paint(page);
 for(let i=0;i<4;i++){
  const delta=await locator.evaluate(e=>{const b=e.getBoundingClientRect(),dialog=e.closest('dialog'),d=dialog?.getBoundingClientRect(),routes=[...document.querySelectorAll('.product-route-controls button')].map(e=>e.getBoundingClientRect()).filter(r=>r.height&&r.top>=0&&r.top<80),top=dialog?d.top+4:Math.max(0,...routes.map(r=>r.bottom))+6,bottom=dialog?d.bottom-4:(document.querySelector('.product-app-nav')?.getBoundingClientRect().top??innerHeight)-6;return b.top<top?b.top-top:b.bottom>bottom?b.bottom-bottom:0});
  if(Math.abs(delta)<.5)break;
  const before=await page.evaluate(()=>scrollY),modal=await locator.evaluate(e=>Boolean(e.closest('dialog')));
  const adjustment=delta>0?Math.ceil(delta):Math.floor(delta);
  await locator.evaluate((e,y)=>{const d=e.closest('dialog');(d||window).scrollBy({top:y,left:0,behavior:'instant'})},adjustment);await paint(page);
  // In short Firefox RTL pages a just-completed scrollIntoView can ignore the
  // following window scroll command. Use actual wheel input if it made no
  // progress. Keep the same bounds, target-size and real hit assertions.
  if(!modal&&page.context().browser()?.browserType().name()==='firefox'&&Math.abs((await page.evaluate(()=>scrollY))-before)<.5){
   const size=page.viewportSize();await page.mouse.move(size.width/2,Math.min(125,size.height/2));await page.mouse.wheel(0,delta);await paint(page);
  }
 }
 const p=await locator.evaluate(e=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);return{width:r.width,height:r.height,x,y,hit:h===e||e.contains(h)}});
 expect(p.width).toBeGreaterThanOrEqual(43.99);expect(p.height).toBeGreaterThanOrEqual(43.99);expect(p.hit).toBe(true);return p;
}
export async function click(page,locator){await expect(locator).toBeVisible();await expect(locator).toBeEnabled();const p=await reach(page,locator);await page.mouse.click(p.x,p.y);await paint(page)}
export async function open(page,view,{root=16,width=393,height=852}={}){
 await page.setViewportSize({width,height});
 const invite=view.startsWith('invite-'),block=['blocked','unblock-error'].includes(view);
 await page.goto('/?crop-invite-block-qa=1&requests=empty&reward=inactive'+(root>16?'&dynamic-type-preview='+root:'')+(invite?'&friend=abcdefabcdefabcdefab&invite-mode='+view.slice(7):'')+(block?'&participant-safety-batch=1':'')+(view==='unblock-error'?'&unblock-mode=error':'')+(process.env.CROP_INVITE_BLOCK_NATIVE?'&native=1':''));
 await page.evaluate(()=>document.fonts.ready);
 if(invite){await expect(page.locator('[data-invite-state="'+view.slice(7)+'"]')).toBeVisible();return page.locator('.friend-invitation-screen')}
 const nav=page.getByRole('navigation',{name:'ניווט ראשי',exact:true});await click(page,nav.getByRole('button',{name:view==='crop'?'פרופיל':'חברים',exact:true}));
 if(view==='crop'){
  const picker=page.locator('.profile-avatar-picker-shell');await click(page,picker.locator('summary'));
  const chooser=page.waitForEvent('filechooser');await click(page,picker.locator('[data-action="choose-profile-avatar-image"][data-image-source="gallery"]'));
  await(await chooser).setFiles({name:'qa-avatar.png',mimeType:'image/png',buffer:readFileSync(new URL('../../assets/avatars/avatar-3.png',import.meta.url))});
  const modal=page.locator('.image-crop-dialog[open]');await expect(modal).toBeVisible();await expect.poll(()=>modal.locator('[data-crop-preview]').evaluate(e=>e.complete&&e.naturalWidth>0)).toBe(true);await paint(page);return modal;
 }
 const panel=page.locator('.blocked-users-panel');await click(page,panel.locator('summary'));await expect(panel).toHaveAttribute('open','');await paint(page);return panel;
}
export async function geometry(page,scope,view,root){
 const m=await scope.evaluate(e=>{
  const box=e.getBoundingClientRect(),bad=[];for(const child of e.querySelectorAll('*')){if(!child.getClientRects().length||child.closest('svg,[aria-hidden="true"],.visually-hidden'))continue;for(const n of child.childNodes){if(n.nodeType!==3||!n.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(n);for(const r of range.getClientRects())if(r.width&&(r.left<Math.max(0,box.left)-1||r.right>Math.min(innerWidth,box.right)+1))bad.push(n.textContent.trim().slice(0,90))}}
  return{width:innerWidth,document:document.documentElement.scrollWidth,bad};
 });expect(m.document).toBeLessThanOrEqual(m.width+1);expect(m.bad).toEqual([]);
 const selector=view==='crop'?'.image-crop-title':view.startsWith('invite-')?'.friend-invite-state-title':'.blocked-user-row strong';
 for(const label of await scope.locator(selector).all())expect(await label.evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeCloseTo(root*(view==='crop'?1.125:view.startsWith('invite-')?1.25:1),1);
 for(const control of await scope.locator('button:visible:not([disabled]),input[type="range"]:visible').all())await reach(page,control);
 return m;
}
export const financial=page=>page.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('qa-invite-server-row')).state.events));
