import { iconSvg } from "../uiIcons.mjs";
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
const escapeAttribute=escapeHtml;
// Presentation only: visibility, financial insights, currency and account ownership stay in app.mjs.
export function renderFriendRelationshipProfileView({participantId="",targetName="",identityView="offline",avatarHtml="",usernameHtml="",connectionHtml="",activity={},backHtml="",noticeHtml="",habitHtml="",factsHtml="",safetyHtml=""}={}) {
  const identityClass=identityView==="account"?"is-account":"is-offline";
  const metric = (label, currentValue, targetValue) => '<section class="friend-activity-metric"><h3>'+escapeHtml(label)+'</h3><div class="friend-activity-values"><div><small>אתה</small><strong class="font-num" dir="ltr">'+escapeHtml(currentValue)+'</strong></div><div><small>'+escapeHtml(targetName)+'</small><strong class="font-num" dir="ltr">'+escapeHtml(targetValue)+'</strong></div></div></section>';
  return `
    <section class="screen font-hebrew friends-hub-screen friend-relationship-screen" data-screen-kind="groups" data-friends-tab="people" data-friend-profile-id="${escapeAttribute(participantId)}">
      <header class="top">${backHtml}<div class="brand"><h1>פרטי חבר</h1></div></header>
      ${noticeHtml}
      <div class="friend-relationship-content">
        <section class="event-participant-profile-card event-participant-detail event-participant-relationship ${identityClass}" data-participant-detail-view="${identityView}" data-participant-id="${escapeAttribute(participantId)}">
          <header class="event-participant-profile-identity event-participant-detail-identity relationship-identity-card">
            ${avatarHtml}
            <div class="relationship-identity-copy"><strong>${escapeHtml(targetName)}</strong>${usernameHtml}${connectionHtml}</div>
          </header>
          ${activity.hasHistory ? `
          <section class="friend-activity-overview" aria-labelledby="friend-activity-title">
            <h2 id="friend-activity-title">הפעילות המשותפת</h2>
            <p class="relationship-scorecard-note">${escapeHtml(activity.note)}</p>
            ${metric("כמה כל אחד שילם בהוצאות",activity.paid.current,activity.paid.target)}
            ${metric("הוצאות שנוספו",activity.expensesAdded.current,activity.expensesAdded.target)}
          </section>
          <details class="friend-activity-more"><summary><span>עוד על הפעילות המשותפת</span><span aria-hidden="true">${iconSvg("chevron-left")}</span></summary><div class="friend-activity-more-content">
            ${metric("פעולות באירועים",activity.involvement.current,activity.involvement.target)}
            ${habitHtml}
            ${factsHtml}
          </div></details>
          ` : '<section class="friend-activity-empty"><h2>עדיין אין הוצאות משותפות</h2><p>כשיוסיפו הוצאות לאירוע משותף, הן יופיעו כאן.</p></section>'}
          ${safetyHtml}
        </section>
      </div>
    </section>
  `;
}

