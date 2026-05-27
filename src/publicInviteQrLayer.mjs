import {
  getActiveCloudSpaceId,
  loadState
} from "./data/localStore.mjs";
import {
  buildEventInviteSnapshot,
  buildEventInviteUrl
} from "./domain/inviteLinks.mjs";
import { createQrSvg } from "./domain/qrCode.mjs";

const STYLE_ID = "public-invite-qr-layer-style";

let inviteQrScheduled = false;

injectInviteQrStyles();
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
    .querySelectorAll('[data-action="copy-invite"][data-event-id]')
    .forEach((button) => renderInviteQr(button));
}

function renderInviteQr(copyButton) {
  const eventId = copyButton.dataset.eventId;
  const row = copyButton.closest(".invite-link-row");
  const host = row?.parentElement;
  if (!eventId || !row || !host) return;

  const input = row.querySelector("input");
  const inviteUrl = input?.value?.trim() || smartInviteUrl(eventId);
  if (input && input.value !== inviteUrl) input.value = inviteUrl;

  const existing = [...host.querySelectorAll("[data-public-invite-qr]")]
    .find((node) => node.dataset.eventId === eventId);

  if (existing?.dataset.inviteUrl === inviteUrl) return;

  const qr = existing ?? document.createElement("section");
  qr.className = "public-invite-qr";
  qr.dataset.publicInviteQr = "true";
  qr.dataset.eventId = eventId;
  qr.dataset.inviteUrl = inviteUrl;
  qr.innerHTML = renderInviteQrContent(inviteUrl);

  if (!existing) row.after(qr);
}

function renderInviteQrContent(inviteUrl) {
  try {
    return `
      <div class="public-invite-qr-code" aria-hidden="true">
        ${createQrSvg(inviteUrl, { cellSize: 3, quietZone: 4 })}
      </div>
      <div class="public-invite-qr-copy">
        <strong>הצטרפות עם QR</strong>
        <small>פותחים מצלמה בטלפון, סורקים ונכנסים ישר לאירוע.</small>
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

function smartInviteUrl(eventId) {
  const state = loadState();
  return buildEventInviteUrl(
    window.location.href,
    eventId,
    buildEventInviteSnapshot(state, eventId),
    { spaceId: getActiveCloudSpaceId() }
  );
}

function injectInviteQrStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .public-invite-qr {
      margin-top: 14px;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 14px;
      padding: 14px;
      border: 1px solid rgba(18, 29, 27, 0.08);
      border-radius: 8px;
      background:
        linear-gradient(180deg, rgba(255,255,255,.98), rgba(248,252,250,.94)),
        radial-gradient(circle at 0 0, rgba(8,123,116,.12), transparent 34%);
      box-shadow: var(--shadow-panel, var(--shadow));
    }

    .public-invite-qr-code {
      width: 132px;
      height: 132px;
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
      .public-invite-qr {
        grid-template-columns: 1fr;
      }

      .public-invite-qr-code {
        width: min(100%, 220px);
        height: auto;
        aspect-ratio: 1;
        justify-self: center;
      }
    }
  `;
  document.head.append(style);
}
