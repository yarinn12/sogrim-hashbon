// Read-only measurement shared by the platform regression and local browser QA.
export default function measureEventActionDock() {
  const dock = document.querySelector('.event-action-dock');
  const total = dock.querySelector('.event-action-total');
  const caption = total.firstElementChild;
  const amount = total.querySelector('.amount');
  const button = dock.querySelector('[data-action="show-expense-form"]');
  const label = button.lastElementChild;
  const icon = button.querySelector('.command-card-icon');
  const rect = element => {
    const r = element.getBoundingClientRect();
    return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};
  };
  const range = document.createRange();
  range.selectNodeContents(label);
  const text = range.getBoundingClientRect();
  const b = rect(button), d = rect(dock), t = rect(total);
  const paths = [...icon.querySelectorAll('path')].map(rect).filter(r=>r.width && r.height);
  const left = Math.min(text.x,...paths.map(r=>r.x));
  const right = Math.max(text.right,...paths.map(r=>r.right));
  const lines = [];
  for(const r of range.getClientRects()) {
    if(!lines.some(y=>Math.abs(y-r.y)<1))lines.push(r.y);
  }
  return {
    width:innerWidth,root:getComputedStyle(document.documentElement).fontSize,
    dock:d,button:b,total:t,caption:rect(caption),amount:rect(amount),
    labelFont:getComputedStyle(label).fontSize,labelLines:lines.length,
    visibleGroupDeltaX:(left+right)/2-(b.x+b.width/2),
    iconTextDeltaY:paths.length ?
      (Math.min(...paths.map(r=>r.y))+Math.max(...paths.map(r=>r.bottom)))/2-(text.y+text.height/2) : null,
    totalGlyphsFit:[caption,amount.querySelector('.font-num')].every(element=>{
      const range=document.createRange();range.selectNodeContents(element);
      return [...range.getClientRects()].every(r=>r.x>=t.x-1 && r.right<=t.right+1 && r.y>=t.y-1 && r.bottom<=t.bottom+1);
    }),
    totalLeft:Math.abs(rect(caption).x-t.x)<1 && Math.abs(rect(amount).x-t.x)<1,
    captionAbove:rect(caption).bottom<=rect(amount).y+1,
    buttonFits:text.x>=b.x-1 && text.right<=b.right+1 && text.y>=b.y-1 && text.bottom<=b.bottom+1,
    groupsSeparate:t.right<=b.x+1 || t.bottom<=b.y+1,
    buttonAtRight:Math.abs(b.right-(d.right-10))<1,
    noOverflow:document.documentElement.scrollWidth<=document.documentElement.clientWidth
  };
}
