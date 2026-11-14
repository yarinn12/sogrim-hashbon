// Synthetic font-only model for Android WebView text zoom. Changing the root
// font also changes rem container-query thresholds and hid the original bug.
// The real native suite applies the same measurement without this model.
export function applyAndroidTextMetrics(scale) {
  const root = document.documentElement;
  root.classList.remove('dynamic-type-preview', 'dynamic-type-apple', 'dynamic-type-large', 'dynamic-type-extra-large');
  root.classList.add('dynamic-type-android');
  root.classList.toggle('dynamic-type-active', scale > 1);
  root.classList.toggle('dynamic-type-extra-large', scale >= 1.5);
  root.style.setProperty('font-size', '16px', 'important');
  root.style.setProperty('--android-font-scale', String(scale));
  root.dataset.dynamicType = scale >= 1.5 ? 'extra-large' : 'normal';
  // Read all authored font sizes before changing any inherited value.
  const fonts = [document.body, ...document.querySelectorAll('#app, #app *')]
    .map(node => [node, Number.parseFloat(getComputedStyle(node).fontSize)]);
  for (const [node, size] of fonts) node.style.setProperty('font-size', `${size * scale}px`, 'important');
}
