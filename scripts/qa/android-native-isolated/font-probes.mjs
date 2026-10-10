export const fontProbeExpression=`(() => {
  const spans=['16px','1rem'].map(size=>{const e=document.createElement('span');e.textContent='Native QA font probe';e.setAttribute('aria-hidden','true');e.style.cssText='position:fixed;inset:0 auto auto 0;visibility:hidden;pointer-events:none;font-family:monospace;';e.style.setProperty('font-size',size,'important');document.body.append(e);return e;});
  try{return spans.map((e,index)=>{const range=document.createRange();range.selectNodeContents(e);return{authored:index?'1rem':'16px',computed:parseFloat(getComputedStyle(e).fontSize),glyph:range.getBoundingClientRect().toJSON()};});}finally{spans.forEach(e=>e.remove());}
})()`;
