import {expect, test} from '@playwright/test';

// Check the text itself after ordinary document scrolling, including the area
// occupied by persistent navigation. Wrapper visibility alone is insufficient.
export async function assertReadableTextLines(locator,{scroll=true}={}) {
  const reading = await locator.evaluate(element => {
    const box = element.getBoundingClientRect(), lines = new Map();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let closedDisclosureTextNodes=0;
    while (walker.nextNode()) {
      const text = walker.currentNode;
      // WebKit exposes Range boxes for the concealed body of closed details.
      // Its summary is painted; its body is checked when the journey opens it.
      const closed=text.parentElement.closest('details:not([open])');
      if(closed&&!closed.querySelector(':scope > summary')?.contains(text.parentElement)) {
        closedDisclosureTextNodes++;
        continue;
      }
      for (let index = 0; index < text.length; index++) {
        if (!text.textContent[index].trim()) continue;
        const range = document.createRange(); range.setStart(text,index); range.setEnd(text,index+1);
        for (const rect of range.getClientRects()) {
          if (!rect.width || !rect.height) continue;
          const top = rect.top + scrollY, key = Math.round(top * 10), previous = lines.get(key);
          lines.set(key,{top,height:rect.height,left:Math.min(previous?.left??rect.left,rect.left),right:Math.max(previous?.right??rect.right,rect.right),text:(previous?.text??'')+text.textContent[index]});
        }
      }
    }
    return {text:element.textContent.trim(),left:box.left,right:box.right,viewport:innerWidth,closedDisclosureTextNodes,lines:[...lines.values()]};
  });
  expect(reading.lines.length,reading.text).toBeGreaterThan(0);
  for (const line of reading.lines) {
    expect(line.left,'text glyphs stay inside their horizontal content area').toBeGreaterThanOrEqual(Math.max(0,reading.left)-1);
    expect(line.right,'text glyphs stay inside their horizontal content area').toBeLessThanOrEqual(Math.min(reading.viewport,reading.right)+1);
    if(scroll)await locator.evaluate((element,line) => {
      const nav = document.querySelector('.product-app-nav')?.getBoundingClientRect();
      const route = document.querySelector('.product-route-controls')?.getBoundingClientRect();
      const header = document.querySelector('.product-app-identity')?.getBoundingClientRect();
      const top = Math.max(0,route?.bottom??0,Math.min(header?.bottom??0,innerHeight));
      const bottom = nav?.top??innerHeight;
      scrollTo({top:line.top-(top+bottom-line.height)/2,behavior:'instant'});
    },line);
    const check=()=>locator.evaluate((element,line)=>{
      const nav = document.querySelector('.product-app-nav')?.getBoundingClientRect();
      const route = document.querySelector('.product-route-controls')?.getBoundingClientRect();
      const top = Math.max(0,route?.bottom??0), bottom = nav?.top??innerHeight, y = line.top-scrollY;
      const hit = document.elementFromPoint((line.left+line.right)/2,y+line.height/2);
      return {readable:y>=top-1 && y+line.height<=bottom+1 && !!hit && (hit===element||element.contains(hit)),y,top,bottom,scrollY,hit:hit?.outerHTML.slice(0,500)};
    },line);
    try {
      await expect.poll(async()=>(await check()).readable,{message:`each text line can be read above navigation: ${reading.text}`}).toBe(true);
    } catch(error) {
      await test.info().attach('unreadable-text-line',{body:JSON.stringify({reading,line,actual:await check()},null,2),contentType:'application/json'});
      throw error;
    }
  }
  return reading;
}

