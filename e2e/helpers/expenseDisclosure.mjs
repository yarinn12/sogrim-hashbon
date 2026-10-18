// Read-only geometry used by the platform regression and local Cua checks.
export default function measureExpenseDisclosure() {
  const rect = element => {
    const r = element.getBoundingClientRect();
    return { x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom };
  };
  const glyphs = element => {
    const ranges = [];
    const visit = node => {
      if (node.nodeType === 3 && node.textContent.trim()) {
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of range.getClientRects()) {
          if (r.width && r.height) ranges.push({x:r.x,y:r.y,right:r.right,bottom:r.bottom});
        }
      } else if (node.nodeType !== 1 || node.getAttribute('aria-hidden') !== 'true') {
        for (const child of node.childNodes) visit(child);
      }
    };
    visit(element);
    return ranges;
  };
  const fits = (ranges, boundary) => ranges.length > 0 && ranges.every(r =>
    r.x >= boundary.x - 1 && r.right <= boundary.right + 1 &&
    r.y >= boundary.y - 1 && r.bottom <= boundary.bottom + 1);
  const rows = [...document.querySelectorAll('.expense-row')].map(row => {
    const main = row.querySelector('.expense-row-main');
    const title = main.querySelector('.expense-row-title-text') || main.querySelector('strong');
    const icon = main.querySelector('.expense-row-expand-icon');
    const summary = row.querySelector('.expense-row-actions-menu > summary');
    const m = rect(main), t = rect(title), s = rect(summary), a = icon ? rect(icon) : null;
    const points = [...summary.querySelectorAll('circle')].map(rect);
    return {
      title: title.textContent, titleFont:getComputedStyle(title).fontSize,
      expanded:main.getAttribute('aria-expanded') === 'true',
      caption:row.querySelector('.expense-participants-list-title')?.textContent,
      captionFont:getComputedStyle(row.querySelector('.expense-participants-list-title')).fontSize,
      titleFits:fits(glyphs(title),m), iconPresent:!!icon,
      iconInsideMain:!!a && a.x>=m.x-1 && a.right<=m.right+1 && a.y>=m.y-1 && a.bottom<=m.bottom+1,
      titleIconGap:a ? t.x-a.right : null,
      iconTransform:icon ? getComputedStyle(icon).transform : null,
      dots:{width:s.width,height:s.height,
        dx:points.reduce((sum,p)=>sum+p.x+p.width/2,0)/points.length-(s.x+s.width/2),
        dy:points.reduce((sum,p)=>sum+p.y+p.height/2,0)/points.length-(s.y+s.height/2)}
    };
  });
  const nav = document.querySelector('.event-route-primary-nav:not([hidden]), .product-app-nav:not([hidden])');
  const menus = [...document.querySelectorAll('.expense-row-actions-menu[open] > div')].map(menu => {
    const m = rect(menu);
    return {width:m.width,height:m.height,
      insideViewport:m.x>=0 && m.right<=document.documentElement.clientWidth+1 && m.y>=0,
      aboveNavigation:!nav || m.bottom<=rect(nav).y+1,
      buttons:[...menu.querySelectorAll('button')].map(button=>{
        const b=rect(button), ranges=glyphs(button);
        const lines=[];
        for(const r of ranges) if(!lines.some(top=>Math.abs(top-r.y)<1))lines.push(r.y);
        return {text:button.textContent.trim(),font:getComputedStyle(button).fontSize,
          width:b.width,height:b.height,lines:lines.length,glyphsFit:fits(ranges,b)};
      })
    };
  });
  return {rootFont:getComputedStyle(document.documentElement).fontSize,width:innerWidth,
    noHorizontalOverflow:document.documentElement.scrollWidth<=document.documentElement.clientWidth,
    rows,menus};
}
