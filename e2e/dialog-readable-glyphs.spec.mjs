import {test,expect} from '@playwright/test';
import {readable as readFriends} from './helpers/eventFriendsPicker.mjs';
import {readable as readManual} from './helpers/eventExistingManualParticipant.mjs';

const readers=[['friends',readFriends,'event-friends-picker-screen'],['manual',readManual,'event-manual-name-screen']];
async function fixture(page,hostClass){
  await page.setViewportSize({width:320,height:390});
  await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>
    html,body{margin:0}.host{position:fixed;inset:0 0 80px;overflow-y:auto;background:white}
    .before{height:450px}.copy{display:block;margin:0 16px;font:28px/1.3 sans-serif}.after{height:600px}
    .product-app-nav{position:fixed;inset:auto 0 0;height:80px;background:white}
    </style><section class="host ${hostClass}"><div class="before"></div><p class="copy">שם המשתתף באירוע</p><div class="after"></div></section><nav class="product-app-nav"></nav>`);
  return page.locator('.copy');
}
for(const[name,readable,hostClass]of readers){
  test(`${name}: late content moves glyphs after the initial measurement`,async({page})=>{
    const target=await fixture(page,hostClass);
    let moved=false;
    const duringRead={evaluate:async(fn,arg)=>{
      const value=await target.evaluate(fn,arg);
      if(!moved){moved=true;await page.locator('.before').evaluate(e=>e.style.height='640px');}
      return value;
    }};
    await readable(duringRead);
    expect(moved).toBe(true);
    expect(await target.evaluate(e=>{
      const r=document.createRange();r.selectNodeContents(e);
      const lines=[...r.getClientRects()].filter(r=>r.width&&r.height),last=lines.at(-1);
      const hit=last&&document.elementFromPoint((last.left+last.right)/2,(last.top+last.bottom)/2);
      return !!hit&&e.contains(hit);
    })).toBe(true);
  });
  test(`${name}: added text is remeasured through the final visible line`,async({page})=>{
    const target=await fixture(page,hostClass);
    let changed=false;
    const duringRead={evaluate:async(fn,arg)=>{
      const value=await target.evaluate(fn,arg);
      if(!changed){changed=true;await target.evaluate(e=>e.textContent='שם המשתתף הארוך באירוע המשותף שלנו עם המשפחה והחברים לקראת סוף השבוע הקרוב');}
      return value;
    }};
    await readable(duringRead);
    expect(changed).toBe(true);
    expect(await target.evaluate(e=>{
      const r=document.createRange();r.selectNodeContents(e);
      const last=[...r.getClientRects()].filter(r=>r.width&&r.height).at(-1);
      const hit=last&&document.elementFromPoint((last.left+last.right)/2,(last.top+last.bottom)/2);
      return !!hit&&e.contains(hit);
    })).toBe(true);
  });
}
test('transparent checkbox within the same label retains the original valid hit target',async({page})=>{
  await fixture(page,'event-friends-picker-screen');
  await page.locator('.copy').evaluate(e=>{
    const label=document.createElement('label');label.style.cssText='display:block;position:relative';e.replaceWith(label);label.append(e);
    const input=document.createElement('input');input.type='checkbox';input.style.cssText='position:absolute;inset:0;width:100%;height:100%;opacity:0';label.append(input);
  });
  await readFriends(page.locator('.copy'));
});
for(const[mode,change]of[
  ['permanent overlay',e=>{const cover=document.createElement('div');cover.style.cssText='position:fixed;inset:0;z-index:999';document.body.append(cover)}],
  ['clipped glyphs',e=>e.style.cssText='width:8px;padding:0;white-space:nowrap;overflow:hidden'],
  ['missing glyphs',e=>e.style.display='none']
])test(`dialog glyph reader still rejects ${mode}`,async({page})=>{
  const target=await fixture(page,'event-friends-picker-screen');await target.evaluate(change);
  await expect(readFriends(target)).rejects.toThrow();
});
