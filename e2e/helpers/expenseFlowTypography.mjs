// Actual leaf glyph measurement; wrappers alone do not establish text enlargement.
export default function measureExpenseFlowTypography() {
 const modal=document.querySelector('.expense-step-modal[data-expense-step]');
 const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
 const leaves=[];
 for(const [selector,ratio] of [['.field > span',.8125],['.expense-participant-row-copy strong',.875],
   ['.expense-participant-row-copy small',.8125],['.expense-review-row small',.8125],['.expense-review-row strong',.9375]]) {
  for(const e of modal.querySelectorAll(selector)) {
   if(!e.textContent.trim()||rect(e).width===0)continue;
   const box=rect(e),range=document.createRange();range.selectNodeContents(e);
   const fits=[...range.getClientRects()].every(r=>r.x>=box.x-1&&r.right<=box.right+1&&r.y>=box.y-1&&r.bottom<=box.bottom+1);
   leaves.push({text:e.textContent.trim(),selector,ratio,font:Number.parseFloat(getComputedStyle(e).fontSize),fits});
  }
 }
 const m=rect(modal);
 return{step:modal.dataset.expenseStep,width:innerWidth,height:innerHeight,
  root:Number.parseFloat(getComputedStyle(document.documentElement).fontSize),leaves,
  modalFits:m.x>=-1&&m.right<=document.documentElement.clientWidth+1,
  noHorizontalOverflow:document.documentElement.scrollWidth<=document.documentElement.clientWidth};
}
