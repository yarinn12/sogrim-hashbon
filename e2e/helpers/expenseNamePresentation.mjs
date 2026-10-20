// Read-only browser geometry for the approved expense-name presentation.
export default function measureExpenseName() {
 const modal=document.querySelector('.expense-step-modal[data-expense-step="name"]');
 const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
 const glyphs=e=>{const range=document.createRange();range.selectNodeContents(e);return [...range.getClientRects()].filter(r=>r.width>0&&r.height>0);};
 const fits=e=>{const r=box(e);return glyphs(e).every(g=>g.x>=r.x-1&&g.right<=r.right+1&&g.y>=r.y-1&&g.bottom<=r.bottom+1);};
 const input=modal.querySelector('[data-action="expense-name"]'),title=modal.querySelector('h2'),body=modal.querySelector('.expense-flow-body');
 const bars=[...modal.querySelectorAll('.expense-flow-progress li')];
 return {
  root:Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
  inputFont:Number.parseFloat(getComputedStyle(input).fontSize),
  placeholderFont:Number.parseFloat(getComputedStyle(input,'::placeholder').fontSize),
  title:box(title),titleFont:Number.parseFloat(getComputedStyle(title).fontSize),titleColor:getComputedStyle(title).color,
  titleBackground:getComputedStyle(title).backgroundImage,titleFits:fits(title),
  captionFont:Number.parseFloat(getComputedStyle(modal.querySelector('.eyebrow')).fontSize),
  bars:bars.map(box),currentBar:bars.findIndex(e=>e.querySelector('button[aria-current="step"]')),
  stageButtons:modal.querySelectorAll('.expense-flow-progress button').length,
  visibleStageNames:[...modal.querySelectorAll('.expense-flow-progress button span')].some(e=>{const r=e.getBoundingClientRect();return r.width>1||r.height>1;}),
  currencyVisible:getComputedStyle(modal.querySelector('.expense-source-currency-field')).display!=='none',
  noOverflow:document.documentElement.scrollWidth<=document.documentElement.clientWidth&&body.scrollWidth<=body.clientWidth,
  bodyHeight:body.clientHeight,
  templates:[...modal.querySelectorAll('[data-action="expense-template"]')].map(e=>({...box(e),text:e.textContent.trim(),fits:fits(e),lines:glyphs(e).length,font:Number.parseFloat(getComputedStyle(e).fontSize)}))
 };
}
