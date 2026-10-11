export const fontProbeExpression=`(() => {
  const spans=['16px','1rem'].map(size=>{const e=document.createElement('span');e.textContent='Native QA font probe';e.setAttribute('aria-hidden','true');e.style.cssText='position:fixed;inset:0 auto auto 0;visibility:hidden;pointer-events:none;font-family:monospace;';e.style.setProperty('font-size',size,'important');document.body.append(e);return e;});
  try{return spans.map((e,index)=>{const range=document.createRange();range.selectNodeContents(e);return{authored:index?'1rem':'16px',computed:parseFloat(getComputedStyle(e).fontSize),glyph:range.getBoundingClientRect().toJSON()};});}finally{spans.forEach(e=>e.remove());}
})()`;

// Diagnostic readbacks never replace the immediate measurements used by the
// acceptance guard. Preserve a failed control while observing later paints.
export const fontPaintDiagnosticExpression=`(async () => {
  const startedAt=performance.now();
  const styleOf=e=>{if(!e)throw new Error('Font diagnostic target missing');const s=getComputedStyle(e);return{fontSize:s.fontSize,transitionProperty:s.transitionProperty,transitionDuration:s.transitionDuration,animationName:s.animationName,animationDuration:s.animationDuration};};
  const read=frame=>({frame,elapsedMs:performance.now()-startedAt,root:styleOf(document.documentElement),brand:styleOf(document.querySelector('.product-brand-copy strong')),probes:${fontProbeExpression},inlineRootFont:document.documentElement.style.getPropertyValue('font-size'),inlinePriority:document.documentElement.style.getPropertyPriority('font-size'),androidFontScale:getComputedStyle(document.documentElement).getPropertyValue('--android-font-scale'),reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,visibilityState:document.visibilityState,animations:document.getAnimations().map(a=>({playState:a.playState,currentTime:a.currentTime,property:a.transitionProperty||null}))});
  const snapshots=[read(0)];
  for(let frame=1;frame<=2;frame++){await new Promise(resolve=>requestAnimationFrame(resolve));snapshots.push(read(frame));}
  return{kind:'Additional paint observations only; immediate guard remains authoritative',snapshots};
})()`;
