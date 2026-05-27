const STYLE_ID = "public-fintech-design-layer-style";
const LEGACY_CLASSES = ["fintech-design-v1", "fintech-design-v2"];

cleanupFintechCompatibilityLayer();

function cleanupFintechCompatibilityLayer() {
  document.getElementById(STYLE_ID)?.remove();
  document.documentElement.classList.remove(...LEGACY_CLASSES);
}
