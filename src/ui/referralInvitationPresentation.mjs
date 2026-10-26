function escapeAttribute(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

// Pure invitation presentation. Eligibility, URL generation and actions remain in the adapter.
export function renderReferralInvitationDialogView({
  progress, inviteUrl, active, loading, signedOut, blockingError, dialogStateClass,
  referralStatus, referralError, referralBusy, referralNotice, expiryLabel,
  closeIconHtml, shareIconHtml, copyIconHtml, qrMarkup, loadingMarkup
}) {
  return `
    <div class="referral-dialog-shell ${dialogStateClass}">
      <header class="referral-dialog-header">
        <button
          class="referral-close-button"
          data-referral-action="close"
          type="button"
          aria-label="סגירת מסך הזמנת חברים"
        >${closeIconHtml}</button>
        <span class="referral-dialog-header-copy">
          <h2 id="referral-dialog-title">הזמנת חברים</h2>
        </span>
      </header>

      <div class="referral-dialog-content">
        ${
          loading
            ? loadingMarkup
            : signedOut
              ? `
                <div class="referral-state-message is-signin">
                  <strong>הקישור האישי מחכה לך</strong>
                  <span>מתחברים לחשבון כדי להזמין חברים ולשמור את החודש ללא פרסומות.</span>
                  <button class="primary-button" data-referral-action="profile" type="button">לפרופיל ולהתחברות</button>
                </div>
              `
              : blockingError
                ? `
                  <div class="referral-state-message is-error" role="status">
                    <span>${referralError}</span>
                    <button class="secondary-button" data-referral-action="retry" type="button">נסה שוב</button>
                  </div>
                `
                : `
                  ${
                    referralError
                      ? `
                        <div class="referral-state-message is-stale" role="status">
                          <span>${referralError}</span>
                          <button class="secondary-button" data-referral-action="retry" type="button">רענון</button>
                        </div>
                      `
                      : ""
                  }
                  <section class="referral-gift-card" aria-label="ההזמנה וההטבה">
                    <section class="referral-benefit-card" aria-labelledby="referral-benefit-title">
                      <strong id="referral-benefit-title">${referralStatus.rewardDays === 30 ? "חודש ללא פרסומות" : referralStatus.rewardDays === 1 ? "יום אחד ללא פרסומות" : `${referralStatus.rewardDays} ימים ללא פרסומות`}</strong>
                      <p>חבר חדש מצטרף מהקישור, נכנס לאירוע ומשלים פעולה — וההטבה נפתחת.</p>
                      ${
                        active
                          ? `<span class="referral-active-until">ההטבה שלך פעילה עד ${expiryLabel}</span>`
                          : ""
                      }
                    </section>

                    <section class="referral-share-section" aria-label="שיתוף ההזמנה">
                      <div class="referral-share-workspace">
                        <div class="referral-share-controls">
                          <div class="referral-share-actions">
                            <button class="primary-button" data-referral-action="share" type="button" ${inviteUrl && !referralBusy ? "" : "disabled"} ${referralBusy ? 'aria-busy="true"' : ""}>
                              ${shareIconHtml}
                              <span>שיתוף קישור</span>
                            </button>
                            <button class="secondary-button" data-referral-action="copy" type="button" ${inviteUrl && !referralBusy ? "" : "disabled"} ${referralBusy ? 'aria-busy="true"' : ""}>
                              ${copyIconHtml}
                              <span>העתקת קישור</span>
                            </button>
                          </div>
                          <details class="referral-link-details">
                            <summary>הצגת הקישור</summary>
                            <label class="referral-link-field">
                              <span>קישור לשיתוף</span>
                              <input value="${escapeAttribute(inviteUrl)}" readonly dir="ltr" />
                            </label>
                          </details>
                        </div>
                        ${qrMarkup}
                      </div>
                      ${referralNotice ? `<p class="referral-notice" role="status">${referralNotice}</p>` : ""}
                    </section>
                  </section>

                  <details class="referral-more-details">
                    <summary>
                      <span>
                        <strong>פרטי ההטבה</strong>
                        <small>${progress.rewarded} חברים השלימו שימוש · <span class="font-num">${referralStatus.daysEarned}</span> ימים נצברו</small>
                      </span>
                    </summary>
                    <div class="referral-more-details-content">
                      <section class="referral-progress-section" aria-labelledby="referral-progress-title">
                        <div class="referral-progress-heading">
                          <span>
                            <h3 id="referral-progress-title">ההתקדמות שלך השנה</h3>
                            <p>${progress.rewarded} חברים השלימו שימוש${referralStatus.pendingReferrals ? ` · ${referralStatus.pendingReferrals} בדרך` : ""}</p>
                          </span>
                          <strong><span class="font-num">${referralStatus.daysEarned}</span> ימים</strong>
                        </div>
                        <div
                          class="referral-progress-track"
                          role="progressbar"
                          aria-valuemin="0"
                          aria-valuemax="${progress.limit}"
                          aria-valuenow="${progress.rewarded}"
                          aria-label="מספר ההטבות שנצברו השנה"
                        >
                          <span style="width:${progress.percentage}%"></span>
                        </div>
                        <small>${progress.remaining} הטבות נוספות זמינות ב-12 החודשים הקרובים.</small>
                      </section>

                      <ol class="referral-steps">
                        <li><span>1</span><strong>משתפים</strong><small>קישור או QR</small></li>
                        <li><span>2</span><strong>החבר מצטרף</strong><small>ונכנס לאירוע</small></li>
                        <li><span>3</span><strong>המתנה נפתחת</strong><small>אחרי שימוש אמיתי</small></li>
                      </ol>
                    </div>
                  </details>
                `
        }
      </div>
    </div>
  `;
}


export function renderReferralInvitationQrView(qrSvg) {
    return `
      <figure class="referral-qr-card" data-referral-qr>
        <div class="referral-qr-code">${qrSvg}</div>
        <figcaption><small>אפשר גם לסרוק את הקוד</small></figcaption>
      </figure>
    `;
}
