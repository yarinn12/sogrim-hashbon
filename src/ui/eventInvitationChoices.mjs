import { iconSvg } from "../uiIcons.mjs";
import {manualParticipantCopy} from "./eventManualParticipantEditor.mjs";
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
const escapeAttribute=escapeHtml;
// Presentation only: joining, invitations, permission checks and draft state remain in app.mjs.
export function renderEventInvitationChoicesView({eventId=""}={}) {
  const routes=[
    {action:"open-event-share",icon:"share",title:"שתף קישור או QR",hint:"שולחים למי שרוצים לצרף לאירוע.",className:"is-primary"},
    {action:"set-event-participant-add-view",icon:"users",title:"בחר מחברים",hint:"בוחרים מהרשימה שלך באפליקציה.",view:"friends"},
    {action:"set-event-participant-add-view",icon:"user-plus",title:"הוספה לפי שם",hint:manualParticipantCopy.explanation,view:"manual"}
  ];
  return `
    <section class="event-participant-add-zone event-participant-add-routes" aria-label="דרכים להוספת משתתפים">
      <div class="new-event-participant-actions">
        ${routes.map(route=>`<button class="new-event-participant-route-action ${route.className??""}" type="button" data-action="${escapeAttribute(route.action)}" data-event-id="${escapeAttribute(eventId)}" ${route.view?`data-participant-view="${escapeAttribute(route.view)}"`:""}>
          <span class="new-event-participant-route-icon" aria-hidden="true">${iconSvg(route.icon)}</span>
          <span class="event-invitation-choice-copy"><strong>${escapeHtml(route.title)}</strong><small class="event-invitation-choice-hint">${escapeHtml(route.hint)}</small></span>
          <span class="event-invitation-choice-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
        </button>`).join("")}
      </div>
    </section>
  `;
}
