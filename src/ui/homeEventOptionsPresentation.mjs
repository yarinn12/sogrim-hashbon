import {iconSvg} from "../uiIcons.mjs";
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const escapeAttribute=escapeHtml;

// Presentation only. Permissions, persistence, pin acknowledgement and confirmations stay in the app.
export function renderHomeEventOptionsView({event={},canShare=false,canRemove=false,removesForEveryone=false,removalDescription="",shareDescription="",isPersonallyArchived=false,isPersonallyPinned=false,pinError="",commandIcons={}}={}) {
  const renderCommandIcon=name=>commandIcons[name]??"";
  return `
    <section class="event-status-menu-backdrop" aria-label="אפשרויות לאירוע ${escapeAttribute(event.name)}">
      <section
        class="event-status-menu home-options-review"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-status-menu-title"
        aria-describedby="event-status-menu-description"
        data-event-id="${escapeAttribute(event.id)}"
        tabindex="-1"
      >
        <span class="event-status-menu-handle" aria-hidden="true"></span>
        <div class="event-status-menu-copy">
          <span class="event-status-menu-label">אפשרויות אירוע</span>
          <h2 id="event-status-menu-title">${escapeHtml(event.name)}</h2>
          <p class="visually-hidden" id="event-status-menu-description">אפשרויות הצמדה, שיתוף, ארכיון והסרת האירוע.</p>
        </div>
        <div class="event-home-menu-actions" aria-label="פעולות לאירוע">
          <button class="event-note-pin-toggle home-options-row${isPersonallyPinned ? " is-active" : ""}"
            type="button" data-action="toggle-personal-event-pin" data-event-id="${escapeAttribute(event.id)}"
            aria-pressed="${isPersonallyPinned}" aria-describedby="event-pin-description">
            ${iconSvg("pin")}
            <span class="home-options-copy"><strong>${isPersonallyPinned ? "ביטול הצמדה" : "הצמד לראש הרשימה"}</strong><small id="event-pin-description">ברשימה האישית שלך.</small></span>
            <span class="home-options-pin-state" aria-hidden="true">${isPersonallyPinned ? iconSvg("check") : ""}</span>
          </button>
          ${pinError ? `<p class="field-error" role="alert">${escapeHtml(pinError)}</p>` : ""}
          <button
            class="event-share-option home-options-row"
            type="button"
            data-action="share-event-from-list"
            data-event-id="${escapeAttribute(event.id)}"
            ${canShare ? "" : 'disabled aria-disabled="true"'}
          >
            ${renderCommandIcon("share")}
            <span>
              <strong>שיתוף</strong>
              <small>${escapeHtml(canShare ? "קישור, QR והזמנת משתתפים" : shareDescription)}</small>
            </span>
            <span class="event-share-route-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
          </button>
          <button
            class="event-share-option home-options-row"
            type="button"
            data-action="toggle-personal-event-archive"
            data-event-id="${escapeAttribute(event.id)}"
          >
            ${renderCommandIcon("archive")}
            <span>
              <strong>${isPersonallyArchived ? "החזר לאירועים" : "העבר לארכיון"}</strong>
              <small>${isPersonallyArchived ? "מחזיר לרשימת האירועים שלך" : "מסתיר מהרשימה שלך במכשיר הזה"}</small>
            </span>
            <span class="event-share-route-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
          </button>
        </div>
        <div class="event-status-danger-zone">
          <button
            class="event-removal-option home-options-row"
            type="button"
            data-action="remove-event-from-list"
            data-event-id="${escapeAttribute(event.id)}"
            ${canRemove ? "" : "disabled"}
          >
            ${renderCommandIcon("danger")}
            <span>
              <strong>${removesForEveryone ? "מחיקת האירוע" : "עזיבת האירוע"}</strong>
              <small>${escapeHtml(removalDescription)}</small>
            </span>
            <span class="event-share-route-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
          </button>
        </div>
        <button class="secondary-button event-status-menu-cancel" type="button" data-action="cancel-event-status-menu">חזרה לרשימה</button>
      </section>
    </section>
  `;
}
