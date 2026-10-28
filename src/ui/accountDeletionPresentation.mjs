// Presentation only. Consent, deletion, history and focus are owned by the account adapter.
export function renderAccountDeletionConfirmationView() {
  return `
    <div class="account-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="account-delete-title" aria-describedby="account-delete-description" tabindex="-1">
      <h2 id="account-delete-title">למחוק את החשבון?</h2>
      <div id="account-delete-description" class="account-delete-description">
        <p>החשבון והמידע האישי שלך יימחקו לצמיתות.</p>
        <p>ההוצאות המשותפות יישמרו אצל שאר המשתתפים בשם ״משתמש שנמחק״.</p>
      </div>
      <label class="account-delete-confirmation">
        <input type="checkbox" name="deleteAccountConfirmation" data-account-delete-confirmation />
        <span>אני מבין שאי אפשר לבטל את המחיקה.</span>
      </label>
      <p class="account-delete-error" role="alert" data-account-delete-error hidden></p>
      <div class="account-delete-actions">
        <button class="primary-button" type="button" data-account-action="delete-account-cancel">ביטול</button>
        <button class="secondary-button account-delete-confirm" type="button" data-account-action="delete-account-confirm" disabled>מחק את החשבון</button>
      </div>
    </div>`;
}
