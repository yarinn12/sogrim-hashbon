import { compactQrInviteUrl, createQrSvg } from "./domain/qrCode.mjs";
import { parseInviteEventId, parseInviteToken } from "./domain/inviteLinks.mjs";

const STYLE_ID = "public-invite-qr-layer-style";

let inviteQrScheduled = false;
injectInviteQrStyles();
document.addEventListener(
  "settle-friends:entitlements-changed",
  scheduleInviteQrEnhancement
);
new MutationObserver(scheduleInviteQrEnhancement).observe(document.body, {
  childList: true,
  subtree: true
});
scheduleInviteQrEnhancement();

function scheduleInviteQrEnhancement() {
  if (inviteQrScheduled) return;
  inviteQrScheduled = true;

  requestAnimationFrame(() => {
    inviteQrScheduled = false;
    enhanceInviteQrCodes();
  });
}

function enhanceInviteQrCodes() {
  document
    .querySelectorAll(
      '[data-action="copy-invite"][data-open-link="true"][data-event-id]'
    )
    .forEach((button) => renderInviteQr(button));
}

function renderInviteQr(copyButton) {
  const eventId = copyButton.dataset.eventId;
  const row = copyButton.closest(".invite-link-row");
  const host = row?.parentElement;
  if (!eventId || !row || !host) return;

  const input = row.querySelector("input");
  // The QR must use the exact server-issued link shown by the share screen.
  // Building a fallback before the open token arrives can create a scannable
  // but unusable event-only URL for a new device.
  const inviteUrl = input?.value?.trim();
  const exactEventId = parseInviteEventId(inviteUrl);
  const exactInviteToken = parseInviteToken(inviteUrl);
  if (
    !inviteUrl ||
    copyButton.disabled ||
    exactEventId !== eventId ||
    !exactInviteToken
  ) {
    host.querySelector(`[data-public-invite-qr][data-event-id="${CSS.escape(eventId)}"]`)?.remove();
    return;
  }
  const qrUrl = compactQrInviteUrl(inviteUrl);
  if (input && input.value !== inviteUrl) input.value = inviteUrl;

  const existing = [...host.querySelectorAll("[data-public-invite-qr]")]
    .find((node) => node.dataset.eventId === eventId);

  if (existing?.dataset.inviteUrl === qrUrl) return;

  const qr = existing ?? document.createElement("details");
  qr.className = "public-invite-qr";
  qr.dataset.publicInviteQr = "true";
  qr.dataset.eventId = eventId;
  qr.dataset.inviteUrl = qrUrl;
  qr.innerHTML = renderInviteQrContent(qrUrl);

  if (!existing) row.after(qr);
}

function renderInviteQrContent(inviteUrl) {
  try {
    return `
      <summary class="public-invite-qr-summary">
        <span class="public-invite-qr-mark" aria-hidden="true">QR</span>
        <span>
          <strong>הצג QR להצטרפות</strong>
          <small>לסריקה מטלפון אחר</small>
        </span>
        <span class="public-invite-qr-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div class="public-invite-qr-body">
        <div class="public-invite-qr-code" aria-hidden="true">
          ${createQrSvg(inviteUrl, { cellSize: 3, quietZone: 4 })}
        </div>
        <div class="public-invite-qr-copy">
          <strong>סורקים ומצטרפים</strong>
          <small>פותחים מצלמה בטלפון ונכנסים ישר לאירוע.</small>
        </div>
      </div>
    `;
  } catch {
    return `
      <div class="public-invite-qr-fallback">
        <strong>הקישור ארוך מדי ל-QR</strong>
        <small>אפשר עדיין לשלוח אותו בוואטסאפ או להעתיק מהשורה למעלה.</small>
      </div>
    `;
  }
}

function injectInviteQrStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .public-invite-qr {
      margin-top: 14px;
      border: 1px solid rgba(18, 29, 27, 0.08);
      border-radius: 10px;
      background: #fff;
      box-shadow: 0 1px 3px rgba(13, 39, 35, 0.05);
      overflow: hidden;
    }

    .public-invite-qr-summary {
      min-height: 64px;
      display: grid;
      grid-template-columns: 40px minmax(0, 1fr) 18px;
      align-items: center;
      gap: 11px;
      padding: 11px 13px;
      color: var(--text);
      cursor: pointer;
      list-style: none;
      transition: background-color 160ms ease, transform 160ms ease;
    }

    .public-invite-qr-summary::-webkit-details-marker {
      display: none;
    }

    .public-invite-qr-summary > span:nth-child(2) {
      min-width: 0;
      display: grid;
      gap: 2px;
    }

    .public-invite-qr-summary strong {
      color: var(--text);
      font-size: .95rem;
      font-weight: 700;
    }

    .public-invite-qr-summary small {
      color: var(--muted);
      font-size: .75rem;
      font-weight: 500;
    }

    .public-invite-qr-mark {
      width: 40px;
      height: 40px;
      display: grid;
      place-items: center;
      border: 1px solid rgba(11, 74, 56, 0.12);
      border-radius: 8px;
      color: var(--primary, #0b4a38);
      background: rgba(11, 74, 56, 0.035);
      font-family: var(--font-num, sans-serif);
      font-size: .72rem;
      font-weight: 800;
      letter-spacing: 0;
    }

    .public-invite-qr-chevron {
      color: var(--muted);
      font-size: 1.15rem;
      line-height: 1;
      transition: transform 180ms cubic-bezier(.2, 0, 0, 1);
    }

    .public-invite-qr[open] .public-invite-qr-chevron {
      transform: rotate(180deg);
    }

    .public-invite-qr-summary:active {
      transform: scale(.96);
    }

    .public-invite-qr-body {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 14px;
      padding: 14px;
      border-top: 1px solid rgba(18, 29, 27, 0.08);
      background: #fbfcfc;
    }

    .public-invite-qr-code {
      width: 184px;
      height: 184px;
      display: grid;
      place-items: center;
      padding: 8px;
      border-radius: 8px;
      background: #fff;
      border: 1px solid rgba(18, 29, 27, 0.08);
    }

    .public-invite-qr-code svg {
      width: 100%;
      height: 100%;
      display: block;
      fill: #111816;
    }

    .public-invite-qr-copy,
    .public-invite-qr-fallback {
      display: grid;
      gap: 5px;
      min-width: 0;
    }

    .public-invite-qr-copy strong,
    .public-invite-qr-fallback strong {
      font-size: 1rem;
      color: var(--text);
    }

    .public-invite-qr-copy small,
    .public-invite-qr-fallback small {
      color: var(--muted);
      font-weight: 700;
      line-height: 1.45;
    }

    .public-invite-qr-fallback {
      grid-column: 1 / -1;
      padding: 12px;
      border-radius: 8px;
      background: rgba(255, 244, 230, 0.9);
      border: 1px solid rgba(238, 111, 87, 0.22);
    }

    @media (max-width: 520px) {
      .public-invite-qr-body {
        grid-template-columns: 1fr;
      }

      .public-invite-qr-code {
        width: min(100%, 220px);
        height: auto;
        aspect-ratio: 1;
        justify-self: center;
      }
    }

    @media (hover: hover) {
      .public-invite-qr-summary:hover {
        background: rgba(11, 74, 56, 0.025);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .public-invite-qr-summary,
      .public-invite-qr-chevron {
        transition-duration: 1ms;
      }
    }
  `;
  document.head.append(style);
}
