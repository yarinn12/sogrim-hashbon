const COPY_CLEANUP_STYLE_ID = "public-copy-cleanup-layer-style";
let copyCleanupScheduled = false;
let copyCleanupWriting = false;

injectCopyCleanupStyle();
cleanUserFacingCopy();

const app = document.querySelector("#app");
if (app) {
  new MutationObserver(scheduleCopyCleanup).observe(app, {
    childList: true,
    subtree: true
  });
}

function scheduleCopyCleanup() {
  if (copyCleanupWriting || copyCleanupScheduled) return;
  copyCleanupScheduled = true;
  requestAnimationFrame(() => {
    copyCleanupScheduled = false;
    cleanUserFacingCopy();
  });
}

function cleanUserFacingCopy() {
  copyCleanupWriting = true;
  try {
  document.querySelectorAll(".product-app-badge").forEach((badge) => badge.remove());

  document
    .querySelectorAll(".known-participants-panel .muted, .product-saved-names-panel .muted")
    .forEach((node) => {
      setCleanupText(
        node,
        "כאן מנהלים שמות ששמרת. אפשר להסיר שם שלא מופיע בהוצאות קיימות."
      );
    });

  document.querySelectorAll(".public-profile-form .muted").forEach((node) => {
    setCleanupText(node, "נשמור את השם במכשיר הזה כדי שהמסך שלך יהיה אישי.");
  });

  document.querySelectorAll(".public-profile-privacy").forEach((node) => {
    setCleanupText(node, "כל חבר נכנס בשם שלו ומקבל מסך אישי.");
  });

  document.querySelectorAll(".invite-status .status-chip").forEach((node) => {
    setCleanupText(node, "קישור הצטרפות");
  });

  document.querySelectorAll(".invite-status .muted").forEach((node) => {
    setCleanupText(node, "אפשר לשלוח את הקישור לחברים.");
  });
  } finally {
    queueMicrotask(() => {
      copyCleanupWriting = false;
    });
  }
}

function setCleanupText(node, text) {
  if (node.textContent !== text) node.textContent = text;
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
