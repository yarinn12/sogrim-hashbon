import {expect,test} from '@playwright/test';

async function probe(element,{hostSelector,index=0,scroll=false}){
  await document.fonts.ready;
  const host=element.closest(hostSelector);
  if(!host)return {text:element.textContent,lines:[],readable:false,missingHost:true};
  const collect=()=>{
    const rows=new Map(),walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);
    let text;
    while(text=walker.nextNode())for(let i=0;i<text.length;i++){
      if(!text.textContent[i].trim())continue;
      const range=document.createRange();range.setStart(text,i);range.setEnd(text,i+1);
      for(const rect of range.getClientRects())if(rect.width&&rect.height){
        const top=rect.top+host.scrollTop,key=Math.round(top*10),prior=rows.get(key);
        rows.set(key,{top,h:rect.height,left:Math.min(prior?.left??rect.left,rect.left),right:Math.max(prior?.right??rect.right,rect.right)});
      }
    }
    return [...rows.values()];
  };
  const bounds=()=>{
    const modal=host.getBoundingClientRect();
    const nav=[...document.querySelectorAll('.product-app-nav')].find(e=>e.getClientRects().length)?.getBoundingClientRect();
    return {top:Math.max(0,modal.top),bottom:Math.min(innerHeight,modal.bottom,nav?.top??innerHeight)};
  };
  let lines=collect(),row=lines[index];
  if(scroll&&row){
    const {top,bottom}=bounds();
    host.scrollTop+=row.top-host.scrollTop-(top+bottom-row.h)/2;
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    lines=collect();row=lines[index];
  }
  if(!row)return {text:element.textContent,lines,readable:false};
  const {top,bottom}=bounds(),y=row.top-host.scrollTop;
  const hit=document.elementFromPoint((row.left+row.right)/2,y+row.h/2);
  // Keep the original accessible checkbox overlay allowance, scoped to the
  // same label. An unrelated transparent input must still fail the hit test.
  const ownedHit=hit&&(hit===element||element.contains(hit)||hit.matches('input')
    &&getComputedStyle(hit).opacity==='0'&&element.closest('label')?.contains(hit));
  return {text:element.textContent,lines,row,top,bottom,y,
    readable:y>=top-1&&y+row.h<=bottom+1&&!!ownedHit,hit:hit?.outerHTML.slice(0,500)};
}

export async function readDialogGlyphs(locator,hostSelector){
  let initial,last,index;
  try{
    await expect.poll(async()=>{
      initial=await locator.evaluate(probe,{hostSelector});
      if(!initial.lines.length)return false;
      for(index=0;index<initial.lines.length;index++){
        last=await locator.evaluate(probe,{hostSelector,index,scroll:true});
        if(last.text!==initial.text||last.lines.length!==initial.lines.length||!last.readable)return false;
      }
      last=await locator.evaluate(probe,{hostSelector});
      return last.text===initial.text&&last.lines.length===initial.lines.length;
    }).toBe(true);
  }catch(error){
    await test.info().attach('dialog-readable-glyph-failure',{body:JSON.stringify({hostSelector,index,initial,last},null,2),contentType:'application/json'});
    throw error;
  }
}
