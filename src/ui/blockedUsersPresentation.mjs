import {iconSvg} from "../uiIcons.mjs";
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));


// The adapter supplies already-loaded rows and account/surface-owned feedback.
export function renderBlockedUsersView({users=[], ownerScope="", busy=false, feedback=null}={}) {
 if(!users.length)return "";
 return `<details class="friend-privacy-note blocked-users-panel" data-owner-scope="${escapeHtml(ownerScope)}">
  <summary><span class="friend-privacy-summary-label">משתמשים חסומים (${users.length})</span><span class="inline-chevron friend-privacy-chevron">${iconSvg("chevron-left")}</span></summary>
  <div class="blocked-users-list"><p class="blocked-user-help">ביטול חסימה לא מחזיר את החברות.</p>
   ${users.map(user=>{
    const error=feedback?.targetUserId===user.targetUserId ? feedback.message : "";
    return `<div class="blocked-user-row" data-blocked-user-id="${escapeHtml(user.targetUserId)}">
     <span><strong>${escapeHtml(user.displayName)}</strong>${user.username ? `<small><bdi dir="ltr">${escapeHtml(user.username)}</bdi></small>` : ""}</span>
     <button class="secondary-button" type="button" data-action="unblock-connected-user" data-target-user-id="${escapeHtml(user.targetUserId)}" ${busy ? "disabled" : ""}>${error ? "נסה שוב" : "בטל חסימה"}</button>
     ${error ? `<p class="blocked-user-error" role="alert">${escapeHtml(error)}</p>` : ""}
    </div>`;
   }).join("")}
  </div>
 </details>`;
}

export function captureBlockedUsersDisclosure(root, screen) {
 const panel=root.querySelector(".blocked-users-panel");
 return panel ? {open:panel.open,scope:panel.dataset.ownerScope,screen} : null;
}
export function restoreBlockedUsersDisclosure(root, snapshot, scope, screen) {
 if(!snapshot?.open || snapshot.scope!==scope || snapshot.screen!==screen)return false;
 const panel=root.querySelector(".blocked-users-panel");
 if(!panel || panel.dataset.ownerScope!==scope)return false;
 panel.open=true;
 return true;
}
