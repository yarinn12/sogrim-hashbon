import {iconSvg} from '../uiIcons.mjs';

// Presentation only. Eligibility, account actions and acknowledgements stay in app.mjs.
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

export function renderParticipantSafetyPanelView({targetUserId,participantId,eventId='',blocked=false,busy=false,canReport=false}={}) {
  return `<details class="relationship-event-management relationship-safety-management participant-safety-panel">
    <summary><span>פרטיות</span><span class="safety-disclosure-icon" aria-hidden="true">${iconSvg('chevron-left')}</span></summary>
    <div class="relationship-safety-copy">
      <p>${blocked ? 'המשתמש חסום. האירועים והחובות המשותפים נשארים ללא שינוי.' : 'חסימה מונעת בקשות חברות ביניכם. האירועים והחובות המשותפים נשארים ללא שינוי.'}</p>
      <div class="relationship-safety-actions">
        ${!blocked&&canReport?`<button class="safety-option" type="button" data-action="open-participant-report" data-event-id="${esc(eventId)}" data-participant-id="${esc(participantId)}"><span>דיווח על המשתמש</span><span aria-hidden="true">${iconSvg('chevron-left')}</span></button>`:''}
        ${blocked?`<button class="safety-option" type="button" data-action="unblock-connected-user" data-target-user-id="${esc(targetUserId)}" data-event-id="${esc(eventId)}" ${busy?'disabled':''}><span>${busy?'מעדכן…':'ביטול חסימה'}</span><span aria-hidden="true">${iconSvg('chevron-left')}</span></button>`:`<button class="safety-option is-danger" type="button" data-action="block-connected-user" data-target-user-id="${esc(targetUserId)}" data-participant-id="${esc(participantId)}" data-event-id="${esc(eventId)}" ${busy?'disabled':''}><span>${busy?'מעדכן…':'חסימת משתמש'}</span><span aria-hidden="true">${iconSvg('chevron-left')}</span></button>`}
      </div>
    </div>
  </details>`;
}

export function renderParticipantReportBodyView({name='',avatarHtml='',usernameHtml='',category='',details='',error='',busy=false}={}) {
  const categories=[['harassment','הטרדה או התנהגות פוגענית'],['impersonation','התחזות או זהות שגויה'],['offensive_content','תוכן לא ראוי'],['spam','ספאם או הזמנות חוזרות'],['other','סיבה אחרת']];
  return `<div class="participant-report-person">${avatarHtml}<div><strong>${esc(name)}</strong>${usernameHtml}</div></div>
      <p class="participant-report-privacy">הדיווח לא נשלח למשתמש.</p>
      <div class="participant-report-form">
        <label class="field">
          <span>מה קרה?</span>
          <select data-action="participant-report-category" required ${busy?'disabled':''}>
            <option value="" ${category?'':'selected'} disabled>בחירת סיבה</option>
            ${categories.map(([value,label])=>`<option value="${value}" ${category===value?'selected':''}>${label}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span>מה חשוב שנדע? <small>(לא חובה)</small></span>
          <textarea data-action="participant-report-details" maxlength="1000" rows="4" placeholder="אפשר לכתוב בקצרה מה קרה" ${busy?'disabled':''}>${esc(details)}</textarea>
        </label>
        ${error?`<p class="field-error" role="alert">${esc(error)}</p>`:''}
        <button class="primary-button" type="button" data-action="submit-participant-report" ${!category||busy?'disabled':''}>${busy?'שולח…':error?'נסה שוב':'שלח דיווח'}</button>
      </div>`;
}

export function renderParticipantBlockConfirmationView({participant,avatarHtml='',usernameHtml=''}={}) {
  return `<section class="important-action-dialog-backdrop" aria-label="חסימת משתמש"><section class="important-action-dialog event-participant-action-confirmation participant-safety-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="important-action-title safety-person-name" aria-describedby="important-action-description safety-preserved-description" data-important-action-kind="block-connected-user" tabindex="-1">
    <div class="important-action-copy">
      <h2 id="important-action-title">לחסום את המשתמש?</h2>
      <div class="participant-confirm-person">${avatarHtml}<div><strong id="safety-person-name">${esc(participant?.displayName||'משתמש')}</strong>${usernameHtml}</div></div>
      <p id="important-action-description">לא תוכלו לשלוח בקשות חברות זה לזה.</p>
      <p id="safety-preserved-description" class="safety-preserved">האירועים, ההוצאות והחובות ביניכם יישארו ללא שינוי.</p>
    </div>
    <div class="important-action-dialog-actions"><button type="button" class="primary-button" data-action="cancel-important-action">ביטול</button><button type="button" class="important-action-confirm-button" data-action="confirm-important-action">חסום משתמש</button></div>
  </section></section>`;
}
