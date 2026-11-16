import {test,expect} from '@playwright/test';
import {readable} from './helpers/syncNoticePresentation.mjs';

test.beforeEach(async({page})=>{
  await page.setViewportSize({width:360,height:740});
  await page.setContent(`<!doctype html><html lang="he" dir="rtl"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    html{font-size:20px}body{margin:20px;font-family:Arial,sans-serif;padding-bottom:800px}
    #status{margin-top:400px;line-height:1.6}#target{display:block;padding:12px;font-size:1rem;line-height:1.5}
    .product-app-nav{position:fixed;bottom:12px;left:12px;right:12px;height:82px;background:white;border:1px solid #ddd}
    </style><p id="status">עדכונים בשני אירועים לא סונכרנו.</p><details><summary id="target">באילו אירועים?</summary></details><nav class="product-app-nav">ניווט</nav></html>`);
});

test('late status content growth keeps every glyph reachable',async({page},info)=>{
  const target=page.locator('#target');
  const before=await target.boundingBox();
  let grew=false;
  const duringRead={evaluate:async(fn,arg)=>{
    const result=await target.evaluate(fn,arg);
    if(!grew){
      grew=true;
      await page.locator('#status').evaluate(element=>element.textContent='עדכונים בשני אירועים לא סונכרנו. השרת דחה שמירה בגלל הרשאה. פרטי האירועים מופיעים כאן. העדכונים הממתינים שמורים במכשיר הזה.');
    }
    return result;
  }};
  await readable(duringRead);
  expect(grew).toBe(true);
  await info.attach('late-status-growth',{body:JSON.stringify({before,after:await target.boundingBox(),grew}),contentType:'application/json'});
});

test('late target text growth checks every added line',async({page},info)=>{
  const target=page.locator('#target');
  let grew=false;
  const duringRead={evaluate:async(fn,arg)=>{
    const result=await target.evaluate(fn,arg);
    if(!grew){
      grew=true;
      await target.evaluate(element=>element.textContent='סוף השבוע בצפון — השמירה נחסמה בגלל הרשאה. פרטי האירוע והעדכונים הממתינים נשמרו במכשיר הזה.');
    }
    return result;
  }};
  await readable(duringRead);
  expect(grew).toBe(true);
  const lines=await target.evaluate(element=>{const range=document.createRange();range.selectNodeContents(element);return [...new Set([...range.getClientRects()].filter(rect=>rect.width&&rect.height).map(rect=>Math.round(rect.top*10)))]});
  expect(lines.length).toBeGreaterThan(1);
  await info.attach('late-target-growth',{body:JSON.stringify({lines:lines.length,grew}),contentType:'application/json'});
});

test('readable waits for transiently unpainted glyphs',async({page})=>{
  const target=page.locator('#target');
  // display:none makes Range return no glyphs, as during a status replacement.
  await target.evaluate(element=>element.style.display='none');
  let painted=false;
  const duringRead={evaluate:async(fn,arg)=>{
    const result=await target.evaluate(fn,arg);
    if(!painted){
      painted=true;
      await target.evaluate(element=>element.style.display='block');
    }
    return result;
  }};
  await readable(duringRead);
  expect(painted).toBe(true);
});

test('readable still rejects a persistent pointer blocker',async({page})=>{
  await page.evaluate(()=>{const blocker=document.createElement('div');blocker.id='blocker';Object.assign(blocker.style,{position:'fixed',inset:'0',zIndex:'9999',background:'rgba(255,0,0,.05)'});document.body.append(blocker)});
  await expect(readable(page.locator('#target'))).rejects.toThrow(/Expected:.*true/s);
});

test('readable still rejects permanently missing glyphs',async({page})=>{
  await page.locator('#target').evaluate(element=>element.style.display='none');
  await expect(readable(page.locator('#target'))).rejects.toThrow(/Expected:.*true/s);
});

test('readable still rejects clipped visible glyphs',async({page})=>{
  await page.locator('#target').evaluate(element=>Object.assign(element.style,{width:'8px',padding:'0',whiteSpace:'nowrap',overflow:'hidden'}));
  await expect(readable(page.locator('#target'))).rejects.toThrow(/Expected:.*true/s);
});

test('readable still rejects clipping on a late added line',async({page})=>{
  const target=page.locator('#target');
  let grew=false;
  const duringRead={evaluate:async(fn,arg)=>{
    const result=await target.evaluate(fn,arg);
    if(!grew){
      grew=true;
      await target.evaluate(element=>{
        element.textContent='סוף השבוע בצפון — השמירה נחסמה בגלל הרשאה. פרטי האירוע והעדכונים הממתינים נשמרו במכשיר הזה.';
        Object.assign(element.style,{height:'30px',overflow:'hidden'});
      });
    }
    return result;
  }};
  await expect(readable(duringRead)).rejects.toThrow(/Expected:.*true/s);
  expect(grew).toBe(true);
});
