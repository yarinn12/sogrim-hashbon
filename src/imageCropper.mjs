const DEFAULT_ASPECT_RATIO = 1;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function cropSourceRectangle({
  imageWidth,
  imageHeight,
  viewportWidth,
  viewportHeight,
  zoom = 1,
  focalX = 0.5,
  focalY = 0.5
}) {
  const safeImageWidth = Math.max(1, Number(imageWidth) || 1);
  const safeImageHeight = Math.max(1, Number(imageHeight) || 1);
  const safeViewportWidth = Math.max(1, Number(viewportWidth) || 1);
  const safeViewportHeight = Math.max(1, Number(viewportHeight) || 1);
  const safeZoom = Math.max(1, Number(zoom) || 1);
  const coverScale = Math.max(
    safeViewportWidth / safeImageWidth,
    safeViewportHeight / safeImageHeight
  );
  const scale = coverScale * safeZoom;
  const width = Math.min(safeImageWidth, safeViewportWidth / scale);
  const height = Math.min(safeImageHeight, safeViewportHeight / scale);
  const normalizedFocalX = Number.isFinite(Number(focalX)) ? Number(focalX) : 0.5;
  const normalizedFocalY = Number.isFinite(Number(focalY)) ? Number(focalY) : 0.5;
  const centerX = clamp(
    clamp(normalizedFocalX, 0, 1) * safeImageWidth,
    width / 2,
    safeImageWidth - width / 2
  );
  const centerY = clamp(
    clamp(normalizedFocalY, 0, 1) * safeImageHeight,
    height / 2,
    safeImageHeight - height / 2
  );

  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
    scale,
    focalX: centerX / safeImageWidth,
    focalY: centerY / safeImageHeight
  };
}

function loadImageFromObjectUrl(objectUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image could not be loaded"));
    image.src = objectUrl;
  });
}

