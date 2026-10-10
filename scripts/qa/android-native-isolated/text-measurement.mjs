function renderedTextMeasurements(selectors,scrollEach) {
  return (async()=>{
    const rows=[];
    for(const selector of selectors)for(const e of document.querySelectorAll(selector)){
      const initial=e.getBoundingClientRect(),style=getComputedStyle(e);
      if(!initial.width||!initial.height||!e.innerText.trim()||style.visibility!=='visible'||e.closest('details:not([open])'))continue;
      if(scrollEach){e.scrollIntoView({block:'center',inline:'nearest'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}
      const rect=e.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(e);
      const parent=e.closest('button,.transfer-row,.settlement-hero,.expense-row,[data-note-id],.profile-identity-copy')||e.parentElement;
      rows.push({selector,text:e.innerText,fontSize:parseFloat(getComputedStyle(e).fontSize),rect:rect.toJSON(),ink:range.getBoundingClientRect().toJSON(),glyphs:[...range.getClientRects()].filter(r=>r.width&&r.height).map(r=>r.toJSON()),parent:parent.getBoundingClientRect().toJSON(),rendered:true,inViewport:rect.bottom>0&&rect.top<innerHeight&&rect.right>0&&rect.left<innerWidth,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,overflow:style.overflow,textOverflow:style.textOverflow});
    }
    return rows;
  })();
}

export const textMeasurementExpression=(selectors,scrollEach=true)=>`(${renderedTextMeasurements.toString()})(${JSON.stringify(selectors)},${Boolean(scrollEach)})`;

export function glyphsFitContainer(row){
  const tolerance=1;
  return row.rendered&&row.inViewport&&row.glyphs.length>0&&row.glyphs.every(ink=>ink.left>=row.parent.left-tolerance&&ink.right<=row.parent.right+tolerance&&ink.top>=row.parent.top-tolerance&&ink.bottom<=row.parent.bottom+tolerance)&&(row.clientWidth<=0||row.scrollWidth<=row.clientWidth+tolerance)&&(row.clientHeight<=0||row.scrollHeight<=row.clientHeight+tolerance);
}
