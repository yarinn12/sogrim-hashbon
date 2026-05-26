const VISUAL_REFRESH_STYLE_ID = "public-visual-refresh-layer-style";
const LEGACY_ROOT_CLASSES = ["visual-refresh-v6"];
const LEGACY_SCREEN_CLASSES = [
  "command-center-screen",
  "command-center-home",
  "command-center-event",
  "command-center-settlement",
  "command-center-groups"
];

cleanupLegacyVisualRefresh();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", cleanupLegacyVisualRefresh, { once: true });
} else {
  requestAnimationFrame(cleanupLegacyVisualRefresh);
}

function cleanupLegacyVisualRefresh() {
  document.getElementById(VISUAL_REFRESH_STYLE_ID)?.remove();
  document.documentElement.classList.remove(...LEGACY_ROOT_CLASSES);
  document.querySelectorAll(".product-context-bar, .product-home-kicker").forEach((node) => node.remove());
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.remove(...LEGACY_SCREEN_CLASSES);
  });
}
