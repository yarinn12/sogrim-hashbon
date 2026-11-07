import {test,expect} from '@playwright/test';
import {control} from './helpers/referralInvitationPresentation.mjs';

const markup = `<meta name="viewport" content="width=device-width,initial-scale=1">
  <style>html,body{margin:0}#public-referral-rewards-dialog{position:fixed;inset:0;display:grid;place-items:center}
  .referral-dialog-shell{width:280px;padding:20px}.referral-dialog-content{height:150px;overflow:auto}
  button{box-sizing:border-box;width:100px;height:44px}</style>
  <div id="public-referral-rewards-dialog"><div class="referral-dialog-shell">
  <div class="referral-dialog-content"><button>Continue</button></div></div></div>`;

test('invitation control waits for a real replacement animation after cancellation',async({page})=>{
  await page.setContent(markup);
  const button=page.locator('#public-referral-rewards-dialog button');
  await button.evaluate(el=>{
    const dialog=el.closest('#public-referral-rewards-dialog');
    const nativeDialogAnimations=dialog.getAnimations.bind(dialog);
    const nativeDocumentAnimations=document.getAnimations.bind(document);
    dialog.getAnimations=options=>{
      const animations=nativeDialogAnimations(options);
      window.__animationSnapshotSeen=true;
      return animations;
    };
    document.getAnimations=options=>{
      const animations=nativeDocumentAnimations(options);
      window.__animationSnapshotSeen=true;
      return animations;
    };
    window.__firstAnimation=el.animate(
      [{transform:'scale(.7)'},{transform:'scale(1)'}],
      {duration:2000,fill:'none'}
    );
  });
  const checking=control(button);
  await expect.poll(()=>page.evaluate(()=>window.__animationSnapshotSeen===true)).toBe(true);
  await button.evaluate(el=>{
    window.__firstAnimation.cancel();
    window.__replacementAnimation=el.animate(
      [{transform:'scale(.7)'},{transform:'scale(1)'}],
      {duration:450,fill:'none'}
    );
  });
  await checking;
  expect(await button.evaluate(()=>window.__firstAnimation.playState)).toBe('idle');
  expect(await button.evaluate(()=>window.__replacementAnimation.playState)).toBe('finished');
  const box=await button.boundingBox();
  expect(box.height).toBe(44);
  expect(box.width).toBe(100);
  expect(await button.evaluate(el=>{
    const r=el.getBoundingClientRect();
    return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;
  })).toBe(true);
});
test('invitation control rejects a finite animation that remains paused',async({page})=>{
  await page.setContent(markup);
  const button=page.locator('#public-referral-rewards-dialog button');
  await button.evaluate(el=>{
    window.__pausedAnimation=el.animate([{opacity:1},{opacity:.5}],{duration:5000});
    window.__pausedAnimation.pause();
  });
  await expect(control(button)).rejects.toThrow();
  expect(await button.evaluate(()=>window.__pausedAnimation.playState)).toBe('paused');
});

test('invitation control keeps an undersized raw target as a failure',async({page})=>{
  await page.setContent(markup);
  const button=page.locator('#public-referral-rewards-dialog button');
  await button.evaluate(el=>{el.style.height='43.5px'});
  await expect(control(button)).rejects.toThrow();
  const box=await button.boundingBox();
  expect(box.height).toBe(43.5);
  expect(box.height).toBeLessThan(44);
});