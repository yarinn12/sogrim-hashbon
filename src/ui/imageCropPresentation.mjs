import {iconSvg} from "../uiIcons.mjs";
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

// Presentation only. The cropper adapter owns pointer state, canvas and cleanup.
export function renderImageCropView({ shape, title, description }) {
  return `
    <form class="image-crop-panel" method="dialog" dir="rtl">
      <header class="image-crop-header">
        <div>
          <h2 class="image-crop-title">${escapeHtml(title)}</h2>
          <p class="image-crop-description">${escapeHtml(description)}</p>
        </div>
        <button class="image-crop-close" type="button" data-crop-action="cancel" aria-label="חזרה לבחירת תמונה">${iconSvg("chevron-left")}</button>
      </header>
      <div class="image-crop-stage-shell">
        <div class="image-crop-stage is-${shape}" data-crop-stage tabindex="0" role="application" aria-label="הזזת אזור התמונה הרצוי">
          <img class="image-crop-preview" data-crop-preview alt="" draggable="false" />
          <span class="image-crop-guide" aria-hidden="true"></span>
        </div>
      </div>
      <label class="image-crop-zoom">
        <span>הגדלה</span>
        <input data-crop-zoom type="range" min="1" max="3" step="0.01" value="1" aria-label="הגדלת התמונה" />
      </label>
      <footer class="image-crop-actions">
        <button class="image-crop-primary" type="button" data-crop-action="confirm">שמור תמונה</button>
        <button class="image-crop-secondary" type="button" data-crop-action="reset">איפוס</button>
        <button class="image-crop-secondary" type="button" data-crop-action="cancel">ביטול</button>
      </footer>
    </form>
  `;
}


