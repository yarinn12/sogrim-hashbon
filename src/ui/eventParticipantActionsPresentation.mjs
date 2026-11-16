// Presentation only. Identity, permissions, financial calculation and persistence stay in the app.
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
export function renderParticipantActionConfirmationView({dialog:d,source,target,eventName,connected,sourceAvatar='',targetAvatar=''}) {
 const link=d.kind==='merge-participants'&&d.payload?.mergeKind==='account-link';
 if(!link&&d.kind!=='remove-event-participant')return null;
 const history=Boolean(d.alternateDisabled),processing=Boolean(d.processing);
 const title=processing?'מקשרים את החשבון':link?'לקשר לחשבון?':connected?'להסיר מהאירוע?':'להסיר את השם?';

 const description=processing?'בסיום נחזור לרשימת המשתתפים המעודכנת. אפשר לחזור אליה גם עכשיו.':link?'השם והחשבון יאוחדו למשתתף אחד. חלוקת ההוצאות וההחזרים תתעדכן באירוע הזה בלבד.':connected?(history?'הגישה לאירוע תוסר. השם והפעולות הקודמות יישארו בהיסטוריה ובחישוב.':'הגישה והשם יוסרו מהאירוע. אין על השם הוצאות או העברות.'):history?'השם יוסר מהרשימה. ההוצאות וההעברות שכבר נרשמו יישארו בחישוב.':'השם יוסר מהאירוע. אין על השם הוצאות או העברות.';
 const person=(p,avatar,label,nameId)=>`<div class="participant-confirm-person">${avatar}<div><span class="participant-confirm-caption${link?'':' participant-identity-label'}">${esc(label)}</span><strong id="${nameId}">${esc(p?.displayName)}</strong>${p?.username?`<span class="participant-confirm-username" dir="ltr">${esc(p.username)}</span>`:''}</div></div>`;
 const identity=link?`<div class="participant-confirm-identities">${person(source,sourceAvatar,'השם באירוע','participant-confirm-source-name')}${person(target,targetAvatar,'החשבון שאליו מקשרים','participant-confirm-target-name')}</div>`:person(source,sourceAvatar,connected?'משתתף עם חשבון':'שם ללא חשבון','participant-confirm-source-name');
 const labelledBy=['important-action-title','participant-confirm-event-name',...(!processing?['participant-confirm-source-name',...(link?['participant-confirm-target-name']:[])]:[])].join(' ');
 return `<section class="important-action-dialog-backdrop" aria-label="${esc(title)}"><section class="important-action-dialog event-participant-action-confirmation ${link?'is-link':'is-removal'}" role="alertdialog" aria-modal="true" aria-labelledby="${labelledBy}" aria-describedby="important-action-description" data-important-action-kind="${esc(d.kind)}" tabindex="-1" ${processing?'aria-busy="true"':''}>
 <div class="important-action-copy"><h2 id="important-action-title">${esc(title)}</h2><p id="participant-confirm-event-name" class="participant-confirm-event">${esc(eventName)}</p>${processing?'':identity}<p id="important-action-description">${description}</p></div>
 <div class="important-action-dialog-actions"><button class="primary-button" type="button" data-action="cancel-important-action">${processing?'חזרה למשתתפים':'ביטול'}</button><button class="important-action-confirm-button" type="button" data-action="confirm-important-action" ${link?'data-allow-offline-mutation="true"':''} ${processing?'disabled':''}>${processing?'מקשרים…':link?'קשר לחשבון':connected?'הסר מהאירוע':'הסר מהרשימה'}</button></div>
 ${!link&&!history?'<button class="participant-confirm-alternate" type="button" data-action="confirm-important-action-alternate">השאר את השם בהיסטוריה</button>':''}
 </section></section>`;
}

export function renderParticipantRenameBodyView({eventId,participantId,nameDraft,error='',canEdit=false}={}) {
  return `
    <section class="event-participant-rename-card">
      <label class="field event-participant-rename-field"><span>שם המשתתף</span><input type="text" name="offlineParticipantName" maxlength="48" autocomplete="off" enterkeyhint="done" data-action="event-offline-participant-rename" data-event-id="${esc(eventId)}" data-participant-id="${esc(participantId)}" value="${esc(nameDraft)}" aria-describedby="event-participant-rename-note" ${canEdit?'':'disabled'}></label>
      <p id="event-participant-rename-note">השם מתעדכן בכל מקום שבו הוא מופיע. ההוצאות וההעברות יישארו כפי שהן.</p>
      ${error?`<p class="form-error" role="alert">${esc(error)}</p>`:''}
      <div class="event-modal-actions event-participant-rename-actions"><button class="secondary-button" type="button" data-action="event-participant-rename-back">ביטול</button><button class="primary-button" type="button" data-action="save-offline-participant-name" data-event-id="${esc(eventId)}" data-participant-id="${esc(participantId)}" ${canEdit?'':'disabled'}>שמור שם</button></div>
    </section>`;
}
