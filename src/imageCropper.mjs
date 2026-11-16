import {renderImageCropView, imageCropPresentationStyles} from "./ui/imageCropPresentation.mjs";

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

const cropperMarkup = renderImageCropView;
const cropperStyles = () => imageCropPresentationStyles;

async function openCropDialog(image, objectUrl, options) {
  const shape = options.shape === "rectangle" ? "rectangle" : "circle";
  const aspectRatio = Math.max(0.2, Number(options.aspectRatio) || DEFAULT_ASPECT_RATIO);
  const outputWidth = Math.max(1, Math.round(Number(options.outputWidth) || 480));
  const outputHeight = Math.max(1, Math.round(Number(options.outputHeight) || outputWidth / aspectRatio));
  const maxZoom = Math.max(1, Number(options.maxZoom) || 3);
  const dialog = document.createElement("dialog");
  dialog.className = "image-crop-dialog";
  dialog.dataset.cropShape = shape;
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
