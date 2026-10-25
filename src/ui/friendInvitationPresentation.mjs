function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

// Pure presentation. Identity and relationship come from the authenticated resolver.
export function renderFriendInvitationView({ status = "loading", relationship, profile, avatarHtml = "", backHtml = "", busy = false, actionError = "" } = {}) {
  const ready = status === "ready" && profile;
  const name = ready ? String(profile.display_name || "החבר") : "";
  const choices = {
    new: { message:`הבקשה תישלח ל${name}. החברות תושלם אחרי אישור הבקשה.`, primary:"שלח בקשה", action:"friend-invite-confirm" },
    incoming: { message:`כבר התקבלה בקשת חברות מ${name}. אישור יוסיף אתכם לרשימת החברים.`, primary:"אשר חברות", action:"friend-invite-confirm" },
    outgoing: { message:`הבקשה נשלחה ל${name}. החברות תושלם אחרי אישור הבקשה.`, primary:"לבקשות החברות", action:"friend-invite-return" },
    accepted: { message:`אתה ו${name} חברים באפליקציה.`, primary:"לרשימת החברים", action:"friend-invite-return" }
  };
  const other = {
    loading: { title:"טוענים את פרטי החבר…", message:"בודקים את הקישור ואת מצב החברות.", primary:"בודקים…", action:"friend-invite-retry" },
    "signed-out": { title:"צריך להתחבר לחשבון", message:"אחרי ההתחברות יוצגו פרטי החבר ותוכל לשלוח או לאשר בקשת חברות.", primary:"להתחברות", action:"friend-invite-sign-in" },
    error: { title:"לא הצלחנו לבדוק את הקישור", message:"אפשר לנסות שוב כשהחיבור יחזור.", primary:"נסה שוב", action:"friend-invite-retry" },
    self: { title:"זה קישור החברות שלך", message:"אפשר לשלוח אותו לחבר כדי שיוכל להוסיף אותך.", primary:"לחברים", action:"friend-invite-return" },
    unavailable: { title:"הקישור אינו זמין", message:"לא הצלחנו לפתוח את הקישור. בקש מהחבר לשלוח אותו שוב.", primary:"לחברים", action:"friend-invite-return" }
  };
  const view = (ready && choices[relationship]) || other[status] || other.unavailable;
  const canConfirm = ready && ["new", "incoming"].includes(relationship);
  return `
    <section class="screen font-hebrew friend-add-screen friend-invitation-screen" data-screen-kind="friend-invite" data-invite-state="${escapeHtml(ready ? relationship : status)}">
      <header class="top">${backHtml}<div class="brand"><p class="eyebrow">חברים</p><h1>קישור חברות</h1></div></header>
      <section class="friend-add-step">
        <section class="friend-network-panel friend-invite-card" aria-label="פרטי קישור החברות" aria-busy="${busy || status === "loading"}">
          ${ready ? `<div class="friend-invite-person">${avatarHtml}<span><h2>${escapeHtml(name)}</h2>${profile.username ? `<bdi class="friend-username" dir="ltr">${escapeHtml(profile.username)}</bdi>` : ""}</span></div>` : `<h2 class="friend-invite-state-title">${escapeHtml(view.title)}</h2>`}
          <p class="friend-invite-message" role="status">${escapeHtml(view.message)}</p>
          ${actionError ? `<p class="friend-invite-message friend-invite-error" role="alert">${escapeHtml(actionError)}</p>` : ""}
          <div class="friend-invite-actions">
            <button class="primary-button" type="button" data-action="${view.action}" ${busy || status === "loading" ? "disabled" : ""}>${busy ? "שומרים…" : view.primary}</button>
            ${canConfirm || ["loading", "error", "signed-out"].includes(status) ? '<button class="secondary-button friend-invite-secondary" type="button" data-action="friend-invite-dismiss">לא עכשיו</button>' : ""}
          </div>
        </section>
      </section>
    </section>
  `;
}
