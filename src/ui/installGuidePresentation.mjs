import {iconSvg} from "../uiIcons.mjs";

// Presentation only; installation offers, platform checks, history and focus stay in the adapter.
export function renderInstallGuideView({ios=false}={}) {
  const instructions = ios
    ? `
        <ol class="install-app-steps">
          <li><span aria-hidden="true">1</span><div><strong>פותחים ב־Safari</strong><p>אם הקישור נפתח באפליקציה אחרת, מעתיקים אותו ופותחים ב־Safari.</p></div></li>
          <li><span aria-hidden="true">2</span><div><strong>בוחרים ״שיתוף״</strong><p>דרך תפריט העמוד או כפתור השיתוף בדפדפן.</p></div></li>
          <li><span aria-hidden="true">3</span><div><strong>בוחרים ״הוספה למסך הבית״</strong><p>האפשרות נמצאת ברשימת הפעולות של השיתוף.</p></div></li>
          <li class="install-app-required-step"><span aria-hidden="true">4</span><div><strong>מאשרים את ההוספה</strong><p>אם מופיע <bdi dir="ltr">Open as Web App</bdi>, משאירים אותו מופעל ולוחצים ״הוסף״.</p></div></li>
        </ol>
      `
    : `
        <ol class="install-app-steps">
          <li><span aria-hidden="true">1</span><div><strong>פותחים את תפריט הדפדפן</strong><p>ב־Chrome לוחצים על שלוש הנקודות.</p></div></li>
          <li><span aria-hidden="true">2</span><div><strong>בוחרים התקנה ומאשרים</strong><p>האפשרות עשויה להופיע בשם ״התקנת אפליקציה״ או ״הוספה למסך הבית״.</p></div></li>
        </ol>
      `;

  return `
      <div class="install-app-backdrop">
        <section class="install-app-dialog" role="dialog" aria-modal="true" aria-labelledby="install-app-title" aria-describedby="install-app-description" tabindex="-1">
          <header>
            <div>
              <h2 id="install-app-title">${ios ? "הוספה למסך הבית" : "התקנה בטלפון"}</h2>
              <p id="install-app-description" class="install-app-description">פותחים את האפליקציה ישירות ממסך הבית.</p>
            </div>
            <button class="icon-button modal-close-button" data-public-close-install type="button" aria-label="חזרה לאפליקציה" title="חזרה"><span class="modal-control-icon" aria-hidden="true">${iconSvg("chevron-left")}</span></button>
          </header>
          ${instructions}
          <button class="primary-button install-app-done" data-public-close-install type="button">הבנתי</button>
        </section>
      </div>
    `;
}
