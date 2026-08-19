import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { chooseAndroidDevice } from "./androidQaMetrics.mjs";

const root = process.cwd();
const packageName = process.env.ANDROID_QA_PACKAGE || "com.sogrimhashbon.app.debug";
const releasePackageName = "com.sogrimhashbon.app";
const requireReleaseAppLinks =
  packageName === releasePackageName ||
  process.env.ANDROID_QA_REQUIRE_APP_LINKS === "1";
const activityName = "com.sogrimhashbon.app.MainActivity";
const targetInteractiveMs = Number(process.env.ANDROID_INTERACTIVE_TARGET_MS) || 3_000;
const maximumInteractiveMs = Number(process.env.ANDROID_INTERACTIVE_TIMEOUT_MS) || 25_000;
const adb = findAdb();
const checks = [];
const warnings = [];

if (!adb) fail("Android adb executable was not found");

const connectedDevices = listDevices();
const device = selectDevice(connectedDevices);
if (!device) fail("No authorized Android device or emulator is connected");
const deviceInfo = readDeviceInfo(device);

check("QA package is installed", packageInstalled(packageName));
if (!checks.at(-1).ok) fail(`Install ${packageName} before running the native smoke test`);
const appInfo = readPackageInfo(packageName);

adbRun(["-s", device, "logcat", "-c"]);
adbRun(["-s", device, "shell", "am", "force-stop", packageName]);

const startedAt = Date.now();
const launch = adbRun([
  "-s",
  device,
  "shell",
  "am",
  "start",
  "-W",
  "-n",
  `${packageName}/${activityName}`
]);
const nativeLaunchMs = Number(launch.match(/TotalTime:\s*(\d+)/)?.[1] || 0);
check("Android activity cold launch succeeds", /Status:\s*ok/.test(launch));
check("Android reports a valid native launch duration", nativeLaunchMs > 0);

const interactive = await waitForInteractive(startedAt);
check("WebView reaches an interactive account screen", interactive.ready);
if (interactive.ready) {
  check("Native account screen has no horizontal overflow", !interactive.state.horizontalOverflow);
  check("Native account screen has no unnamed controls", interactive.state.unnamedControlCount === 0);
  check("Native account buttons and fields meet 44px targets", interactive.state.smallControlCount === 0);
  check("Native account screen renders a visible primary surface", interactive.state.primarySurfaceVisible);
  check("Native account screen renders an actionable control", interactive.state.actionableControlCount > 0);
}
if (!interactive.meetsTarget) {
  warnings.push({
    name: "Cold start exceeds the product target",
    actualMs: interactive.elapsedMs,
    targetMs: targetInteractiveMs
  });
}

adbRun(["-s", device, "shell", "input", "keyevent", "3"]);
await sleep(500);
const resume = adbRun([
  "-s",
  device,
  "shell",
  "am",
  "start",
  "-W",
  "-n",
  `${packageName}/${activityName}`
]);
await sleep(500);
const focus = adbRun(["-s", device, "shell", "dumpsys", "window"]);
check("Background and resume return to the QA app", new RegExp(`mCurrentFocus=.*${escapeRegExp(packageName)}`).test(focus));
check("Warm resume does not create a second activity", /current task has been brought to the front|LaunchState:\s*(HOT|UNKNOWN)/.test(resume));

const crashLog = adbRun(["-s", device, "logcat", "-d", "-v", "brief", "AndroidRuntime:E", "*:S"]);
check("No Android fatal exception is logged", !/FATAL EXCEPTION|Process:\s*com\.sogrimhashbon\.app/.test(crashLog));

let releaseAppLinks = "not-installed";
if (packageInstalled(releasePackageName)) {
  const appLinks = adbRun(["-s", device, "shell", "pm", "get-app-links", releasePackageName]);
  releaseAppLinks = /sogrim-hesbon-app\.vercel\.app:\s*verified/.test(appLinks) ? "verified" : "unverified";
  if (requireReleaseAppLinks) {
    check("Installed release package has verified App Links", releaseAppLinks === "verified");
  } else if (releaseAppLinks !== "verified") {
    warnings.push({
      name: "Release App Links are not verified",
      status: releaseAppLinks
    });
  }
}