function cropperMarkup({ shape, title, description }) {
  const cropLabel = shape === "circle" ? "העיגול" : "המלבן";
  return `
    <form class="image-crop-panel" method="dialog" dir="rtl">
      <header class="image-crop-header">
        <div>
          <h2 class="image-crop-title">${title}</h2>
          <p class="image-crop-description">${description}</p>
        </div>
        <button class="image-crop-close" type="button" data-crop-action="cancel" aria-label="סגירת בחירת התמונה">×</button>
      </header>
      <div class="image-crop-stage-shell">
        <div class="image-crop-stage is-${shape}" data-crop-stage tabindex="0" role="application" aria-label="הזזת אזור התמונה הרצוי">
          <img class="image-crop-preview" data-crop-preview alt="" draggable="false" />
          <span class="image-crop-guide" aria-hidden="true"></span>
        </div>
      </div>
      <p class="image-crop-hint">מה שנמצא בתוך ${cropLabel} הוא מה שיופיע</p>
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

function cropperStyles() {
  return `
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
  `;
}

async function openCropDialog(image, objectUrl, options) {
  const shape = options.shape === "rectangle" ? "rectangle" : "circle";
  const aspectRatio = Math.max(0.2, Number(options.aspectRatio) || DEFAULT_ASPECT_RATIO);
  const outputWidth = Math.max(1, Math.round(Number(options.outputWidth) || 480));
  const outputHeight = Math.max(1, Math.round(Number(options.outputHeight) || outputWidth / aspectRatio));
  const maxZoom = Math.max(1, Number(options.maxZoom) || 3);
  const dialog = document.createElement("dialog");
  dialog.className = "image-crop-dialog";
  dialog.setAttribute("aria-labelledby", "image-crop-dialog-title");
  dialog.innerHTML = `<style>${cropperStyles()}</style>${cropperMarkup({
    shape,
    title: options.title || "בחר את האזור שיופיע",
    description: options.description || "הזז והגדל את התמונה עד שהאזור הרצוי נמצא במסגרת."
  })}`;
  dialog.querySelector(".image-crop-title")?.setAttribute("id", "image-crop-dialog-title");
  dialog.style.setProperty("--image-crop-aspect", String(aspectRatio));
  document.body.append(dialog);

  const stage = dialog.querySelector("[data-crop-stage]");
  const preview = dialog.querySelector("[data-crop-preview]");
  const zoomInput = dialog.querySelector("[data-crop-zoom]");
  preview.src = objectUrl;
  zoomInput.max = String(maxZoom);

  const state = { zoom: 1, focalX: 0.5, focalY: 0.5, pointerId: null, x: 0, y: 0 };
  let settled = false;
  let resizeObserver;

  function currentCrop() {
    const bounds = stage.getBoundingClientRect();
    return cropSourceRectangle({
      imageWidth: image.naturalWidth,
      imageHeight: image.naturalHeight,
      viewportWidth: bounds.width || 1,
      viewportHeight: bounds.height || 1,
      zoom: state.zoom,
      focalX: state.focalX,
      focalY: state.focalY
    });
  }

  function renderPreview() {
    const bounds = stage.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const crop = currentCrop();
    state.focalX = crop.focalX;
    state.focalY = crop.focalY;
    preview.style.width = `${image.naturalWidth * crop.scale}px`;
    preview.style.height = `${image.naturalHeight * crop.scale}px`;
    preview.style.left = `${-crop.x * crop.scale}px`;
    preview.style.top = `${-crop.y * crop.scale}px`;
  }

  function repositionByPixels(deltaX, deltaY) {
    const crop = currentCrop();
    const renderedWidth = image.naturalWidth * crop.scale;
    const renderedHeight = image.naturalHeight * crop.scale;
    state.focalX -= deltaX / renderedWidth;
    state.focalY -= deltaY / renderedHeight;
    renderPreview();
  }

  function cleanup() {
    resizeObserver?.disconnect();
    window.removeEventListener("resize", renderPreview);
    dialog.remove();
  }

  function finish(value) {
    if (settled) return;
    settled = true;
    if (dialog.open) dialog.close();
    cleanup();
    return value;
  }

  function renderOutput() {
    const crop = currentCrop();
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Image canvas is unavailable");
    context.drawImage(
      image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      outputWidth,
      outputHeight
    );
    return canvas;
  }

  const result = new Promise((resolve, reject) => {
    function resolveAndFinish(value) {
      const resultValue = finish(value);
      if (resultValue !== undefined || value === null) resolve(value);
    }

    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      resolveAndFinish(null);
    });
    dialog.addEventListener("pointerdown", (event) => {
      if (event.target === dialog) resolveAndFinish(null);
    });
    dialog.addEventListener("click", (event) => {
      const action = event.target.closest("[data-crop-action]")?.dataset.cropAction;
      if (action === "cancel") resolveAndFinish(null);
      if (action === "reset") {
        state.zoom = 1;
        state.focalX = 0.5;
        state.focalY = 0.5;
        zoomInput.value = "1";
        renderPreview();
      }
      if (action === "confirm") {
        try {
          resolveAndFinish(renderOutput());
        } catch (error) {
          finish(null);
          reject(error);
        }
      }
    });
    zoomInput.addEventListener("input", () => {
      state.zoom = clamp(Number(zoomInput.value) || 1, 1, maxZoom);
      renderPreview();
    });
    stage.addEventListener("pointerdown", (event) => {
      state.pointerId = event.pointerId;
      state.x = event.clientX;
      state.y = event.clientY;
      stage.classList.add("is-dragging");
      stage.setPointerCapture?.(event.pointerId);
    });
    stage.addEventListener("pointermove", (event) => {
      if (state.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - state.x;
      const deltaY = event.clientY - state.y;
      state.x = event.clientX;
      state.y = event.clientY;
      repositionByPixels(deltaX, deltaY);
    });
    const releasePointer = (event) => {
      if (state.pointerId !== event.pointerId) return;
      state.pointerId = null;
      stage.classList.remove("is-dragging");
    };
    stage.addEventListener("pointerup", releasePointer);
    stage.addEventListener("pointercancel", releasePointer);
    stage.addEventListener("keydown", (event) => {
      const step = event.shiftKey ? 20 : 6;
      const movement = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step]
      }[event.key];
      if (!movement) return;
      event.preventDefault();
      repositionByPixels(...movement);
    });
  });

  if (typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(renderPreview);
    resizeObserver.observe(stage);
  }
  window.addEventListener("resize", renderPreview);
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  requestAnimationFrame(() => {
    renderPreview();
    stage.focus({ preventScroll: true });
  });
  return result;
}

export async function requestImageCrop(file, options = {}) {
  if (!(file instanceof Blob)) throw new TypeError("A valid image file is required");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageFromObjectUrl(objectUrl);
    return await openCropDialog(image, objectUrl, options);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
