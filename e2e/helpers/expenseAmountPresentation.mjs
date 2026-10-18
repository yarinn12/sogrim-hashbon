// Read-only presentation measurement shared by platform tests and local browser QA.
export default function measureExpenseAmount() {
  const modal=document.querySelector('.expense-step-modal[data-expense-step="amount"]');
  const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  const root=Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  const input=modal.querySelector('[data-action="expense-total"]');
  const label=modal.querySelector('.expense-total-field > span');
  const currency=modal.querySelector('.expense-source-currency-field');
  const trigger=currency.querySelector('.app-choice-trigger');
  const currencyText=trigger.querySelector('.app-choice-trigger-copy');
  const next=modal.querySelector('.expense-step-next');
  const nav=document.querySelector('.expense-route-backdrop .event-route-primary-nav');
  const field=box(modal.querySelector('.expense-total-field'));
  const m=box(modal),c=box(currency),n=box(next);
  const glyphsFit=e=>{const r=box(e),range=document.createRange();range.selectNodeContents(e);return [...range.getClientRects()].every(t=>t.x>=r.x-1&&t.right<=r.right+1&&t.y>=r.y-1&&t.bottom<=r.bottom+1);};
  const centerHits=e=>{const r=box(e),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===e||e.contains(hit);};
  return {
    width:innerWidth,clientWidth:document.documentElement.clientWidth,root,
    modal:m,field,currency:c,trigger:box(trigger),next:n,nav:nav?box(nav):null,
    inputFont:Number.parseFloat(getComputedStyle(input).fontSize),
    placeholderFont:Number.parseFloat(getComputedStyle(input,'::placeholder').fontSize),
    labelFont:Number.parseFloat(getComputedStyle(label).fontSize),
    currencyLabelFont:Number.parseFloat(getComputedStyle(currency.firstElementChild).fontSize),
    currencyValueFont:Number.parseFloat(getComputedStyle(currencyText).fontSize),
    captionFont:Number.parseFloat(getComputedStyle(modal.querySelector('.eyebrow')).fontSize),
    captionBackground:getComputedStyle(modal.querySelector('.eyebrow')).backgroundColor,
    labelGlyphsFit:glyphsFit(label),currencyLabelGlyphsFit:glyphsFit(currency.firstElementChild),
    currencyValueGlyphsFit:glyphsFit(currencyText),nextGlyphsFit:glyphsFit(next),
    nextCenterHits:centerHits(next),currencyCenterHits:centerHits(trigger),
    noHorizontalOverflow:document.documentElement.scrollWidth<=document.documentElement.clientWidth,
    symmetricFieldInsets:Math.abs(field.x-(document.documentElement.clientWidth-field.right))<1,
    modalFits:m.x>=-1&&m.right<=document.documentElement.clientWidth+1,
    amountThenCurrency:field.bottom<=c.y+1,
    currencyGap:c.y-field.bottom,
    nextAboveNav:!nav||n.bottom<=box(nav).y+1,
    fieldAlignedWithCurrency:Math.abs(field.x-c.x)<1&&Math.abs(field.right-c.right)<1
  };
}
