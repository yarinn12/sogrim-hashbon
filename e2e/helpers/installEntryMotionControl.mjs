// Control the existing production disclosure animation's clock. Its real
// keyframes and duration remain intact; no product code or geometry is replaced.
export function stageLateInstallationDisclosure() {
  const animate = Element.prototype.animate;
  const scrollIntoView = Element.prototype.scrollIntoView;
  const activate = () => {
    const control = window.__installationEntryMotion;
    if (!control || control.activated) return;
    control.activated = true;
    control.animation.playbackRate = 0.0001;
    control.animation.currentTime = 0;
    const finished = control.animation.finished;
    (async () => {
      for (let frame = 0; frame < 20; frame++) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        control.frames++;
      }
      control.atRelease = { state: control.animation.playState, time: control.animation.currentTime,
        rate: control.animation.playbackRate, connected: control.animation.effect.target.isConnected };
      control.animation.playbackRate = control.originalRate;
      await finished;
      control.finished = true;
    })();
  };
  Element.prototype.scrollIntoView = function (...args) {
    const result = Reflect.apply(scrollIntoView, this, args);
    if (this.matches(".account-profile-actions [data-public-install-app]")) {
      window.__installationEntryScrolled = true;
      if (window.__installationEntryMotion) window.__installationEntryMotion.scrolls++;
      activate();
    }
    return result;
  };
  Element.prototype.animate = function (...args) {
    const animation = Reflect.apply(animate, this, args);
    if (this.matches(".account-profile-controls-body")) {
      const duration = animation.effect.getComputedTiming().endTime;
      const originalRate = animation.playbackRate;
      // Keep the held effect running and inside its active interval so the
      // animation barrier observes it through the normal browser animation API.
      animation.playbackRate = 0.0001;
      animation.currentTime = Math.max(0, duration - 1);
      window.__installationEntryMotion = {
        animation, duration, originalRate, frames: 0, scrolls: window.__installationEntryScrolled ? 1 : 0,
        activated: false, finished: false
      };
      if (window.__installationEntryScrolled) activate();
    }
    return animation;
  };
}
