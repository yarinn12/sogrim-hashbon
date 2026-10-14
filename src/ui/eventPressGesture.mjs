// Event timestamps describe the input producer; delivery time is not hold time.
export function normalizePointerTimeStamp(value, timeOrigin) {
  if (!Number.isFinite(value) || value < 0) return null;
  if (value < 1e12) return value;
  if (!Number.isFinite(timeOrigin) || timeOrigin < 1e12 || value < timeOrigin) return null;
  return value - timeOrigin;
}

export function createEventPressGesture({ holdMs = 560, moveTolerance = 12, timeOrigin = () => performance.timeOrigin } = {}) {
  let active = null;
  let completed = null;

  return {
    notePointerDown(event) {
      if (event.isPrimary) completed = null;
      if (active) {
        active.cancelled = true;
        return true;
      }
      return false;
    },
    start(event, target, activationTarget = target) {
      completed = null;
      const origin = timeOrigin();
      active = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        target,
        activationTarget,
        x: event.clientX,
        y: event.clientY,
        origin,
        start: normalizePointerTimeStamp(event.timeStamp, origin),
        cancelled: false
      };
    },
    move(event) {
      if (!active || event.pointerId !== active.pointerId) return false;
      if (Math.hypot(event.clientX - active.x, event.clientY - active.y) > moveTolerance) {
        active.cancelled = true;
        return true;
      }
      return false;
    },
    cancel(event) {
      if (!active || (event && event.pointerId !== active.pointerId)) return false;
      active.cancelled = true;
      completed = active;
      active = null;
      return true;
    },
    finish(event, targetAvailable) {
      if (!active || event.pointerId !== active.pointerId) return null;
      const press = active;
      active = null;
      completed = press;
      const end = normalizePointerTimeStamp(event.timeStamp, press.origin);
      const duration = press.start !== null && end !== null && end >= press.start ? end - press.start : null;
      return {
        target: press.target,
        activationTarget: press.activationTarget,
        duration,
        kind: press.cancelled || !targetAvailable(press.target) || (press.activationTarget && !targetAvailable(press.activationTarget)) ? 'cancel' : duration !== null && duration >= holdMs ? 'hold' : 'tap'
      };
    },
    isTouchContext(event) {
      if (event.pointerType === 'touch' || event.sourceCapabilities?.firesTouchEvents) return true;
      if (event.pointerType === 'mouse' || event.button === 2) return false;
      if (event.detail === 0 && event.clientX === 0 && event.clientY === 0) return false;
      return (active ?? completed)?.pointerType === 'touch';
    },
    consumeCompatibilityClick(event) {
      // A new intentional pointerdown clears this token, even after DOM replacement.
      // Programmatic activation and keyboard clicks have detail=0 and stay available.
      const pointerClick = event.detail > 0 || event.pointerType === 'touch' || event.sourceCapabilities?.firesTouchEvents;
      return Boolean(completed && pointerClick && (event.button === 0 || event.button === undefined));
    }
  };
}
