// Preserve native mouse targeting across a late viewport shift, and recover
// removed controls only through the same still-authorized action on release.
export function createPointerRenderRecovery({resolveTarget, resolveRenderTarget = () => null,
  preservePosition = () => {}, moveTolerance = 12, allowClampedAnchor = false}) {
  let active = null;
  let completed = false;
  const releaseNativeCapture = press => {
    if (press?.nativeCapture && press.target.hasPointerCapture(press.pointerId)) {
      press.target.releasePointerCapture(press.pointerId);
    }
  };
  return {
    start(event, target, context) {
      if (!event.isPrimary) {
        if (active) active.cancelled = true;
        return;
      }
      const replacedCapture = Boolean(active?.nativeCapture);
      releaseNativeCapture(active);
      active = null;
      completed = replacedCapture && event.button !== 0;
      if (event.button !== 0 || !target || !context) return;
      completed = false;
      active = {target, anchorTarget: target, context, pointerId: event.pointerId,
        x: event.clientX, y: event.clientY, cancelled: false};
      // A viewport move can occur after the browser selected the native mouse
      // down target, before our handler. Keep native up/click on that same
      // connected button, rather than replaying a click at its old coordinates.
      if (event.isTrusted === true && event.pointerType === "mouse" && event.buttons === 1 &&
          target.isConnected && typeof target.setPointerCapture === "function" &&
          typeof target.hasPointerCapture === "function" && typeof target.releasePointerCapture === "function" &&
          resolveRenderTarget(context) === target) {
        const box = target.getBoundingClientRect();
        if ([box.left, box.top, box.right, box.bottom].every(Number.isFinite) && box.width > 0 && box.height > 0 &&
            (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) {
          target.setPointerCapture(event.pointerId);
          active.nativeCapture = true;
        }
      }
    },
    move(event) {
      if (active && event.pointerId === active.pointerId &&
          Math.hypot(event.clientX - active.x, event.clientY - active.y) > moveTolerance) {
        active.cancelled = true;
      }
    },
    cancel(event) {
      if (!active || (event?.pointerId !== undefined && event.pointerId !== active.pointerId)) return;
      completed = !active.target.isConnected || Boolean(active.nativeCapture);
      releaseNativeCapture(active);
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
        // Read-only sharing may reach the document's fractional scroll limit.
        // Keep that best position only while the original point still resolves
        // to this exact, unchanged action within the normal movement bound.
        // Financial actions retain the default one-pixel cancellation rule.
        if (!allowClampedAnchor || Math.abs(target.getBoundingClientRect().top - anchor.top) > moveTolerance ||
            resolveTarget(active.context, {clientX: active.x, clientY: active.y}) !== target) {
          active.cancelled = true;
          return false;
        }
      }
      return true;
    },
    finish(event) {
      if (!active || event.pointerId !== active.pointerId) return false;
      const press = active;
      active = null;
      if (press.target.isConnected) {
        if (press.nativeCapture) {
          // Capture must not turn a drag, cancellation or changed ledger/account
          // into a payment. An accepted press still uses the browser's click.
          completed = press.cancelled || !event.isPrimary || event.button !== 0 ||
            Math.hypot(event.clientX - press.x, event.clientY - press.y) > moveTolerance ||
            !press.target.hasPointerCapture(event.pointerId) || resolveRenderTarget(press.context) !== press.target;
        }
        return false;
      }
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