export const imageCropPresentationStyles = `
    .image-crop-dialog {
      width: min(92vw, 520px);
      max-width: none;
      max-height: calc(100dvh - max(24px, env(safe-area-inset-top)) - max(24px, env(safe-area-inset-bottom)));
      margin: auto;
      padding: 0;
      overflow: auto;
      border: 0;
      border-radius: 24px;
      color: #10243d;
      background: #ffffff;
      box-shadow: 0 24px 70px rgb(8 34 29 / 0.28);
    }
    .image-crop-dialog::backdrop { background: rgb(5 28 24 / 0.62); backdrop-filter: blur(3px); }
    .image-crop-panel { display: grid; gap: 16px; padding: 20px; }
    .image-crop-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
    .image-crop-title { margin: 0; color: #073f35; font: 800 1.25rem/1.3 inherit; }
    .image-crop-description { margin: 5px 0 0; color: #5c6d7d; font: 500 0.92rem/1.5 inherit; }
    .image-crop-close {
      flex: 0 0 44px;
      width: 44px;
      height: 44px;
      border: 1px solid rgb(7 63 53 / 0.1);
      border-radius: 14px;
      color: #123c36;
      background: #f1f7f6;
      font: 400 1.65rem/1 inherit;
      cursor: pointer;
      transition: background-color 140ms ease, transform 100ms ease;
    }
    .image-crop-close:active,
    .image-crop-actions button:active { transform: scale(0.96); }
    .image-crop-stage-shell {
      display: grid;
      place-items: center;
      min-width: 0;
      padding: 12px;
      border-radius: 20px;
      background: #edf4f3;
    }
    .image-crop-stage {
      position: relative;
      width: 100%;
      max-width: 440px;
      overflow: hidden;
      border-radius: 14px;
      outline: 1px solid rgb(255 255 255 / 0.72);
      background: #17332f;
      cursor: grab;
      touch-action: none;
      user-select: none;
    }
    .image-crop-stage.is-circle { width: min(100%, 320px); aspect-ratio: 1; border-radius: 50%; }
    .image-crop-stage.is-rectangle { aspect-ratio: var(--image-crop-aspect, 2.2857); }
    .image-crop-stage:active { cursor: grabbing; }
    .image-crop-stage:focus-visible { outline: 3px solid #56b5a5; outline-offset: 3px; }
    .image-crop-preview {
      position: absolute;
      max-width: none;
      pointer-events: none;
      -webkit-user-drag: none;
      user-select: none;
    }
    .image-crop-stage.is-dragging .image-crop-preview { will-change: left, top; }
    .image-crop-guide {
      position: absolute;
      inset: 0;
      pointer-events: none;
      border: 2px solid rgb(255 255 255 / 0.88);
      border-radius: inherit;
      box-shadow: inset 0 0 0 1px rgb(6 47 40 / 0.18);
    }
    .image-crop-hint { margin: -5px 0 0; color: #61707d; text-align: center; font: 500 0.82rem/1.4 inherit; }
    .image-crop-zoom {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 14px;
      min-height: 44px;
      color: #173c36;
      font: 700 0.9rem/1 inherit;
    }
    .image-crop-zoom input { width: 100%; min-height: 44px; margin: 0; accent-color: #075d4e; direction: ltr; cursor: pointer; }
    .image-crop-actions { display: grid; grid-template-columns: minmax(0, 1.7fr) 1fr 1fr; gap: 9px; }
    .image-crop-actions button {
      min-height: 46px;
      border-radius: 14px;
      padding: 0 14px;
      font: 800 0.92rem/1 inherit;
      cursor: pointer;
      transition: background-color 140ms ease, border-color 140ms ease, transform 100ms ease;
    }
    .image-crop-primary { border: 1px solid #075d4e; color: #fff; background: #075d4e; }
    .image-crop-secondary { border: 1px solid #d4e0de; color: #173c36; background: #fff; }
    @media (max-width: 430px) {
      .image-crop-dialog { width: calc(100vw - 20px); border-radius: 22px; }
      .image-crop-panel { gap: 13px; padding: 16px; }
      .image-crop-actions { grid-template-columns: 1fr 1fr; }
      .image-crop-primary { grid-column: 1 / -1; }
    }
    @media (prefers-reduced-motion: reduce) {
      .image-crop-close, .image-crop-actions button { transition: none; }
    }

.image-crop-dialog {
 width:min(calc(100vw - 24px),480px)!important;max-height:calc(100dvh - max(16px, var(--image-crop-safe-top, env(safe-area-inset-top))) - max(16px, var(--image-crop-safe-bottom, env(safe-area-inset-bottom))))!important;border-radius:20px!important;
 color:#162e29!important;background:#fff!important;overflow:auto!important;overscroll-behavior:contain!important;
}
.image-crop-dialog .image-crop-panel{padding:16px!important;gap:16px!important;min-width:0!important}
.image-crop-dialog .image-crop-header{display:grid!important;grid-template-columns:minmax(0,1fr) 44px!important;gap:12px!important;align-items:start!important}
.image-crop-dialog .image-crop-title{font-weight:700!important;font-family:inherit!important;font-size:1.125rem!important;line-height:1.4!important;margin:0!important;overflow-wrap:anywhere!important}
.image-crop-dialog .image-crop-description{font-size:.9375rem!important;line-height:1.5!important;color:#52645d!important;margin:8px 0 0!important}
.image-crop-dialog .image-crop-close{width:44px!important;height:44px!important;min-height:44px!important;border:1px solid #d8e2dc!important;border-radius:12px!important;background:white!important;color:#244c40!important;box-shadow:none!important;display:grid!important;place-items:center!important;padding:10px!important}
.image-crop-dialog .image-crop-close svg{width:22px!important;height:22px!important}
.image-crop-dialog .image-crop-stage-shell{min-width:0!important}
.image-crop-dialog .image-crop-stage{background:#edf3f0!important;touch-action:none!important}
.image-crop-dialog .image-crop-hint{display:none!important}
.image-crop-dialog .image-crop-zoom{display:grid!important;grid-template-columns:auto minmax(0,1fr)!important;gap:16px!important;align-items:center!important;font-size:.9375rem!important;line-height:1.4!important;padding:0!important;min-height:44px!important}
.image-crop-dialog .image-crop-zoom input{min-width:0!important;width:100%!important;height:44px!important;accent-color:#174e40!important}
.image-crop-dialog .image-crop-actions{gap:8px!important}
.image-crop-dialog .image-crop-actions button{font-size:1rem!important;line-height:1.4!important;min-height:48px!important;height:auto!important;padding:12px 16px!important;white-space:normal!important;overflow-wrap:anywhere!important;border-radius:12px!important;box-shadow:none!important}
.image-crop-dialog .image-crop-primary{background:#174e40!important;color:white!important}
.image-crop-dialog .image-crop-secondary{background:white!important;color:#174e40!important;border-color:#d8e2dc!important}
`;
