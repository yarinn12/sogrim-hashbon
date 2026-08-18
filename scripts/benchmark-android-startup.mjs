import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseSmokeResult, percentile, summarize } from "./androidQaMetrics.mjs";

const root = process.cwd();
const smokeScript = join(root, "scripts", "verify-android-native-smoke.mjs");
const packageName = process.env.ANDROID_QA_PACKAGE || "com.sogrimhashbon.app.benchmark";
const runCount = positiveInteger(process.env.ANDROID_BENCHMARK_RUNS, 10);
const targetMs = positiveInteger(process.env.ANDROID_INTERACTIVE_TARGET_MS, 3_000);
const performanceGateMs = positiveInteger(process.env.ANDROID_BENCHMARK_MAX_P75_MS, 6_500);
const interactiveTimeoutMs = positiveInteger(process.env.ANDROID_INTERACTIVE_TIMEOUT_MS, 45_000);
const reportPath = process.env.ANDROID_BENCHMARK_REPORT ||
  join(root, "artifacts", "android-qa", "startup-benchmark.json");
const expectedVersionCode = readExpectedVersionCode();
const samples = [];

for (let index = 0; index < runCount; index += 1) {
  process.stderr.write(`Android startup benchmark ${index + 1}/${runCount}\n`);
  const result = spawnSync(process.execPath, [smokeScript], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env,
      ANDROID_QA_PACKAGE: packageName,
      ANDROID_INTERACTIVE_TARGET_MS: String(targetMs),
      ANDROID_INTERACTIVE_TIMEOUT_MS: String(interactiveTimeoutMs)
    }
  });

  const sample = parseSmokeResult(result.stdout, {
    run: index + 1,
    fallbackMs: interactiveTimeoutMs
  });
  if (result.status !== 0 || !sample.ready) {
    process.stderr.write(`Android startup benchmark run ${index + 1} failed readiness checks\n`);
    process.stderr.write(result.stderr || "");
  }
  samples.push(sample);
  if (
    expectedVersionCode > 0 &&
    Number(sample.appInfo?.versionCode) !== expectedVersionCode
  ) {
    sample.ready = false;
    sample.inspectionError =
      `Installed benchmark build ${sample.appInfo?.versionCode ?? "unknown"} ` +
      `does not match project build ${expectedVersionCode}`;
    process.stderr.write(`${sample.inspectionError}\n`);
    break;
  }
}

const successfulSamples = samples.filter((sample) => sample.ready);
const interactiveP75 = percentile(successfulSamples.map((sample) => sample.interactiveMs), 0.75);
const report = {
  ready: samples.length === runCount && samples.every((sample) => sample.ready),
  generatedAt: new Date().toISOString(),
  device: samples[0]?.device || null,
  deviceInfo: samples[0]?.deviceInfo || null,
  appInfo: samples[0]?.appInfo || null,
  packageName,
  runCount,
  executedRuns: samples.length,
  expectedVersionCode,
  successfulRuns: successfulSamples.length,
  failedRuns: samples.length - successfulSamples.length,
  targetMs,
  performanceGateMs,
  interactiveTimeoutMs,
  interactive: summarize(successfulSamples.map((sample) => sample.interactiveMs)),
  nativeLaunch: summarize(successfulSamples.map((sample) => sample.nativeLaunchMs)),
  milestones: {
    firstWebView: summarizeMetric(successfulSamples, "firstWebViewMs"),
    authReady: summarizeMetric(successfulSamples, "authReadyMs"),
    appRendered: summarizeMetric(successfulSamples, "appRenderedMs"),
    splashRemoved: summarizeMetric(successfulSamples, "splashRemovedMs")
  },
  webMilestones: {
    appModuleReady: summarizeWebMark(successfulSamples, "app-module-ready"),
    authReady: summarizeWebMark(successfulSamples, "auth-ready"),
    firstScreenRendered: summarizeWebMark(successfulSamples, "first-screen-rendered"),
    splashDismissed: summarizeWebMark(successfulSamples, "splash-dismissed")
  },
  stages: {
    nativeToFirstWebView: summarizeStages(successfulSamples, null, "firstWebViewMs"),
    firstWebViewToAuthReady: summarizeStages(successfulSamples, "firstWebViewMs", "authReadyMs"),
    authReadyToAppRendered: summarizeStages(successfulSamples, "authReadyMs", "appRenderedMs"),
    appRenderedToSplashRemoved: summarizeStages(successfulSamples, "appRenderedMs", "splashRemovedMs")
  },
  resources: summarizeResources(successfulSamples),
  meetsProductTargetAtP75: successfulSamples.length === runCount && interactiveP75 <= targetMs,
  meetsPerformanceGateAtP75: successfulSamples.length === runCount && interactiveP75 <= performanceGateMs,
  samples: samples.map((sample, index) => ({
    run: index + 1,
    ready: sample.ready,
    nativeLaunchMs: sample.nativeLaunchMs,
    interactiveMs: sample.interactiveMs,
    milestones: sample.milestones,
    navigation: sample.webPerformance?.navigation || null,
    inspectionError: sample.inspectionError || null
  }))
};

const measuredDevices = new Set(samples.map((sample) => sample.device));
if (measuredDevices.size !== 1) {
  report.ready = false;
  report.error = `Benchmark samples came from multiple devices: ${[...measuredDevices].join(", ")}`;
}

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stderr.write(`Android startup benchmark report: ${reportPath}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.ready || !report.meetsPerformanceGateAtP75) process.exitCode = 1;

function summarizeMetric(values, key) {
  return summarize(values.map((value) => value.milestones?.[key]).filter(Number.isFinite));
}

function summarizeWebMark(values, key) {
  return summarize(
    values
      .map((value) => value.webPerformance?.startupMarks?.[key])
      .filter(Number.isFinite)
  );
}

function summarizeStages(values, startKey, endKey) {
  const durations = values.map((value) => {
    const start = startKey ? value.milestones?.[startKey] : 0;
    const end = value.milestones?.[endKey];
    return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : null;
  }).filter(Number.isFinite);
  return summarize(durations);
}

function summarizeResources(values) {
  const names = new Set(values.flatMap((value) =>
    value.webPerformance?.resources?.map((resource) => resource.name) || []
  ));
  return [...names].map((name) => {
    const entries = values.flatMap((value) =>
      value.webPerformance?.resources?.filter((resource) => resource.name === name) || []
    );
    return {
      name,
      duration: summarize(entries.map((entry) => entry.durationMs)),
      decodedBytes: Math.max(0, ...entries.map((entry) => entry.decodedBytes || 0))
    };
  });
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readExpectedVersionCode() {
  try {
    const gradle = readFileSync(
      join(root, "android", "app", "build.gradle"),
      "utf8"
    );
    return positiveInteger(gradle.match(/versionCode\s+(\d+)/)?.[1], 0);
  } catch {
    return 0;
  }
}
