import { iconSvg } from "../uiIcons.mjs";

// Presentation only. Preference state, storage, history and focus remain in the adapter.
export function renderAccessibilityCenterView() {
  return `
      <div class="accessibility-center-backdrop">
        <section
          class="accessibility-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="accessibility-center-title"
          aria-describedby="accessibility-center-description"
          tabindex="-1"
        >
          <header class="accessibility-center-header">
            <div>
              <h2 id="accessibility-center-title">נגישות</h2>
              <p id="accessibility-center-description">
                השינויים חלים מיד ונשמרים במכשיר הזה.
              </p>
            </div>
            <button
              class="accessibility-close-button"
              data-close-accessibility
              type="button"
              aria-label="חזרה לאפליקציה"
              title="חזרה"
            >${iconSvg("chevron-left")}</button>
          </header>

          <div class="accessibility-center-content">
            <fieldset class="accessibility-text-size-control">
              <legend>גודל הטקסט</legend>
              <p>אפשר להשתמש בהגדרת המכשיר או לבחור גודל אחר.</p>
              <div class="accessibility-segmented-control">
                ${renderTextSizeOption("system", "לפי המכשיר")}
                ${renderTextSizeOption("large", "גדול")}
                ${renderTextSizeOption("extra-large", "גדול מאוד")}
              </div>
            </fieldset>

            <label class="accessibility-setting-row">
              <span>
                <strong>ניגודיות גבוהה</strong>
                <small>טקסט וכפתורים בולטים יותר.</small>
              </span>
              <input
                data-accessibility-contrast
                type="checkbox"
                role="switch"
                aria-label="ניגודיות גבוהה"
              />
              <span class="accessibility-switch" aria-hidden="true"></span>
            </label>

            <label class="accessibility-setting-row">
              <span>
                <strong>הפחתת תנועה</strong>
                <small>פחות אנימציות ומעברים.</small>
              </span>
              <input
                data-accessibility-motion
                type="checkbox"
                role="switch"
                aria-label="הפחתת תנועה"
              />
              <span class="accessibility-switch" aria-hidden="true"></span>
            </label>

            <a class="accessibility-statement-link" href="./accessibility.html">
              <span>
                <strong>הצהרת נגישות</strong>
              </span>
              <span aria-hidden="true">${iconSvg("chevron-left")}</span>
            </a>
          </div>

          <footer class="accessibility-center-footer">
            <button class="accessibility-done-button" data-close-accessibility type="button">סיום</button>
            <button class="accessibility-reset-button" data-reset-accessibility type="button">איפוס הגדרות</button>
          </footer>
          <p class="visually-hidden" data-accessibility-status role="status" aria-live="polite"></p>
        </section>
      </div>
    `;
}

function renderTextSizeOption(value, label) {
  return `
    <label>
      <input
        data-accessibility-text-size
        type="radio"
        name="accessibility-text-size"
        value="${value}"
      />
      <span>${label}</span>
    </label>
  `;
}
