import {iconSvg} from "../uiIcons.mjs";

// Presentation only: the app selects the confirmed empty state after account hydration.
export function renderHomeEmptyStateView({view="first"}={}) {
  if(view==="first")return `
              <div class="empty-state home-list-empty home-first-event-empty">
                <span class="home-list-empty-icon" aria-hidden="true">${iconSvg("calendar")}</span>
                <strong>אין אירועים שלך עדיין</strong>
                <p>פותחים אירוע חדש, או נכנסים מהזמנה שקיבלת בקישור.</p>
              </div>`;
  const archive=view==="archive";
  return `<div class="empty-state home-list-empty">
                        <span class="home-list-empty-icon" aria-hidden="true">${iconSvg(archive ? "archive" : "calendar")}</span>
                        <strong>${archive ? "הארכיון שלך ריק" : "אין אירועים ברשימה"}</strong>
                        <p>${archive ? "אירועים שהעברת לארכיון יופיעו כאן. אפשר להחזיר אותם לרשימת האירועים." : "אירועים שהעברת לארכיון נשארים זמינים בלשונית ארכיון."}</p>
                        <button class="secondary-button" type="button" data-action="event-status-filter" data-filter="${archive ? "events" : "archive"}">${archive ? "חזרה לאירועים" : "פתיחת הארכיון"}</button>
                      </div>`;
}
