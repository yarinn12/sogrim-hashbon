import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  chooseAndroidDevice,
  parseSmokeResult,
  percentile,
  summarize
} from "../scripts/androidQaMetrics.mjs";

test("Android QA selects the only connected device", () => {
  assert.equal(chooseAndroidDevice([{ serial: "phone-1" }]), "phone-1");
  assert.equal(chooseAndroidDevice([]), "");
});

test("Android QA requires an explicit device when several are connected", () => {
  const devices = [{ serial: "emulator-5554" }, { serial: "phone-1" }];
  assert.throws(() => chooseAndroidDevice(devices), /Multiple Android devices/);
  assert.equal(chooseAndroidDevice(devices, "phone-1"), "phone-1");
  assert.throws(() => chooseAndroidDevice(devices, "missing"), /is not connected/);
});

test("Android QA percentiles are stable for ten startup samples", () => {
  const values = [5556, 6358, 5439, 6065, 6812, 5093, 6419, 6752, 6310, 5522];
  assert.equal(percentile(values, 0.5), 6065);
  assert.equal(percentile(values, 0.75), 6419);
  assert.deepEqual(summarize(values), {
    min: 5093,
    p50: 6065,
    p75: 6419,
    p95: 6812,
    max: 6812
  });
});

test("Android QA keeps a failed smoke result instead of aborting the benchmark", () => {
  const failure = parseSmokeResult("not-json", { run: 3, fallbackMs: 45_000 });
  assert.equal(failure.ready, false);
  assert.equal(failure.nativeLaunchMs, 0);
  assert.equal(failure.interactiveMs, 45_000);
  assert.deepEqual(failure.milestones, {});
  assert.match(failure.inspectionError, /^Run 3 returned invalid JSON:/);
  assert.equal(parseSmokeResult('{"ready":true}', { run: 1, fallbackMs: 1 }).ready, true);
});

test("Android journey verifies settlement content above the fixed navigation", async () => {
  const journey = await readFile("scripts/verify-android-user-journey.mjs", "utf8");
  const inspectBody = journey.slice(
    journey.indexOf("async function inspect(page, label)"),
    journey.indexOf("function inspectionExpression()")
  );
  const overlayBody = journey.slice(
    journey.indexOf("async function openAndInspectOverlay(page, action, label)"),
    journey.indexOf("async function createAcceptanceFixture(page)")
  );

  assert.match(journey, /await scrollPageToBottom\(page\);[\s\S]*?inspect\(page, "settlement-bottom"\)/);
  assert.match(journey, /const bottomContentClearance = bottomNav && settlementTail/);
  assert.match(inspectBody, /label === "settlement-bottom"[\s\S]*?state\.bottomContentClearance >= 12/);
  assert.doesNotMatch(overlayBody, /state\.bottomContentClearance/);
  assert.match(journey, /createAcceptanceFixture\(page\)/);
  assert.match(journey, /QA acceptance event/);
  assert.match(journey, /QA Ride/);
  assert.match(journey, /removeAcceptanceFixture\(page\)/);
  assert.match(journey, /data-settings-section=\"danger\"/);
});

test("Android font-scale screenshots wait for the branded splash to finish", async () => {
  const fontScaleQa = await readFile("scripts/verify-android-font-scale.mjs", "utf8");

  assert.match(fontScaleQa, /!document\.querySelector\('#app-splash'\)/);
  assert.match(fontScaleQa, /requestAnimationFrame\(\(\) => requestAnimationFrame\(resolve\)\)/);
});

test("Android WebView QA ignores ad pages and selects the Capacitor app", async () => {
  const scripts = await Promise.all([
    readFile("scripts/verify-android-native-smoke.mjs", "utf8"),
    readFile("scripts/verify-android-user-journey.mjs", "utf8"),
    readFile("scripts/verify-android-font-scale.mjs", "utf8")
  ]);

  for (const source of scripts) {
    assert.match(source, /findInspectableAppPage\(pages\)/);
    assert.match(source, /\^https:\\\/\\\/localhost/);
    assert.match(source, /googleads\\\.g\\\.doubleclick\\\.net\|about:blank/);
    assert.doesNotMatch(source, /pages\.find\(\(item\) => item\.type === "page"\)/);
  }
});