const ready = checks.every((item) => item.ok);
console.log(JSON.stringify({
  ready,
  device,
  deviceInfo,
  appInfo,
  packageName,
  nativeLaunchMs,
  interactiveMs: interactive.elapsedMs,
  interactiveTargetMs: targetInteractiveMs,
  milestones: interactive.milestones,
  nativeUi: interactive.state ? {
    horizontalOverflow: interactive.state.horizontalOverflow,
    unnamedControls: interactive.state.unnamedControls,
    smallControls: interactive.state.smallControls,
    primarySurfaceVisible: interactive.state.primarySurfaceVisible,
    actionableControlCount: interactive.state.actionableControlCount
  } : null,
  webPerformance: interactive.state ? {
    navigation: interactive.state.navigationTiming,
    resources: interactive.state.resourceTimings,
    startupMarks: interactive.state.startupMarks
  } : null,
  inspectionError: interactive.inspectionError || null,
  releaseAppLinks,
  releaseAppLinksRequired: requireReleaseAppLinks,
  checks,
  warnings
}, null, 2));

if (!ready) process.exitCode = 1;

async function waitForInteractive(startedAt) {
  const deadline = startedAt + maximumInteractiveMs;
  let lastState = null;
  let lastInspectionError = "";
  const milestones = {};

  while (Date.now() < deadline) {
    const socket = webViewSocket();
    if (socket) {
      try {
        const state = await readWebViewState(socket);
        lastState = state;
        const observedElapsedMs = Date.now() - startedAt;
        const markedElapsedMs = startupElapsedMs(state, startedAt);
        milestones.firstWebViewMs ??= observedElapsedMs;
        milestones.appRenderedMs ??= markedElapsedMs.appRenderedMs;
        milestones.authReadyMs ??= markedElapsedMs.authReadyMs;
        milestones.splashRemovedMs ??= markedElapsedMs.splashRemovedMs;
        if (!state.appBoot) milestones.appRenderedMs ??= observedElapsedMs;
        if (!state.authPending) milestones.authReadyMs ??= observedElapsedMs;
        if (!state.splash) milestones.splashRemovedMs ??= observedElapsedMs;
        if (state.interactive) {
          const elapsedMs = Math.max(
            nativeLaunchMs,
            markedElapsedMs.interactiveMs || observedElapsedMs
          );
          return {
            ready: true,
            elapsedMs,
            meetsTarget: elapsedMs <= targetInteractiveMs,
            milestones,
            state,
            inspectionError: lastInspectionError
          };
        }
      } catch (error) {
        // The WebView debugging socket can be recreated during a cold launch.
        lastInspectionError = error instanceof Error ? error.message : String(error);
      }
    }
    await sleep(200);
  }

  return {
    ready: false,
    elapsedMs: Date.now() - startedAt,
    meetsTarget: false,
    milestones,
    state: lastState,
    inspectionError: lastInspectionError
  };
}

function webViewSocket() {
  const pid = adbRun(["-s", device, "shell", "pidof", packageName], { allowFailure: true }).trim();
  if (!pid) return "";
  const sockets = adbRun(["-s", device, "shell", "cat", "/proc/net/unix"], { allowFailure: true });
  const expected = `webview_devtools_remote_${pid}`;
  return sockets.includes(expected) ? expected : "";
}

