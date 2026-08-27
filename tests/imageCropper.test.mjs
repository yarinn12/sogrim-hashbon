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

test("profile and event uploads request crop frames while receipt photos remain uncropped", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const coverStart = app.indexOf("async function saveEventCoverImage");
  const coverEnd = app.indexOf("function compressEventCoverImage", coverStart);
  const coverFlow = app.slice(coverStart, coverEnd);
  const receiptStart = app.indexOf('if (action === "expense-attachment-image")');
  const receiptEnd = app.indexOf('if (action === "participant-report-category")', receiptStart);
  const receiptFlow = app.slice(receiptStart, receiptEnd);

  assert.match(coverFlow, /requestImageCrop\(file, \{[\s\S]*?shape: "rectangle"/);
  assert.match(coverFlow, /aspectRatio: 16 \/ 7/);
  assert.match(coverFlow, /outputWidth: 1280[\s\S]*?outputHeight: 560/);
  assert.doesNotMatch(receiptFlow, /requestImageCrop/);
  assert.match(receiptFlow, /compressEventCoverImage\(file\)/);
});
