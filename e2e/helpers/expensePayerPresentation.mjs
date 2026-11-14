// Read-only measurements of actual payer controls and their visible captions.
export default function measureExpensePayer() {
 const modal=document.querySelector('.expense-step-modal[data-expense-step="payer"]');
 const body=modal.querySelector('.expense-flow-body');
 const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
 const fits=e=>{const r=box(e),range=document.createRange();range.selectNodeContents(e);return [...range.getClientRects()].every(g=>g.x>=r.x-1&&g.right<=r.right+1&&g.y>=r.y-1&&g.bottom<=r.bottom+1);};
 const summary=modal.querySelector('.expense-payer-summary'),add=modal.querySelector('.expense-add-payer-button');
 return {root:parseFloat(getComputedStyle(document.documentElement).fontSize),
  noOverflow:document.documentElement.scrollWidth<=document.documentElement.clientWidth&&body.scrollWidth<=body.clientWidth,
  bodyHeight:body.clientHeight,currencyVisible:getComputedStyle(modal.querySelector('.expense-source-currency-field')).display!=='none',
  labels:[...modal.querySelectorAll('.payer-amount-field>span')].map(e=>({text:e.textContent.trim(),font:parseFloat(getComputedStyle(e).fontSize),fits:fits(e)})),
  inputs:[...modal.querySelectorAll('[data-action="expense-payer-amount"]')].map(e=>({...box(e),value:e.value,font:parseFloat(getComputedStyle(e).fontSize),hasVisibleLabel:[...e.labels].some(l=>l.getBoundingClientRect().height>0)})),
  summary:box(summary),add:box(add),
  rows:[...modal.querySelectorAll('.payer-row')].map(e=>({selector:box(e.querySelector('.app-choice-trigger')),remove:e.querySelector('[data-action="remove-payer"]')?box(e.querySelector('[data-action="remove-payer"]')):null}))};
}
