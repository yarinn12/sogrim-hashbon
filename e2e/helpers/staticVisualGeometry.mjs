import {expect} from '@playwright/test';

export async function waitForStaticVisualGeometry(locator){
  const frames=()=>locator.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  // A route/viewport class can schedule a finite CSS transition on the next
  // frame. Measure final layout after it ends, retaining the raw DOMRect and
  // every original size/containment assertion at the callsite.
  await frames();
  await expect.poll(()=>locator.evaluate(()=>document.getAnimations()
    .filter(animation=>Number.isFinite(animation.effect?.getComputedTiming().endTime)
      &&(animation.pending||animation.playState==='running')).length)).toBe(0);
  await frames();
}
