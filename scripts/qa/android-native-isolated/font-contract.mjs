import {scaledFontSizeMatches} from './font-ratio.mjs';

export const fontContractContextExpression=`(() => ({width:innerWidth,height:innerHeight,pointerCoarse:matchMedia('(pointer: coarse)').matches,pointerFine:matchMedia('(pointer: fine)').matches,orientation:matchMedia('(orientation: portrait)').matches?'portrait':'landscape',active:document.documentElement.classList.contains('dynamic-type-active'),dynamicType:document.documentElement.dataset.dynamicType}))()`;

const headings=new Set(['.product-home-screen .top .brand h1','.event-overview-header h1','[data-screen-kind="event-notes"] h1','[data-screen-kind="profile"] h1']);
export function hasAuthoredFontContract(selector){return headings.has(selector)||['.event-header-action-label','.event-workspace-tab strong'].includes(selector);}

// Fixed authored sizes come from the public 9e96d41 design, not the measured
// Native font. The independent APK CSS/font replay records the same values at
// CSS root16, both pointer families and the actual Native CSS viewports.
export function authoredNativeFontBase(selector,context){
  if(!hasAuthoredFontContract(selector))throw new Error('No authored font contract for '+selector);
  const {scale,width,height,pointerCoarse,orientation,active,dynamicType}=context;
  if(![1,1.5,2].includes(scale)||!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||typeof pointerCoarse!=='boolean')throw new Error('Actual scale, viewport and pointer media readbacks are required');
  if(orientation!==(width>height?'landscape':'portrait'))throw new Error('Font contract orientation differs from actual viewport');
  if(active!==(scale>1)||dynamicType!==(scale===1?'normal':'extra-large'))throw new Error('Font contract requires the actual settled dynamic type class');
  const coarsePortrait=pointerCoarse&&orientation==='portrait'&&width<=720;
  const coarseLandscape=pointerCoarse&&orientation==='landscape'&&height<=450;
  if(selector==='.event-workspace-tab strong')return coarsePortrait||coarseLandscape?14:13.5;
  // The utility buttons now sit outside .top. Active type gives the button
  // --dynamic-text-16 and its span inherits it, instead of the old11px header.
  if(selector==='.event-header-action-label')return active?16:11.5;
  // publicDesignCoherenceLayer's two pointer:coarse queries deliberately use
  // 1.5rem/1.25rem headings. They outrank the general AX h1 size.
  if(coarsePortrait)return 24;
  if(coarseLandscape)return 20;
  if(active){
    // The phone home/event rules use28; the other AX headings use32. Wide
    // event/home screens fall back to the general32px semantic heading.
    return ['.product-home-screen .top .brand h1','.event-overview-header h1'].includes(selector)&&width<=720?28:32;
  }
  if(selector==='.product-home-screen .top .brand h1')return width<=720?29:48;
  return 28;
}

export function authoredNativeFontMatches(actual,selector,context){return scaledFontSizeMatches(actual,authoredNativeFontBase(selector,context),context.scale);}

export async function actualAuthoredFontRules(page,selectors){
  await page.command('DOM.enable');await page.command('CSS.enable');
  const {root}=await page.command('DOM.getDocument',{depth:0});
  const rows=[];
  const fonts=style=>(style?.cssProperties||[]).filter(p=>['font','font-size','--dynamic-text-16','--dynamic-text-28','--dynamic-text-32'].includes(p.name)&&!p.disabled);
  for(const selector of selectors){
    const {nodeId}=await page.command('DOM.querySelector',{nodeId:root.nodeId,selector});
    if(!nodeId)throw new Error('Actual font contract target missing: '+selector);
    const matched=await page.command('CSS.getMatchedStylesForNode',{nodeId});
    const computed=await page.command('CSS.getComputedStyleForNode',{nodeId});
    const rules=list=>(list||[]).flatMap(m=>{const properties=fonts(m.rule.style);return properties.length?[{selector:m.rule.selectorList.text,origin:m.rule.origin,styleSheetId:m.rule.styleSheetId,media:m.rule.media,properties}]:[];});
    rows.push({selector,nodeId,computed:computed.computedStyle.filter(p=>['font-size','font-family','--dynamic-text-16','--dynamic-text-28','--dynamic-text-32'].includes(p.name)),matched:rules(matched.matchedCSSRules),inherited:(matched.inherited||[]).map(entry=>({inline:fonts(entry.inlineStyle),matched:rules(entry.matchedCSSRules)}))});
  }
  return {kind:'Read-only actual target CSSOM font rules; never used to derive the expected size',rows};
}
