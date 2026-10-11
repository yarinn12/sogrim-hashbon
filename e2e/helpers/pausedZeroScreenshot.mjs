import assert from "node:assert/strict";

function animationReadback() {
  return document.getAnimations().map(animation => ({
    target: animation.effect?.target?.getAttribute?.("class") ?? null,
    pseudoElement: animation.effect?.pseudoElement ?? null,
    playState: animation.playState,
    currentTime: animation.currentTime,
    infinite: animation.effect?.getComputedTiming?.().iterations === Infinity
  }));
}

export async function capturePausedZeroScreenshot(page, screenshotOptions = {}) {
  const before = await page.evaluate(async () => {
    const readback = () => document.getAnimations().map(animation => ({
      target: animation.effect?.target?.getAttribute?.("class") ?? null,
      pseudoElement: animation.effect?.pseudoElement ?? null,
      playState: animation.playState,
      currentTime: animation.currentTime,
      infinite: animation.effect?.getComputedTiming?.().iterations === Infinity
    }));
    // WebKit can start its next set of entrance animations on a later frame.
    // Freeze each newly observed set before claiming a stable zero frame.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      for (const animation of document.getAnimations()) {
        animation.pause();
        animation.currentTime = 0;
      }
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const current = readback();
      if (current.every(animation => animation.playState === "paused" && animation.currentTime === 0)) {
        return current;
      }
    }
    return readback();
  });
  assert(before.every(animation => animation.playState === "paused" && animation.currentTime === 0),
    `Every document animation must be paused at zero before screenshot: ${JSON.stringify(before)}`);

  // Playwright cancels infinite animations in disabled mode and resumes them
  // after capture. Allow preserves the paused-zero timeline we established.
  const png = await page.screenshot({ ...screenshotOptions, animations: "allow" });
  const after = await page.evaluate(animationReadback);
  assert.deepEqual(after, before, "Screenshot must preserve paused-zero animation state");
  return { png, before, after };
}
