import {iconSvg} from "../uiIcons.mjs";

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character =>
  ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"}[character]));

// The app supplies the formatted name, private pin state and trusted avatar/meta views.
export function renderHomeEventCardView({
  id = "", name = "", optionsLabel = "", pinned = false, expanded = false,
  avatarsHtml = "", metaHtml = ""
} = {}) {
  return `
    <article class="event-row long-event-card-review${pinned ? " is-pinned" : ""}" data-event-id="${escapeHtml(id)}" data-long-press-event="true" aria-haspopup="dialog">
      <button class="event-row-open" type="button" data-action="open-event" data-event-id="${escapeHtml(id)}">
        <span class="event-row-main">
        <span class="event-row-title">
          <strong>${escapeHtml(name)}</strong>
          ${pinned ? `<span class="event-note-pin" aria-label="אירוע מוצמד">${iconSvg("pin")}</span>` : ""}
        </span>
        <span class="event-row-context">${avatarsHtml}${metaHtml}</span>
        </span>
      </button>
      <button type="button" class="event-status-toggle" data-action="event-status-select" data-event-id="${escapeHtml(id)}" aria-haspopup="dialog" aria-expanded="${Boolean(expanded)}" aria-label="${escapeHtml(optionsLabel)}" title="${escapeHtml(optionsLabel)}">
        <span class="event-row-options-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
      </button>
      <span class="visually-hidden">לחיצה ארוכה פותחת את אפשרויות האירוע: הצמדה, שיתוף או הסרה.</span>
    </article>`;
}
