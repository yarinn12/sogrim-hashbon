const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

// Only a view model enters this module. It never handles images or cloud writes.
export function renderBitProfileView(model){
  if(!model.enabled)return '';
  const busy=Boolean(model.busy),ready=Boolean(model.profile)&&!model.needsReload;
  const saved=Boolean(model.profile?.url),draft=model.draft!==undefined;
  const progress=model.busy==='load'?'טוענים את פרטי Bit…':model.busy==='read'?'קוראים את הקוד מתוך התמונה…':model.busy==='save'?'שומרים את השינוי בחשבון…':'';
  return `<section class="bit-profile-section" aria-labelledby="bit-profile-title" aria-busy="${busy}">
    <div class="bit-profile-heading"><img src="./assets/bit/bit-logo.png" width="32" height="32" alt="" aria-hidden="true"><h2 id="bit-profile-title">Bit <span>לא חובה</span></h2></div>
    <p class="bit-profile-description">אפשר להוסיף את הקוד האישי שלך לקבלת כסף ב־Bit, כדי שחברים יוכלו להגיע אליך בקלות כשמשלמים לך.</p>
    ${!saved?`<details class="bit-profile-help" open><summary>איך מוצאים את ה־QR ב־Bit?</summary><ol>
      <li>פותחים את תפריט ⋯ ב־Bit ובוחרים „קוד ה־QR הקבוע שלי לקבלת כסף”.</li>
      <li>מצלמים צילום מסך שבו כל הקוד מופיע, בלי לחתוך את השוליים.</li>
      <li>חוזרים לכאן, לוחצים „בחר תמונת QR” ובוחרים את צילום המסך מהגלריה.</li>
      <li>אחרי הזיהוי לוחצים „שמור קיצור Bit”.</li></ol></details>`:''}
    <p class="bit-profile-current">${saved?'יש קיצור Bit שמור בחשבון. אפשר להחליף או להסיר אותו.':'אפשר להמשיך להשתמש באפליקציה גם בלי להוסיף QR.'}</p>
    <div class="bit-profile-actions">
      <button type="button" class="secondary-button" data-bit-action="choose" ${busy||!ready?'disabled':''}>${saved?'החלף תמונת QR':'בחר תמונת QR'}</button>
      <input type="file" data-bit-file accept="image/png,image/jpeg,image/webp" aria-label="צילום קוד QR אישי של Bit" hidden>
      ${draft?`<button type="button" class="primary-button" data-bit-action="save" ${busy||!ready?'disabled':''}>שמור קיצור Bit</button>`:''}
      ${saved?`<button type="button" class="bit-profile-remove" data-bit-action="remove" ${busy||!ready?'disabled':''}>הסר את קיצור Bit</button>`:''}
      <button type="button" class="bit-profile-refresh" data-bit-action="refresh" ${busy?'disabled':''}>${draft?'רענן ובטל את הבחירה':'רענן את פרטי Bit'}</button>
    </div>
    <p class="bit-profile-status ${model.error?'has-error':''}" role="status" aria-live="polite">${esc(progress||model.error||model.notice)}</p>
    <p class="bit-profile-privacy">התמונה מפוענחת במכשיר ואינה נשלחת לשרת. נשמר רק קיצור הפתיחה בחשבון שלך. אפשר להסיר אותו בכל זמן.</p>
  </section>`;
}
