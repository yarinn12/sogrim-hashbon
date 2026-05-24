const COPY_CLEANUP_STYLE_ID = "public-copy-cleanup-layer-style";

injectCopyCleanupStyle();
cleanUserFacingCopy();

const app = document.querySelector("#app");
if (app) {
  new MutationObserver(cleanUserFacingCopy).observe(app, {
    childList: true,
    subtree: true
  });
}

function cleanUserFacingCopy() {
  document.querySelectorAll(".product-app-badge").forEach((badge) => badge.remove());

  document
    .querySelectorAll(".known-participants-panel .muted, .product-saved-names-panel .muted")
    .forEach((node) => {
      node.textContent = "כאן מנהלים שמות ששמרת. אפשר להסיר שם שלא מופיע בהוצאות קיימות.";
    });

  document.querySelectorAll(".public-profile-form .muted").forEach((node) => {
    node.textContent = "נשמור את השם במכשיר הזה כדי שהמסך שלך יהיה אישי.";
  });

  document.querySelectorAll(".public-profile-privacy").forEach((node) => {
    node.textContent = "כל חבר נכנס בשם שלו ומקבל מסך אישי.";
  });

  document.querySelectorAll(".invite-status .status-chip").forEach((node) => {
    node.textContent = "קישור הצטרפות";
  });

  document.querySelectorAll(".invite-status .muted").forEach((node) => {
    node.textContent = "אפשר לשלוח את הקישור לחברים.";
  });
}

function injectCopyCleanupStyle() {
  if (document.getElementById(COPY_CLEANUP_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = COPY_CLEANUP_STYLE_ID;
  style.textContent = `
    .product-app-badge {
      display: none !important;
    }
  `;
  document.head.append(style);
}
