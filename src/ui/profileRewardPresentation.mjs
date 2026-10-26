function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

// Pure profile-card presentation. Entitlement calculation and invitation actions stay in the adapter.
export function renderProfileRewardCardView({status,active,daysRemaining,rewardDays,expiryLabel,giftIconHtml}) {
    const loading = status === "loading";
    const failed = status === "error";
    const signedOut = status === "signed-out";
    const title = active
      ? daysRemaining === 1 ? "נותר יום אחד ללא פרסומות" : `נותרו ${daysRemaining} ימים ללא פרסומות`
      : loading || failed
        ? "ללא פרסומות"
        : rewardDays === 30 ? "חודש ללא פרסומות" : rewardDays === 1 ? "יום אחד ללא פרסומות" : `${rewardDays} ימים ללא פרסומות`;
    const helper = active
      ? `${failed ? "לפי העדכון האחרון, " : ""}בתוקף עד ${expiryLabel}.${failed ? " לא הצלחנו לעדכן כרגע." : ""}`
      : loading
        ? "בודקים את מצב ההטבה…"
        : failed
          ? "מצב ההטבה לא זמין כרגע. אפשר לבדוק שוב במסך ההזמנה."
          : signedOut
            ? "מתחברים לחשבון כדי להזמין חברים ולקבל את ההטבה."
            : "מזמינים חבר חדש. ההטבה מתחילה אחרי שיצטרף וישתמש באפליקציה.";
    const label = active ? "להארכת ההטבה" : "הזמנת חברים";
    return `
      <section id="referral-reward-card-profile" class="referral-reward-card is-profile" data-referral-reward-card data-referral-context="profile" data-referral-status="${escapeHtml(status)}" aria-labelledby="referral-reward-title-profile">
        <span class="referral-reward-icon" aria-hidden="true">${giftIconHtml}</span>
        <span class="referral-reward-copy">
          <strong id="referral-reward-title-profile">${escapeHtml(title)}</strong>
        </span>
        <small class="referral-reward-detail">${escapeHtml(helper)}</small>
        <button class="primary-button referral-reward-action" data-open-referral-rewards data-referral-context="profile" type="button" aria-label="${label}: ${escapeHtml(title)}"><span>${label}</span></button>
      </section>
    `;
}