export async function assertLargeSettlementContentFlow(page) {
  await page.evaluate(()=>document.fonts.ready);
  const flow = await page.locator('.settlement-screen').evaluate(screen => {
    const selectors=['.product-app-identity','.event-overview-header','.event-workspace-nav','.settlement-hero','.settlement-stage'];
    const visible=element=>{const r=element.getBoundingClientRect();return r.width>0&&r.height>0};
    const describe=element=>{
      const rect=element.getBoundingClientRect(),style=getComputedStyle(element);
      return {top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right,
        marginTop:parseFloat(style.marginTop),marginBottom:parseFloat(style.marginBottom),
        paddingTop:parseFloat(style.paddingTop),paddingBottom:parseFloat(style.paddingBottom),
        borderTop:parseFloat(style.borderTopWidth),borderBottom:parseFloat(style.borderBottomWidth)};
    };
    const hero=screen.querySelector('.settlement-hero');
    return {
      order:[...screen.children].filter(visible).map(element=>selectors.find(selector=>element.matches(selector))??element.className),
      blocks:selectors.map(selector=>({selector,...describe(screen.querySelector(selector))})),
      hero:describe(hero),heroChildren:[...hero.children].filter(visible).map(describe),
      stage:describe(screen.querySelector('.settlement-stage')),
      heading:describe(screen.querySelector('.settlement-stage-heading')),
      root:parseFloat(getComputedStyle(document.documentElement).fontSize),
      fonts:['.settlement-hero-title-row h2','.settlement-hero-title-row p','.settlement-close-primary','.settlement-stage-heading h2','.settlement-stage-heading > div > small'].map(selector=>({selector,size:parseFloat(getComputedStyle(screen.querySelector(selector)).fontSize)}))
    };
  });
  await test.info().attach('settlement-content-flow',{body:JSON.stringify(flow,null,2),contentType:'application/json'});
  expect(flow.order).toEqual(['.product-app-identity','.event-overview-header','.event-workspace-nav','.settlement-hero','.settlement-stage']);
  // These are the authored, unchanged 7a268ca4 spacings. Text and controls may
  // grow naturally; an extra empty band or an enlarged margin must still fail.
  expect(flow.blocks.map(block=>[block.marginTop,block.marginBottom])).toEqual([[0,0],[8,12],[0,12],[12,12],[0,18]]);
  for(let index=1;index<flow.blocks.length;index++) {
    const previous=flow.blocks[index-1],current=flow.blocks[index];
    const expectedGap=Math.max(previous.marginBottom,current.marginTop);
    expect(Math.abs(current.top-previous.bottom-expectedGap),`${current.selector} has only the authored gap`).toBeLessThanOrEqual(1);
  }
  expect([flow.hero.paddingTop,flow.hero.paddingBottom,flow.stage.paddingTop]).toEqual([20,20,2]);
  expect(flow.heroChildren).toHaveLength(2);
  expect(Math.abs(flow.heroChildren[0].top-flow.hero.top-flow.hero.paddingTop-flow.hero.borderTop),'hero has no empty space before its copy').toBeLessThanOrEqual(1);
  expect(Math.abs(flow.hero.bottom-flow.hero.paddingBottom-flow.hero.borderBottom-flow.heroChildren[1].bottom),'hero has no empty space after its action').toBeLessThanOrEqual(1);
  expect(Math.abs(flow.heroChildren[1].top-flow.heroChildren[0].bottom-16),'hero keeps its authored copy-to-action gap').toBeLessThanOrEqual(1);
  expect(Math.abs(flow.heading.top-flow.stage.top-flow.stage.paddingTop),'transfer heading follows the preceding content').toBeLessThanOrEqual(1);
  for(const [index,ratio] of [1.25,.875,.9375,1.375,.75].entries()) {
    expect(flow.fonts[index].size,flow.fonts[index].selector).toBeCloseTo(flow.root*ratio,1);
  }
  const readings=[];
  for(const selector of ['.event-overview-header h1','.event-overview-header .event-header-meta','.event-header-action-label','.settlement-hero-title-row h2','.settlement-hero-title-row p','.settlement-close-primary','.settlement-stage-heading h2','.settlement-stage-heading > div > small','.settlement-transfer-board .transfer-row']) {
    const locators=selector.endsWith('.transfer-row')?[page.locator(selector).first()]:await page.locator(selector).all();
    expect(locators.length,selector).toBeGreaterThan(0);
    for(const locator of locators)readings.push({selector,...await assertReadableTextLines(locator)});
  }
  await test.info().attach('settlement-readable-lines',{body:JSON.stringify(readings,null,2),contentType:'application/json'});
}
