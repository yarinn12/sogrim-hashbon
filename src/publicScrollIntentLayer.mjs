import { createScrollIntentTracker } from "./scrollIntent.mjs";

const tracker = createScrollIntentTracker();
const passiveCapture = { capture: true, passive: true };

if ("PointerEvent" in window) {
  document.addEventListener("pointerdown", handlePointerDown, passiveCapture);
  document.addEventListener("pointermove", handlePointerMove, passiveCapture);
  document.addEventListener("pointerup", handlePointerUp, passiveCapture);
  document.addEventListener("pointercancel", handlePointerCancel, passiveCapture);
} else {
  installTouchFallback();
}

document.addEventListener("scroll", () => tracker.markScrolled(), passiveCapture);
document.addEventListener("click", suppressScrollGeneratedClick, true);

function handlePointerDown(event) {
  tracker.begin({
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    target: event.target,
    isPrimary: event.isPrimary,
    pointerType: event.pointerType,
    button: event.button
  });
}

function handlePointerMove(event) {
  tracker.move({
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    target: event.target
  });
}

function handlePointerUp(event) {
  tracker.end({
    id: event.pointerId,
    target: event.target
  });
}

function handlePointerCancel(event) {
  tracker.cancel({
    id: event.pointerId,
    target: event.target
  });
}

function suppressScrollGeneratedClick(event) {
  if (
    !tracker.shouldSuppressClick({
      target: event.target,
      detail: event.detail,
      pointerType: event.pointerType
    })
  ) {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
}

function installTouchFallback() {
  let touchId = null;

  document.addEventListener("touchstart", (event) => {
    const touch = event.changedTouches[0];
    if (!touch || event.touches.length !== 1) return;
    touchId = touch.identifier;
    tracker.begin({
      id: touchId,
      x: touch.clientX,
      y: touch.clientY,
      target: event.target,
      pointerType: "touch"
    });
  }, passiveCapture);

  document.addEventListener("touchmove", (event) => {
    const touch = findTouch(event.touches, touchId);
    if (!touch) return;
    tracker.move({
      id: touchId,
      x: touch.clientX,
      y: touch.clientY,
      target: event.target
    });
  }, passiveCapture);

  document.addEventListener("touchend", (event) => {
    const touch = findTouch(event.changedTouches, touchId);
    if (!touch) return;
    tracker.end({ id: touchId, target: event.target });
    touchId = null;
  }, passiveCapture);

  document.addEventListener("touchcancel", (event) => {
    const touch = findTouch(event.changedTouches, touchId);
    if (!touch) return;
    tracker.cancel({ id: touchId, target: event.target });
    touchId = null;
  }, passiveCapture);
}

function findTouch(touchList, identifier) {
  if (identifier === null) return null;
  return [...touchList].find((touch) => touch.identifier === identifier) ?? null;
}
