// Presentation only. Permissions, account linking, identity and persistence stay in app.mjs.
const escapeHtml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

export const participantDetailTitle='פרטי משתתף';

export function renderOfflineParticipantExplanationView() {
  return '<p class="participant-detail-explanation">שם שנוסף לחלוקת ההוצאות. לאדם הזה אין גישה לאירוע דרך השם בלבד.</p>';
}

export function renderParticipantFriendshipHintView({kind='',awaitingSharedEvent=false}={}) {
  if(kind==='accepted')return '';
  return `<small>${awaitingSharedEvent?'אפשר להציע חברות אחרי שהאירוע יסיים להסתנכרן':'הישארו בקשר גם אחרי האירוע'}</small>`;
}

export function renderParticipantAccountLinkIntroView() {
  return '<div class="event-participant-link-intro"><p>בחרו את החשבון ששייך לאותו אדם, או שלחו לו הזמנה להצטרף.</p></div>';
}

export function renderParticipantAccountListLabelView() {
  return '<p class="participant-account-list-label">חשבונות באירוע</p>';
}

export function renderParticipantCountView(label) {
  return escapeHtml(label);
}
