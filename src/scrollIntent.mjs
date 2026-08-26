export const DEFAULT_SCROLL_INTENT_MOVE_THRESHOLD_PX = 10;
export const DEFAULT_SCROLL_INTENT_CLICK_WINDOW_MS = 700;

const TOUCH_POINTER_TYPES = new Set(["touch", "pen"]);

export function areRelatedInteractionTargets(left, right) {
  if (!left || !right) return false;
  if (left === right) return true;

  return Boolean(left.contains?.(right) || right.contains?.(left));
}

export function createScrollIntentTracker({
  moveThresholdPx = DEFAULT_SCROLL_INTENT_MOVE_THRESHOLD_PX,
  clickWindowMs = DEFAULT_SCROLL_INTENT_CLICK_WINDOW_MS,
  now = defaultNow
} = {}) {
  let activeGesture = null;
  let pendingSuppression = null;

  function begin({
    id = 0,
    x = 0,
    y = 0,
    target = null,
    isPrimary = true,
    pointerType = "touch",
    button = 0
  } = {}) {
    pendingSuppression = null;
    activeGesture = null;

    if (!isPrimary || button !== 0 || !TOUCH_POINTER_TYPES.has(pointerType)) {
      return false;
    }

    activeGesture = {
      id,
      startX: Number(x) || 0,
      startY: Number(y) || 0,
      startTarget: target,
      endTarget: target,
      pointerMoved: false,
      moved: false,
      scrolled: false
    };
    return true;
  }

  function move({ id = 0, x = 0, y = 0, target = null } = {}) {
    if (!activeGesture || activeGesture.id !== id) return false;

    activeGesture.endTarget = target ?? activeGesture.endTarget;
    const distance = Math.hypot(
      (Number(x) || 0) - activeGesture.startX,
      (Number(y) || 0) - activeGesture.startY
    );
    if (distance > 0) activeGesture.pointerMoved = true;
    if (distance > moveThresholdPx) activeGesture.moved = true;
    return activeGesture.moved;
  }

  function markScrolled() {
    // A delayed scroll event can belong to inertial scrolling or dialog focus
    // restoration that started before this touch. Only associate scrolling with
    // the active gesture after the pointer itself has actually moved.
    if (!activeGesture?.pointerMoved) return false;
    activeGesture.scrolled = true;
    return true;
  }

  function end({ id = 0, target = null, at = now() } = {}) {
    if (!activeGesture || activeGesture.id !== id) return false;

    activeGesture.endTarget = target ?? activeGesture.endTarget;
    const shouldSuppress = activeGesture.moved || activeGesture.scrolled;
    pendingSuppression = shouldSuppress
      ? {
          startTarget: activeGesture.startTarget,
          endTarget: activeGesture.endTarget,
          endedAt: at
        }
      : null;
    activeGesture = null;
    return shouldSuppress;
  }

  function cancel({ id = 0, target = null, at = now() } = {}) {
    if (!activeGesture || activeGesture.id !== id) return false;
    activeGesture.moved = true;
    return end({ id, target, at });
  }

  function shouldSuppressClick({
    target = null,
    detail = 1,
    pointerType = "",
    at = now()
  } = {}) {
    const isTouchActivation = TOUCH_POINTER_TYPES.has(pointerType);
    if (!pendingSuppression || (detail === 0 && !isTouchActivation)) return false;

    const suppression = pendingSuppression;
    const elapsed = at - suppression.endedAt;
    if (elapsed < 0 || elapsed > clickWindowMs) {
      pendingSuppression = null;
      return false;
    }

    const related =
      areRelatedInteractionTargets(suppression.startTarget, target) ||
      areRelatedInteractionTargets(suppression.endTarget, target);
    pendingSuppression = null;
    return related;
  }

  return {
    begin,
    move,
    markScrolled,
    end,
    cancel,
    shouldSuppressClick
  };
}

function defaultNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}
