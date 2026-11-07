// Range rectangles include the font em box; use the loaded font's actual
// painted vertical metrics and retain raw Range rectangles in the evidence.
export function paintedGlyphRect(rect,metrics){
  const values=['fontBoundingBoxAscent','fontBoundingBoxDescent','actualBoundingBoxAscent','actualBoundingBoxDescent'].map(key=>metrics[key]);
  if(values.some(value=>!Number.isFinite(value))||Math.abs(rect.height-values[0]-values[1])>1)return null;
  const baseline=(rect.top+rect.bottom+values[0]-values[1])/2;
  return {left:rect.left,right:rect.right,top:baseline-values[2],bottom:baseline+values[3]};
}

function renderedTextMeasurements(selectors,scrollEach,paintedGlyphRect) {
  return (async()=>{
    const rows=[],canvas=document.createElement('canvas').getContext('2d');
    for(const selector of selectors)for(const e of document.querySelectorAll(selector)){
      if(!e.textContent.trim()||e.closest('details:not([open])'))continue;
      // Product nav visibility changes after scrolling. Observe after reflow.
      if(scrollEach){e.scrollIntoView({block:'center',inline:'nearest'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}
      const rect=e.getBoundingClientRect(),style=getComputedStyle(e);
      if(!rect.width||!rect.height||style.visibility!=='visible'||style.display==='none')continue;
      const range=document.createRange();range.selectNodeContents(e);
      const parent=e.closest('button,.transfer-row,.settlement-hero,.expense-row,[data-note-id],.profile-identity-copy,.product-brand-lockup,.top')||e.parentElement;
      const glyphs=[],metrics=[],walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);let node,paintedMetricsComparable=true;
      while(node=walker.nextNode()){
        const font=getComputedStyle(node.parentElement);canvas.font=`${font.fontStyle} ${font.fontWeight} ${font.fontSize} ${font.fontFamily}`;
        const segments=new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(node.textContent);
        for(const {segment,index} of segments){
          if(!segment.trim())continue;
          const character=document.createRange();character.setStart(node,index);character.setEnd(node,index+segment.length);
          const m=canvas.measureText(segment),measurement={fontBoundingBoxAscent:m.fontBoundingBoxAscent,fontBoundingBoxDescent:m.fontBoundingBoxDescent,actualBoundingBoxAscent:m.actualBoundingBoxAscent,actualBoundingBoxDescent:m.actualBoundingBoxDescent};
          for(const r of character.getClientRects()){
            if(!r.width||!r.height)continue;
            const ink=paintedGlyphRect(r,measurement);if(!ink)paintedMetricsComparable=false;
            // A complete font Range contained by every clipping ancestor is
            // a stronger bound than ink. Do not infer a baseline when Canvas
            // and DOM metrics differ; retain the entire conservative box.
            glyphs.push(ink||{left:r.left,right:r.right,top:r.top,bottom:r.bottom});metrics.push({segment,font:canvas.font,method:ink?'canvas-painted-vertical':'range-em-conservative',range:r.toJSON(),...measurement});
          }
        }
      }
      const clips=[];
      for(let ancestor=e;ancestor;ancestor=ancestor.parentElement){
        const s=getComputedStyle(ancestor),r=ancestor.getBoundingClientRect();
        for(const [axis,overflow] of [['x',s.overflowX],['y',s.overflowY]])if(['hidden','clip','auto','scroll'].includes(overflow))clips.push({axis,tag:ancestor.tagName,className:ancestor.className,left:r.left,right:r.right,top:r.top,bottom:r.bottom});
      }
      rows.push({selector,text:e.innerText,fontSize:parseFloat(style.fontSize),rect:rect.toJSON(),emBounds:range.getBoundingClientRect().toJSON(),emRects:[...range.getClientRects()].filter(r=>r.width&&r.height).map(r=>r.toJSON()),glyphs,metrics,paintedMetricsComparable,clips,parent:parent.getBoundingClientRect().toJSON(),rendered:true,inViewport:rect.bottom>0&&rect.top<innerHeight&&rect.right>0&&rect.left<innerWidth,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,overflow:style.overflow,overflowX:style.overflowX,overflowY:style.overflowY,textOverflow:style.textOverflow,whiteSpace:style.whiteSpace});
    }
    return rows;
  })();
}

export const textMeasurementExpression=(selectors,scrollEach=true)=>`(${renderedTextMeasurements.toString()})(${JSON.stringify(selectors)},${Boolean(scrollEach)},(${paintedGlyphRect.toString()}))`;

export function glyphsFitContainer(row){
  const tolerance=1;
  return row.rendered&&row.inViewport&&row.inkMetricsValid!==false&&row.glyphs.length>0&&row.glyphs.every(ink=>ink.left>=row.parent.left-tolerance&&ink.right<=row.parent.right+tolerance&&ink.top>=row.parent.top-tolerance&&ink.bottom<=row.parent.bottom+tolerance&&(row.clips||[]).every(clip=>clip.axis==='x'?ink.left>=clip.left-tolerance&&ink.right<=clip.right+tolerance:ink.top>=clip.top-tolerance&&ink.bottom<=clip.bottom+tolerance));
}

// Only intentional note-list ellipses qualify, with separate full disclosure.
export function notePreviewFitsContainer(row,fullDisclosure){
  if(glyphsFitContainer(row))return true;
  if(!fullDisclosure||!['.event-note-title-line strong','.event-note-preview'].includes(row.selector)||row.textOverflow!=='ellipsis'||row.whiteSpace!=='nowrap'||row.overflowX!=='hidden')return false;
  const visible={...row,glyphs:row.glyphs.map(ink=>({...ink,left:Math.max(ink.left,row.rect.left),right:Math.min(ink.right,row.rect.right)})).filter(ink=>ink.right>ink.left)};
  return glyphsFitContainer(visible);
}
