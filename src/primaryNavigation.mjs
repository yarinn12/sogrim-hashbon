import { iconSvg } from "./uiIcons.mjs";

export function renderPrimaryNavigation(extraClass = "") {
  const className = ["product-app-nav", extraClass].filter(Boolean).join(" ");
  return `
    <nav class="${className}" aria-label="ניווט ראשי">
      <button class="product-nav-button" data-action="home" data-nav-destination="home" type="button">
        ${iconSvg("home")}<span>בית</span>
      </button>
      <button class="product-nav-button" data-action="home" data-nav-destination="events" type="button">
        ${iconSvg("calendar")}<span>אירועים</span>
      </button>
      <button class="product-nav-button" data-action="open-notifications" data-nav-destination="notifications" type="button" aria-label="התראות">
        ${iconSvg("bell")}<span>התראות</span><span class="product-nav-badge" hidden aria-hidden="true"></span>
      </button>
      <button class="product-nav-button" data-action="edit-profile" data-nav-destination="profile" type="button">
        ${iconSvg("user")}<span>פרופיל</span>
      </button>
    </nav>
  `;
}
