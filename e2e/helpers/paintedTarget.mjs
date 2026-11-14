// This callback is serialized into the browser. It deliberately scrolls only
// user-scrollable ancestors: scrollIntoView can also move overflow:hidden panes.
export async function alignPaintedTarget(element) {
  const paint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const connected = () => element.isConnected;
  if (!connected()) return {attached:false};
  const glyph = element.dataset.action === 'event-status-select'
    ? element.querySelector('.event-row-options-chevron') : null;
  if (element.dataset.action === 'event-status-select' && !glyph) return {attached:true,missingGlyph:true};
  const target = glyph || element;
  const roots = [];
  let fixedBoundary=getComputedStyle(element).position==='fixed'?element:null;
  for (let parent=fixedBoundary?null:element.parentElement;parent;parent=parent.parentElement) {
    if (/^(auto|scroll)$/.test(getComputedStyle(parent).overflowY) && parent.scrollHeight>parent.clientHeight)
      roots.push(parent);
    if (getComputedStyle(parent).position==='fixed') {fixedBoundary=parent;break;}
  }
  const documentCanScroll = !fixedBoundary && ![document.documentElement,document.body].some(node =>
    /^(hidden|clip)$/.test(getComputedStyle(node).overflowY));
  for (const root of roots) {
    const box=root.getBoundingClientRect(),r=target.getBoundingClientRect();
    root.scrollBy({top:r.y+r.height/2-(box.top+root.clientTop+root.clientHeight/2),behavior:'instant'});
  }
  if (documentCanScroll && (document.scrollingElement||document.documentElement).scrollHeight>innerHeight) {
    const r=target.getBoundingClientRect();
    window.scrollBy({top:r.y+r.height/2-innerHeight/2,behavior:'instant'});
  }
  await paint();
  if (!connected()) return {attached:false};
  const bounds = () => {
    const menu=element.closest('.event-status-menu')?.getBoundingClientRect();
    const nav=document.querySelector('[aria-label="ניווט ראשי"]')?.getBoundingClientRect();
    const controls=[...document.querySelectorAll('.product-route-controls button')]
      .map(node=>node.getBoundingClientRect()).filter(r=>r.height>0&&r.top>=0&&r.top<80);
    let top=menu?Math.max(0,menu.top):0;
    let bottom=menu?Math.min(innerHeight,menu.bottom):Math.min(innerHeight,nav?.top??innerHeight);
    for (let parent=fixedBoundary===element?null:element.parentElement;parent;parent=parent.parentElement) {
      if (/^(auto|scroll|hidden|clip)$/.test(getComputedStyle(parent).overflowY)) {
        const r=parent.getBoundingClientRect();
        top=Math.max(top,r.top+parent.clientTop);bottom=Math.min(bottom,r.top+parent.clientTop+parent.clientHeight);
      }
      if (parent===fixedBoundary) break;
    }
    const targetBox=target.getBoundingClientRect();
    // Floating controls guide scrolling only where they overlap this target.
    // Their bottom edge is not a viewport-wide clip; the final hit test remains mandatory.
    // A tight overflow:hidden label is a physical clip, not an inset to pad.
    // Adding eight pixels to that moving clip makes a full-height child
    // impossible to align and repeatedly moves it back under navigation.
    const softTop=menu?Math.max(0,menu.top):Math.max(0,...controls.filter(r=>r.left<targetBox.right&&r.right>targetBox.left).map(r=>r.bottom));
    const softBottom=menu?Math.min(innerHeight,menu.bottom):Math.min(innerHeight,nav?.top??innerHeight);
    return {top,bottom,alignmentTop:Math.max(top,softTop+8),alignmentBottom:Math.min(bottom,softBottom-8)};
  };
  const r=target.getBoundingClientRect(),b=bounds();
  const targetTop=glyph?r.y+r.height/2-22:r.top,targetBottom=glyph?r.y+r.height/2+22:r.bottom;
  let delta=targetTop<b.alignmentTop?targetTop-b.alignmentTop:targetBottom>b.alignmentBottom?targetBottom-b.alignmentBottom:0;
  for (const root of roots) {
    const before=root.scrollTop;root.scrollBy({top:delta,behavior:'instant'});delta-=root.scrollTop-before;
    if (Math.abs(delta)<.01) break;
  }
  if (delta && documentCanScroll) window.scrollBy({top:delta,behavior:'instant'});
  await paint();
  if (!connected()) return {attached:false};
  const box=element.getBoundingClientRect(),g=target.getBoundingClientRect(),final=bounds();
  const x=g.x+g.width/2,y=g.y+g.height/2,hit=document.elementFromPoint(x,y);
  return {attached:true,rect:box.toJSON(),glyph:glyph?g.toJSON():null,x,y,
    targetTop:glyph?y-22:box.top,targetBottom:glyph?y+22:box.bottom,
    top:final.top,bottom:final.bottom,hit:element===hit||element.contains(hit),
    scrollContext:{fixedBoundary:fixedBoundary?.className??null,documentCanScroll,windowY:window.scrollY??null,
      roots:roots.map(root=>({tag:root.tagName,className:root.className,scrollTop:root.scrollTop,clientHeight:root.clientHeight,scrollHeight:root.scrollHeight,rect:root.getBoundingClientRect().toJSON()}))}};
}

export function paintedTargetIsReachable(sample,minimumSize) {
  return Boolean(sample?.attached&&!sample.missingGlyph&&sample.rect.width>=minimumSize&&
    sample.rect.height>=minimumSize&&sample.rect.x>=-1&&sample.targetTop>=Math.max(-1,sample.top)&&
    sample.targetBottom<=sample.bottom+1&&sample.hit);
}
