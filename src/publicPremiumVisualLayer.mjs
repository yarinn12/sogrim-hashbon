const STYLE_ID = "public-premium-visual-layer-style";
const LEGACY_CLASSES = ["premium-visual-v1"];

cleanupPremiumCompatibilityLayer();

function cleanupPremiumCompatibilityLayer() {
  document.getElementById(STYLE_ID)?.remove();
  document.documentElement.classList.remove(...LEGACY_CLASSES);
}
