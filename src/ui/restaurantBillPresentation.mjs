import {iconSvg} from "../uiIcons.mjs";

// Pure presentation. Drafts, permissions, money calculation and persistence belong to the app adapter.
function escapeText(value = "") {
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[c]);
}
export function renderRestaurantBillView({eventId="",currency="",stage="method",equalSplit=false,canEdit=false,blockedMessage="",restoredDraftHtml="",progressHtml="",bodyHtml="",actionsHtml="",navHtml="",error=""} = {}) {
  const copy = {
    method: { eyebrow: "חשבון מסעדה", title: "איך מחלקים?", description: "" },
    items: {
      eyebrow: "חשבון מסעדה",
      title: equalSplit ? "סכום וסועדים" : "מנות ומחירים",
      description: equalSplit
        ? "מזינים סכום ובוחרים מי השתתף בארוחה."
        : "מזינים מחיר ובוחרים מי השתתף בכל מנה."
    },
    review: { eyebrow: "חשבון מסעדה", title: "כמה כל אחד משלם?", description: "" },
    payer: {
      eyebrow: "חשבון מסעדה", title: "מי שילם?",
      description: "בחרו מי שילם כדי לשמור את ההוצאות באירוע."
    }
  }[stage];

  return `
    <section class="expense-modal-backdrop expense-route-backdrop" aria-label="חלון חשבון מסעדה">
      <section
        class="panel expense-modal quick-expense-modal restaurant-quick-modal restaurant-review-design"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-expense-title"
        ${copy.description ? 'aria-describedby="quick-expense-description"' : ""}
        data-event-id="${escapeText(eventId)}"
        data-currency="${escapeText(currency)}"
        data-quick-stage="${stage}"
        tabindex="-1"
      >
        <div class="expense-modal-header expense-modal-step-header">
          <div>
            <p class="eyebrow">${copy.eyebrow}</p>
            <h2 id="quick-expense-title">${copy.title}</h2>
            ${restoredDraftHtml}
          </div>
          <div class="expense-modal-header-actions">
            <button class="accessibility-entry-button accessibility-entry-header expense-accessibility-button" data-open-accessibility type="button" aria-label="פתיחת הגדרות נגישות" title="נגישות"><span aria-hidden="true">${iconSvg("accessibility")}</span></button>
            ${
              stage !== "method"
                ? `<button class="icon-button modal-section-back-button" data-action="expense-step-back" aria-label="חזרה לשלב הקודם" title="חזרה לשלב הקודם"><span class="modal-control-icon" aria-hidden="true">${iconSvg("chevron-left")}</span></button>`
                : `<button class="icon-button modal-section-back-button" data-action="cancel-expense" aria-label="חזרה לאירוע" title="חזרה לאירוע"><span class="modal-control-icon" aria-hidden="true">${iconSvg("chevron-left")}</span></button>`
            }
          </div>
        </div>

        ${progressHtml}
        ${!canEdit ? `<p class="notice" role="status">${escapeText(blockedMessage)}</p>` : ""}
        <fieldset class="expense-flow-fields restaurant-quick-fields" ${!canEdit ? "disabled" : ""}>
          ${copy.description ? `<p class="restaurant-step-intro" id="quick-expense-description">${copy.description}</p>` : ""}
          ${bodyHtml}
          ${stage === "method" ? `<button class="secondary-button" type="button" data-action="expense-mode" data-mode="single">הוצאה רגילה או במטבע אחר</button>` : ""}
          ${error ? `<p class="error" id="expense-form-error" role="alert" tabindex="-1">${escapeText(error)}</p>` : ""}
        </fieldset>
        ${actionsHtml}
      </section>
      ${navHtml}
    </section>
  `;
}

export function renderRestaurantProgressView({stage="method",stages=[]} = {}) {
  const currentIndex =
    stage === "payer"
      ? stages.length
      : stages.indexOf(stage);
  return `
    <ol class="expense-flow-progress restaurant-quick-progress" aria-label="התקדמות בחלוקת חשבון מסעדה">
      ${stages.map(
        (item, index) => `
          <li class="${index < currentIndex ? "is-complete" : index === currentIndex ? "is-current" : ""}" ${index === currentIndex ? 'aria-current="step"' : ""}>
            <button type="button" ${index <= currentIndex ? `data-action="restaurant-quick-stage" data-stage="${item}"` : "disabled"} aria-label="${index === 0 ? "בחירת חלוקה" : index === 1 ? "הזנת החשבון" : "תוצאה"}"><span>${index === 0 ? "בחירת חלוקה" : index === 1 ? "הזנת החשבון" : "תוצאה"}</span></button>
          </li>
        `
      ).join("")}
    </ol>
  `;
}