async function readWebViewState(socket) {
  const port = 9_231;
  adbRun(["-s", device, "forward", `tcp:${port}`, `localabstract:${socket}`]);
  const pages = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
  const page = pages.find((item) => item.type === "page");
  if (!page?.webSocketDebuggerUrl) throw new Error("No inspectable WebView page");

  const result = await cdpEvaluate(page.webSocketDebuggerUrl, `({
    title: document.title,
    timeOriginMs: Math.round(performance.timeOrigin),
    splash: Boolean(document.querySelector('#app-splash')),
    authPending: document.documentElement.classList.contains('account-auth-pending'),
    appBoot: document.querySelector('#app')?.classList.contains('app-boot') ?? true,
    primarySurfaceVisible: [...document.querySelectorAll('#public-account-auth-gate, #app .screen')]
      .some((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' &&
          style.visibility !== 'hidden' && Number(style.opacity || 1) > 0;
      }),
    actionableControlCount: [...document.querySelectorAll('button,a[href],input,select,textarea,[role="button"]')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' &&
          style.visibility !== 'hidden' && !element.disabled;
      }).length,
    navigationTiming: (() => {
      const entry = performance.getEntriesByType('navigation')[0];
      return entry ? {
        domInteractiveMs: Math.round(entry.domInteractive),
        domContentLoadedMs: Math.round(entry.domContentLoadedEventEnd),
        loadEventMs: Math.round(entry.loadEventEnd)
      } : null;
    })(),
    resourceTimings: performance.getEntriesByType('resource')
      .filter((entry) => /(?:native-|framer-motion)/.test(entry.name))
      .map((entry) => ({
        name: entry.name.split('/').at(-1),
        startMs: Math.round(entry.startTime),
        durationMs: Math.round(entry.duration),
        decodedBytes: Number(entry.decodedBodySize) || 0
      })),
    startupMarks: Object.fromEntries(
      performance.getEntriesByType('mark')
        .filter((entry) => entry.name.startsWith('sogrim:start:'))
        .map((entry) => [
          entry.name.slice('sogrim:start:'.length),
          Math.round(entry.startTime)
        ])
    ),
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    unnamedControls: [...document.querySelectorAll('button,input,select,textarea')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        const label = element.closest('label');
        if (!(top === element || element.contains(top) || label?.contains(top))) return false;
        return !(element.innerText || element.value || element.getAttribute('aria-label') ||
          element.getAttribute('title') || element.getAttribute('placeholder'))?.trim();
      }).map((element) => ({
        tag: element.tagName,
        action: element.dataset?.action || '',
        type: element.getAttribute('type') || '',
        className: element.className || ''
      })),
    smallControls: [...document.querySelectorAll('button,input,select,textarea')]
      .filter((element) => {
        const label = element.matches('input[type="radio"],input[type="checkbox"]')
          ? element.closest('label')
          : null;
        const target = label || element;
        const rect = target.getBoundingClientRect();
        const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        if (!(top === target || target.contains(top))) return false;
        return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
      }).map((element) => {
        const label = element.matches('input[type="radio"],input[type="checkbox"]')
          ? element.closest('label')
          : null;
        const rect = (label || element).getBoundingClientRect();
        return {
          tag: element.tagName,
          action: element.dataset?.action || '',
          type: element.getAttribute('type') || '',
          text: (element.innerText || element.value || element.getAttribute('aria-label') || '').trim(),
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10
        };
      }),
    unnamedControlCount: [...document.querySelectorAll('button,input,select,textarea')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        const label = element.closest('label');
        if (!(top === element || element.contains(top) || label?.contains(top))) return false;
        return !(element.innerText || element.value || element.getAttribute('aria-label') ||
          element.getAttribute('title') || element.getAttribute('placeholder'))?.trim();
      }).length,
    smallControlCount: [...document.querySelectorAll('button,input,select,textarea')]
      .filter((element) => {
        const label = element.matches('input[type="radio"],input[type="checkbox"]')
          ? element.closest('label')
          : null;
        const target = label || element;
        const rect = target.getBoundingClientRect();
        const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        if (!(top === target || target.contains(top))) return false;
        return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
      }).length,
    interactive: !document.querySelector('#app-splash') &&
      !document.documentElement.classList.contains('account-auth-pending') &&
      (!document.querySelector('#app')?.classList.contains('app-boot') ||
        Boolean(document.querySelector('#public-account-auth-gate'))) &&
      [...document.querySelectorAll('#public-account-auth-gate, #app .screen')]
        .some((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.display !== 'none' &&
            style.visibility !== 'hidden' && Number(style.opacity || 1) > 0;
        }) &&
      [...document.querySelectorAll('button,a[href],input,select,textarea,[role="button"]')]
        .some((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.display !== 'none' &&
            style.visibility !== 'hidden' && !element.disabled;
        })
  })`);
  return result;
}

