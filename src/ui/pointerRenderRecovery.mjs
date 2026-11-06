// Recover only a real press whose original button was removed by a render.
// The caller must resolve the same still-authorized action under the release.
export function createPointerRenderRecovery({resolveTarget, resolveRenderTarget = () => null,
  preservePosition = () => {}, moveTolerance = 12}) {
  let active = null;
  let completed = false;
  return {
    start(event, target, context) {
      if (!event.isPrimary) {
        if (active) active.cancelled = true;
        return;
      }
      active = null;
      completed = false;
      if (event.button !== 0 || !target || !context) return;
      active = {target, anchorTarget: target, context, pointerId: event.pointerId,
        x: event.clientX, y: event.clientY, cancelled: false};
    },
    move(event) {
      if (active && event.pointerId === active.pointerId &&
          Math.hypot(event.clientX - active.x, event.clientY - active.y) > moveTolerance) {
        active.cancelled = true;
      }
    },
    cancel(event) {
      if (!active || (event?.pointerId !== undefined && event.pointerId !== active.pointerId)) return;
      completed = !active.target.isConnected;
      active = null;
    },
    captureRenderAnchor() {
      if (!active || active.cancelled || !active.anchorTarget.isConnected) return null;
      const box = active.anchorTarget.getBoundingClientRect();
      if (active.x < box.left || active.x > box.right || active.y < box.top || active.y > box.bottom) return null;
      return {owner: active, left: box.left, top: box.top, width: box.width, height: box.height};
    },
    restoreRenderAnchor(anchor) {
      if (!anchor || anchor.owner !== active || active.cancelled) return false;
      const target = resolveRenderTarget(active.context);
      if (!target?.isConnected) return false;
      const box = target.getBoundingClientRect();
      if (Math.abs(box.left - anchor.left) > 1 || Math.abs(box.width - anchor.width) > .5 ||
          Math.abs(box.height - anchor.height) > .5) return false;
      // A notice inserted above the row must not move a still-pressed button.
      preservePosition(box.top - anchor.top);
      active.anchorTarget = target;
      if (Math.abs(target.getBoundingClientRect().top - anchor.top) > 1) {
        active.cancelled = true; // A clamped scroll must never redirect the press.
        return false;
      }
      return true;
    },
    finish(event) {
      if (!active || event.pointerId !== active.pointerId) return false;
      const press = active;
      active = null;
      if (press.target.isConnected) return false; // Leave ordinary native clicks alone.
      completed = true;
      if (press.cancelled || !event.isPrimary || event.button !== 0 ||
          Math.hypot(event.clientX - press.x, event.clientY - press.y) > moveTolerance) return false;
      const target = resolveTarget(press.context, event);
      if (!target) return false;
      target.click(); // Existing keyboard/programmatic click route; never a direct mutation.
      return true;
    },
    consumeCompatibilityClick(event) {
      // detail=0 includes keyboard, programmatic and assistive activation.
      const pointerClick = event.detail > 0;
      return Boolean(completed && pointerClick && (event.button === 0 || event.button === undefined));
    }
  };
}
