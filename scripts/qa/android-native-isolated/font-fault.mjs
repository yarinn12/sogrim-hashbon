export function stackedAndroidStylesheetFault(original) {
  if(typeof original!=='string'||!original.trim())throw new Error('Require actual dynamic-type stylesheet');
  const selector='html.dynamic-type-active.dynamic-type-android';
  const matches=[...original.matchAll(/html\.dynamic-type-active\.dynamic-type-android\s*\{([^}]*)\}/g)];
  if(matches.length!==1)throw new Error('Require one exact Android root font rule');
  const rule=matches[0],body=rule[1].replace(/\/\*[\s\S]*?\*\//g,'').trim();
  if(!/^font-size:\s*16px\s*!important\s*;$/.test(body))throw new Error('Require the actual single-scale 16px important Android guard');
  const mutantRule=rule[0].replace(/(font-size:\s*)16px(\s*!important)/,'$1calc(16px * var(--android-font-scale, 1))$2');
  const mutated=original.slice(0,rule.index)+mutantRule+original.slice(rule.index+rule[0].length);
  if(mutated===original)throw new Error('The fault must change the actual stylesheet');
  return{selector,original,mutated,originalDeclaration:'16px !important',mutatedDeclaration:'calc(16px * var(--android-font-scale, 1)) !important'};
}

export const applyStylesheetFontFaultExpression=`(() => {
  const element=document.getElementById('public-dynamic-type-style');
  if(!element?.sheet)throw new Error('Actual dynamic-type stylesheet unavailable');
  const root=document.documentElement;
  if(root.style.getPropertyValue('font-size'))throw new Error('Inline root font would obscure the faithful stylesheet fault');
  const plan=(${stackedAndroidStylesheetFault.toString()})(element.textContent);
  const rulesBefore=[...element.sheet.cssRules].map(rule=>rule.cssText);
  const matches=[...element.sheet.cssRules].map((rule,index)=>({rule,index})).filter(({rule})=>rule.selectorText===plan.selector);
  if(matches.length!==1)throw new Error('Require one actual Android CSSOM root rule');
  const {rule,index:ruleIndex}=matches[0];
  if(rule.style.getPropertyValue('font-size')!=='16px'||rule.style.getPropertyPriority('font-size')!=='important')throw new Error('Actual Android CSSOM font guard differs from its source');
  const ruleStyleBefore=rule.style.cssText;
  const rootInlineStyle=root.getAttribute('style');
  rule.style.setProperty('font-size','calc(16px * var(--android-font-scale, 1))','important');
  const rulesAfter=[...element.sheet.cssRules].map(rule=>rule.cssText);
  if(rule.style.getPropertyValue('font-size')!=='calc(16px * var(--android-font-scale, 1))'||rule.style.getPropertyPriority('font-size')!=='important'||rulesBefore[ruleIndex]===rulesAfter[ruleIndex]||rulesAfter.length!==rulesBefore.length||rulesAfter.some((text,index)=>index!==ruleIndex&&text!==rulesBefore[index]))throw new Error('Font fault must change only the actual Android CSSOM root declaration');
  return{...plan,elementId:element.id,ruleIndex,beforeRule:rulesBefore[ruleIndex],afterRule:rulesAfter[ruleIndex],ruleStyleBefore,rulesBefore,rulesAfter,rootInlineStyle};
})()`;

export function restoreStylesheetFontFaultExpression(saved) {
  return `(() => {
    const saved=${JSON.stringify(saved)},element=document.getElementById(saved.elementId);
    if(!element?.sheet||element.textContent!==saved.original||JSON.stringify([...element.sheet.cssRules].map(rule=>rule.cssText))!==JSON.stringify(saved.rulesAfter))throw new Error('Font fault stylesheet changed unexpectedly; refuse blind restore');
    if(document.documentElement.getAttribute('style')!==saved.rootInlineStyle)throw new Error('Root inline state changed during font control');
    element.sheet.cssRules[saved.ruleIndex].style.cssText=saved.ruleStyleBefore;
    const restoredRules=[...element.sheet.cssRules].map(rule=>rule.cssText);
    if(element.textContent!==saved.original||JSON.stringify(restoredRules)!==JSON.stringify(saved.rulesBefore))throw new Error('Font control did not restore exact stylesheet text and CSSOM');
    return{exactTextRestored:true,exactRulesRestored:true,rootInlineUnchanged:true};
  })()`;
}

export async function actualFontRuleDiagnostic(page) {
  await page.command('DOM.enable');await page.command('CSS.enable');
  const {root}=await page.command('DOM.getDocument',{depth:0});
  const properties=new Set(['font','font-size','--dynamic-text-16','--dynamic-text-17','--android-font-scale','text-size-adjust','-webkit-text-size-adjust']);
  const declarations=style=>(style?.cssProperties||[]).filter(p=>properties.has(p.name)).map(({name,value,important,disabled,implicit})=>({name,value,important,disabled,implicit}));
  const rules=matches=>(matches||[]).map(({rule})=>({selector:rule.selectorList.text,origin:rule.origin,styleSheetId:rule.styleSheetId,properties:declarations(rule.style),media:(rule.media||[]).map(m=>({text:m.text,active:m.mediaList?.map(q=>q.active)}))})).filter(rule=>rule.properties.length);
  const rows=[];
  for(const selector of ['html','.product-brand-copy strong']){
    const {nodeId}=await page.command('DOM.querySelector',{nodeId:root.nodeId,selector});
    if(!nodeId)throw new Error('Actual font CSS target missing: '+selector);
    const matched=await page.command('CSS.getMatchedStylesForNode',{nodeId}),computed=await page.command('CSS.getComputedStyleForNode',{nodeId});
    rows.push({selector,computed:computed.computedStyle.filter(p=>properties.has(p.name)),inline:declarations(matched.inlineStyle),matched:rules(matched.matchedCSSRules),inherited:(matched.inherited||[]).map(parent=>({inline:declarations(parent.inlineStyle),matched:rules(parent.matchedCSSRules)}))});
  }
  return{kind:'CDP matched/computed CSS rules for the connected target; no styling mutation',rows};
}