function startupElapsedMs(state, startedAt) {
  const timeOriginMs = Number(state?.timeOriginMs);
  const markElapsed = (name) => {
    const markMs = Number(state?.startupMarks?.[name]);
    if (!Number.isFinite(timeOriginMs) || !Number.isFinite(markMs)) return undefined;
    return Math.max(0, Math.round(timeOriginMs + markMs - startedAt));
  };
  const appRenderedMs = markElapsed("first-screen-rendered");
  const authReadyMs = markElapsed("auth-ready");
  const splashRemovedMs = markElapsed("splash-dismissed");
  const interactiveMarks = [appRenderedMs, authReadyMs, splashRemovedMs]
    .filter(Number.isFinite);
  return {
    appRenderedMs,
    authReadyMs,
    splashRemovedMs,
    interactiveMs: interactiveMarks.length ? Math.max(...interactiveMarks) : undefined
  };
}

function cdpEvaluate(url, expression) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("CDP evaluation timed out"));
    }, 2_000);

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: { expression, returnByValue: true }
      }));
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== 1) return;
      clearTimeout(timeout);
      socket.close();
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result?.result?.value || null);
    });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("CDP WebSocket failed"));
    });
  });
}

function findAdb() {
  const candidates = [
    process.env.ADB_PATH,
    process.env.ANDROID_HOME && join(process.env.ANDROID_HOME, "platform-tools", "adb.exe"),
    process.env.ANDROID_SDK_ROOT && join(process.env.ANDROID_SDK_ROOT, "platform-tools", "adb.exe"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Android", "Sdk", "platform-tools", "adb.exe")
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || "adb";
}

function listDevices() {
  const output = adbRun(["devices", "-l"], { allowFailure: true });
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, status, ...details] = line.split(/\s+/);
      return { serial, status, details: details.join(" ") };
    })
    .filter(({ status }) => status === "device");
}

function selectDevice(devices) {
  try {
    return chooseAndroidDevice(devices, process.env.ANDROID_QA_DEVICE);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

function readDeviceInfo(serial) {
  const property = (name) => adbRun(
    ["-s", serial, "shell", "getprop", name],
    { allowFailure: true }
  ).trim();
  return {
    manufacturer: property("ro.product.manufacturer"),
    model: property("ro.product.model"),
    androidVersion: property("ro.build.version.release"),
    sdk: Number(property("ro.build.version.sdk")) || null,
    emulator: property("ro.kernel.qemu") === "1"
  };
}

function readPackageInfo(name) {
  const output = adbRun(["-s", device, "shell", "dumpsys", "package", name], { allowFailure: true });
  return {
    versionCode: Number(output.match(/versionCode=(\d+)/)?.[1]) || null,
    versionName: output.match(/versionName=([^\s]+)/)?.[1] || null
  };
}

function packageInstalled(name) {
  return adbRun(["-s", device, "shell", "pm", "path", name], { allowFailure: true }).includes("package:");
}

function adbRun(args, { allowFailure = false } = {}) {
  const result = spawnSync(adb, args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (!allowFailure && result.status !== 0) {
    fail(`adb ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return `${result.stdout || ""}${result.stderr || ""}`;
}

function check(name, ok) {
  checks.push({ name, ok: Boolean(ok) });
}

function fail(message) {
  console.error(JSON.stringify({ ready: false, error: message }, null, 2));
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
