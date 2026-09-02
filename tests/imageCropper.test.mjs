import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { cropSourceRectangle } from "../src/imageCropper.mjs";

test("square profile crops center a portrait image without exposing blank space", () => {
  const crop = cropSourceRectangle({
    imageWidth: 1200,
    imageHeight: 1800,
    viewportWidth: 320,
    viewportHeight: 320
  });

  assert.deepEqual(
    { x: crop.x, y: crop.y, width: crop.width, height: crop.height },
    { x: 0, y: 300, width: 1200, height: 1200 }
  );
});

test("focal points are clamped so dragging never exposes empty pixels", () => {
  const crop = cropSourceRectangle({
    imageWidth: 1600,
    imageHeight: 900,
    viewportWidth: 320,
    viewportHeight: 320,
    focalX: 0,
    focalY: 1
  });

  assert.equal(crop.x, 0);
  assert.equal(crop.y, 0);
  assert.equal(crop.x + crop.width <= 1600, true);
  assert.equal(crop.y + crop.height <= 900, true);
});

test("event covers use the same 16:7 crop ratio as the rendered card", () => {
  const crop = cropSourceRectangle({
    imageWidth: 1600,
    imageHeight: 1200,
    viewportWidth: 480,
    viewportHeight: 210
  });

  assert.equal(crop.width / crop.height, 16 / 7);
  assert.equal(crop.x, 0);
  assert.equal(crop.y, 250);
});

test("zoom keeps the focal point while reducing the selected source area", () => {
  const base = cropSourceRectangle({
    imageWidth: 1200,
    imageHeight: 1800,
    viewportWidth: 320,
    viewportHeight: 320,
    focalX: 0.5,
    focalY: 0.6
  });
  const zoomed = cropSourceRectangle({
    imageWidth: 1200,
    imageHeight: 1800,
    viewportWidth: 320,
    viewportHeight: 320,
    zoom: 2,
    focalX: 0.5,
    focalY: 0.6
  });

  assert.equal(zoomed.width, base.width / 2);
  assert.equal(zoomed.height, base.height / 2);
  assert.equal(zoomed.x + zoomed.width / 2, base.x + base.width / 2);
  assert.equal(zoomed.y + zoomed.height / 2, base.y + base.height / 2);
});

test("crop confirmation rejects and cleans up when the browser canvas is unavailable", async () => {
  const source = await readFile("src/imageCropper.mjs", "utf8");
  assert.match(source, /new Promise\(\(resolve, reject\) =>/);
  assert.match(source, /catch \(error\) \{[\s\S]*?finish\(null\);[\s\S]*?reject\(error\)/);
});

test("profile and event uploads request crop frames while receipt photos remain uncropped", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const coverStart = app.indexOf("async function saveEventCoverImage");
  const coverEnd = app.indexOf("function compressEventCoverImage", coverStart);
  const coverFlow = app.slice(coverStart, coverEnd);
  const receiptStart = app.indexOf('if (action === "expense-attachment-image")');
  const receiptEnd = app.indexOf('if (action === "participant-report-category")', receiptStart);
  const receiptFlow = app.slice(receiptStart, receiptEnd);
  const attachmentStart = app.indexOf("async function applyExpenseAttachmentImage");
  const attachmentEnd = app.indexOf("async function updateEventCoverImage", attachmentStart);
  const attachmentFlow = app.slice(attachmentStart, attachmentEnd);

  assert.match(coverFlow, /requestImageCrop\(file, \{[\s\S]*?shape: "rectangle"/);
  assert.match(coverFlow, /aspectRatio: 16 \/ 7/);
  assert.match(coverFlow, /outputWidth: 1280[\s\S]*?outputHeight: 560/);
  assert.doesNotMatch(receiptFlow, /requestImageCrop/);
  assert.match(receiptFlow, /applyExpenseAttachmentImage\(file\)/);
  assert.doesNotMatch(attachmentFlow, /requestImageCrop/);
  assert.match(attachmentFlow, /compressEventCoverImage\(file\)/);
});

test("expense camera is a direct native action with a capture fallback", async () => {
  const [app, bridge, config, info, packageJson] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicNativeBridgeLayer.mjs", "utf8"),
    readFile("capacitor.config.json", "utf8"),
    readFile("ios/App/App/Info.plist", "utf8"),
    readFile("package.json", "utf8")
  ]);

  assert.match(app, /data-action="capture-expense-attachment"[^>]*aria-label="פתיחת המצלמה"/);
  assert.match(app, /<span>מצלמה<\/span>/);
  assert.doesNotMatch(app, /צילום עכשיו/);
  assert.doesNotMatch(app, /data-action="capture-expense-attachment"[\s\S]{0,240}?צילום עכשיו/);
  assert.match(app, /data-image-source="camera-fallback"[^>]*accept="image\/\*"[^>]*capture="environment"/);
  assert.match(app, /globalThis\.SogrimNative\?\.camera/);
  assert.match(app, /await nativeCamera\.takePhoto\(\)/);
  assert.match(app, /await applyExpenseAttachmentImage\(file\)/);
  assert.match(bridge, /const cameraPlugin = plugins\.Camera/);
  assert.match(bridge, /camera: createNativeCameraApi\(cameraPlugin\)/);
  assert.match(bridge, /cameraPlugin\.takePhoto\(\{[\s\S]*?cameraDirection: "REAR"/);
  assert.match(bridge, /OS-PLUG-CAMR-0006/);
  assert.doesNotMatch(bridge, /cameraPlugin\.chooseFromGallery/);
  assert.match(config, /"@capacitor\/camera"/);
  assert.match(packageJson, /"@capacitor\/camera"/);
  assert.match(info, /<key>NSCameraUsageDescription<\/key>/);
  assert.match(info, /<key>NSPhotoLibraryUsageDescription<\/key>/);
  assert.match(info, /<key>NSPhotoLibraryAddUsageDescription<\/key>/);
});