export function renderRestaurantMethodView({equalIconHtml="",itemsIconHtml=""} = {}) {
    return `
      <section class="restaurant-method-step">
        <button class="restaurant-method-option is-equal" type="button" data-action="restaurant-split-mode" data-mode="equal">
          <span class="restaurant-method-icon">${equalIconHtml}</span>
          <span>
            <strong>חלוקה שווה</strong>
            <small>סכום אחד שמתחלק בין מי שהיה בארוחה</small>
          </span>
          <span class="restaurant-method-arrow" aria-hidden="true">${iconSvg("chevron-left")}</span>
        </button>
        <button class="restaurant-method-option is-items" type="button" data-action="restaurant-split-mode" data-mode="items">
          <span class="restaurant-method-icon">${itemsIconHtml}</span>
          <span>
            <strong>לפי מנות</strong>
            <small>כל אחד משלם רק על מה שאכל או שתה</small>
          </span>
          <span class="restaurant-method-arrow" aria-hidden="true">${iconSvg("chevron-left")}</span>
        </button>
      </section>
    `;
}

export function renderRestaurantDishView({item={},index=0,participants=[],currencyLabel="",showInlineGuest=false,inlineGuestName="",eventId="",canRemove=false,guestOptionValue="",allValue="",customValue=""} = {}) {
  const customParticipantIds = item.sharedByParticipantIds ?? [];
  return `
    <div class="quick-item-row">
      <span class="quick-item-number">מנה ${index + 1}</span>
      <label class="field quick-item-amount-field">
        <span>מחיר <span class="currency-input-badge font-num" dir="ltr">${escapeText(currencyLabel)}</span></span>
        <input
          data-action="quick-item-amount"
          data-index="${index}"
          name="quickItemAmount-${index}"
          autocomplete="off"
          inputmode="decimal"
          enterkeyhint="next"
          dir="ltr"
          value="${escapeText(item.amount)}"
          placeholder="0.00"
        />
      </label>
      <label class="field quick-item-owner-field">
        <span>מי אכל או שתה?</span>
        <select data-action="quick-item-shared-by" data-index="${index}" name="quickItemSharedBy-${index}">
          ${participants
            .map(
              (participant) => `
                <option value="${participant.id}" ${item.sharedBy === participant.id ? "selected" : ""}>
                  ${escapeText(`${participant.displayName} · ${participant.connectionLabel}`)}
                </option>
              `
            )
            .join("")}
          <option value="${guestOptionValue}" ${showInlineGuest ? "selected" : ""}>＋ הוסף שם אופליין…</option>
          <option value="${allValue}" ${item.sharedBy === allValue ? "selected" : ""}>משותף לכולם</option>
          <option value="${customValue}" ${item.sharedBy === customValue ? "selected" : ""}>כמה אנשים…</option>
        </select>
      </label>

            <details class="quick-item-description-details">
              <summary>${String(item.name ?? "").trim() ? escapeText(String(item.name).trim()) : "הוסף תיאור (לא חובה)"}<span class="restaurant-inline-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span></summary>
              <label class="field quick-item-name-field">
                <span>תיאור המנה</span>
                <input
                  data-action="quick-item-name"
                  data-index="${index}"
                  name="quickItemName-${index}"
                  autocomplete="off"
                  enterkeyhint="next"
                  value="${escapeText(item.name)}"
                  placeholder="לדוגמה: פסטה או שתייה"
                />
              </label>
            </details>
      ${
        showInlineGuest
          ? `
            <div class="quick-item-inline-guest" role="group" aria-label="הוספת שם אופליין לשורה ${index + 1}">
              <input
                data-action="quick-item-new-guest-name"
                data-index="${index}"
                name="quickItemGuest-${index}"
                autocomplete="off"
                enterkeyhint="done"
                value="${escapeText(inlineGuestName ?? "")}"
                placeholder="שם אופליין"
                aria-label="שם אופליין חדש"
              />
              <button
                type="button"
                class="secondary-button"
                data-action="quick-item-add-guest"
                data-event-id="${eventId}"
                data-index="${index}"
              >הוסף ובחר</button>
            </div>
          `
          : ""
      }
      ${
        item.sharedBy === customValue
          ? `
            <div class="quick-item-custom-share" role="group" aria-label="בחר למי שייך פריט ${index + 1}">
              ${participants
                .map(
                  (participant) => `
                    <label class="${customParticipantIds.includes(participant.id) ? "is-selected" : ""}">
                      <input
                        type="checkbox"
                        data-action="quick-item-custom-participant"
                        data-index="${index}"
                        data-participant-id="${participant.id}"
                        name="quickItemParticipant-${index}"
                        value="${participant.id}"
                        ${customParticipantIds.includes(participant.id) ? "checked" : ""}
                      />
                      <span class="quick-person-option-copy">
                        <span>${escapeText(participant.displayName)}</span>
                        ${participant.connectionBadgeHtml}
                      </span>
                      <span class="app-selection-check" aria-hidden="true">${iconSvg("check")}</span>
                    </label>
                  `
                )
                .join("")}
            </div>
          `
          : ""
      }
      ${
        canRemove
          ? `
            <button
              type="button"
              class="icon-button quick-item-remove"
              data-action="quick-item-remove"
              data-index="${index}"
              aria-label="הסר מנה ${index + 1}"
              title="הסר מנה"
            ><span class="modal-control-icon" aria-hidden="true">${iconSvg("trash")}</span></button>
          `
          : ""
      }
    </div>
  `;
}
