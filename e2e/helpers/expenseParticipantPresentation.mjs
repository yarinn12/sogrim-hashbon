import {expect} from '@playwright/test';

// Measure actual participant glyphs, checkbox shapes and tap targets.
export default function measureExpenseParticipants() {
 const modal=document.querySelector('.expense-step-modal[data-expense-step="participants"]');
 const body=modal.querySelector('.expense-flow-body'),add=modal.querySelector('.expense-participant-add-launch'),bulk=modal.querySelector('.expense-select-all-compact');
 const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
 const leaf=e=>{const box=rect(e),range=document.createRange();range.selectNodeContents(e);return{text:e.textContent.trim(),font:parseFloat(getComputedStyle(e).fontSize),fits:[...range.getClientRects()].every(r=>r.x>=box.x-1&&r.right<=box.right+1&&r.y>=box.y-1&&r.bottom<=box.bottom+1)};};
 const mark=e=>{const s=getComputedStyle(e),svg=getComputedStyle(e.querySelector('svg'));return{width:s.width,height:s.height,border:s.border,radius:s.borderRadius,color:s.color,background:s.backgroundColor,svgWidth:svg.width,stroke:svg.strokeWidth};};
 return{root:parseFloat(getComputedStyle(document.documentElement).fontSize),
  noOverflow:document.documentElement.scrollWidth<=document.documentElement.clientWidth&&body.scrollWidth<=body.clientWidth,
  currencyVisible:getComputedStyle(modal.querySelector('.expense-source-currency-field')).display!=='none',bodyHeight:body.clientHeight,
  addStrong:leaf(add.querySelector('strong')),addSmall:leaf(add.querySelector('small')),bulkCopy:leaf(bulk.querySelector('span:not([aria-hidden="true"])')),
  names:[...modal.querySelectorAll('.expense-participant-row-copy strong')].map(leaf),bulkMark:mark(bulk.querySelector('span[aria-hidden="true"]')),
  rowMark:mark(modal.querySelector('.expense-participant-row-check')),
  controls:[...modal.querySelectorAll('.expense-participant-row,.expense-select-all-compact,.expense-participant-add-launch')].map(rect)};
}

export async function measureSettledExpenseParticipants(page) {
 // Exact style comparisons describe the settled selection, not a color sampled
 // partway through its existing transition. Permanent differences remain visible.
 await expect.poll(()=>page.locator('.expense-step-modal[data-expense-step="participants"]').evaluate(modal=>
  [...modal.querySelectorAll('.expense-participant-row-check,.expense-select-all-compact>span[aria-hidden="true"]')]
   .some(mark=>mark.getAnimations().some(animation=>!['finished','idle'].includes(animation.playState)))
 )).toBe(false);
 return page.evaluate(measureExpenseParticipants);
}
