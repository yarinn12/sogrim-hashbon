import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const packageName = process.env.ANDROID_QA_PACKAGE || "com.sogrimhashbon.app.debug";
const activityName = "com.sogrimhashbon.app.MainActivity";
const requestedScale = Number.parseFloat(process.env.ANDROID_QA_FONT_SCALE || "1.5");
const adb = findAdb();
const device = process.env.ANDROID_QA_DEVICE || firstDevice();
const screenshotPath = join(root, "artifacts", "android-qa", "font-scale.png");
const checks = [];

if (!device) fail("No authorized Android device or emulator is connected");
if (!Number.isFinite(requestedScale) || requestedScale < 1 || requestedScale > 2) {
  fail("ANDROID_QA_FONT_SCALE must be between 1 and 2");
}

const originalScale = adbRun([
  "-s",
  device,
  "shell",
  "settings",
  "get",
  "system",
  "font_scale"
], { allowFailure: true }).trim() || "1.0";

try {
  setFontScale(requestedScale);
  launchApp();
  const page = await waitForPage();
  await waitFor(
    () => evaluate(page, `Boolean(document.querySelector('#app')?.dataset?.screen)`),
    25_000
  );
  await waitFor(
    () => evaluate(page, `document.documentElement.dataset.dynamicType === 'extra-large'`),
    10_000
  );
  await waitFor(
    () => evaluate(page, `!document.querySelector('#app-splash')`),
    10_000
  );
  await evaluate(
    page,
    `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`
  );

  const state = await evaluate(page, `(() => {
    const root = document.documentElement;
    const app = document.querySelector('#app');
    const controls = [...document.querySelectorAll('button, input, select, textarea, summary, a[href]')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      });
    const clippedText = [...document.querySelectorAll('#app h1, #app h2, #app h3, #app p, #app label, #app button, #app strong')]
      .filter((element) => element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1)
      .map((element) => (element.textContent || '').trim().slice(0, 80))
      .filter(Boolean);
    return {
      dynamicType: root.dataset.dynamicType || '',
      androidClass: root.classList.contains('dynamic-type-android'),
      fontScale: getComputedStyle(root).getPropertyValue('--android-font-scale').trim(),
      horizontalOverflow: Boolean(app && app.scrollWidth > innerWidth + 1),
      smallControls: controls
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width < 44 || rect.height < 44;
        })
        .map((element) => (element.getAttribute('aria-label') || element.textContent || element.tagName).trim().slice(0, 80)),
      clippedText
    };
  })()`);

  captureScreenshot();
  check("Android exposes the requested system font scale", Math.abs(Number(state.fontScale) - requestedScale) < 0.01);
  check("Android large text activates the shared reflow mode", state.dynamicType === "extra-large" && state.androidClass);
  check("Large text creates no horizontal app overflow", !state.horizontalOverflow);
  check("Visible controls keep the 44px touch floor", state.smallControls.length === 0);
  check("Visible text is not clipped", state.clippedText.length === 0);

  const ready = checks.every((item) => item.ok);
  console.log(JSON.stringify({ ready, device, requestedScale, state, checks, screenshotPath }, null, 2));
  if (!ready) process.exitCode = 1;
} finally {
  setFontScale(originalScale);
  launchApp();
}

function setFontScale(scale) {
  adbRun([
    "-s",
    device,
    "shell",
    "settings",
    "put",
    "system",
    "font_scale",
    String(scale)
  ]);
}

function launchApp() {
  adbRun(["-s", device, "shell", "am", "force-stop", packageName]);
  adbRun(["-s", device, "shell", "am", "start", "-n", `${packageName}/${activityName}`]);
}

async function waitForPage() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const pid = adbRun(["-s", device, "shell", "pidof", packageName], { allowFailure: true }).trim();
    if (pid) {
      const socket = `webview_devtools_remote_${pid}`;
      const sockets = adbRun(["-s", device, "shell", "cat", "/proc/net/unix"], { allowFailure: true });
      if (sockets.includes(socket)) {
        const port = 9_233;
        adbRun(["-s", device, "forward", `tcp:${port}`, `localabstract:${socket}`]);
        const pages = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
        const page = pages.find((item) => item.type === "page");
        if (page?.webSocketDebuggerUrl) {
          const webSocketUrl = new URL(page.webSocketDebuggerUrl);
          webSocketUrl.hostname = "127.0.0.1";
          webSocketUrl.port = String(port);
          return { ...page, webSocketDebuggerUrl: webSocketUrl.toString() };
        }
      }
    }
    await sleep(150);
  }
  fail("Inspectable Android WebView was not found");
}

function evaluate(page, expression) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("CDP evaluation timed out"));
    }, 10_000);
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: { expression, returnByValue: true, awaitPromise: true }
      }));
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== 1) return;
      clearTimeout(timeout);
      socket.close();
      if (message.result?.exceptionDetails) reject(new Error("CDP expression failed"));
      else resolve(message.result?.result?.value);
    });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("CDP WebSocket failed"));
    });
  });
}

async function waitFor(predicate, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(100);
  }
  throw new Error("Android font scale condition timed out");
}

function firstDevice() {
  return adbRun(["devices"], { allowFailure: true })
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .find(([, status]) => status === "device")?.[0] || "";
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

function adbRun(args, { allowFailure = false } = {}) {
  const result = spawnSync(adb, args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`adb ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return `${result.stdout || ""}${result.stderr || ""}`;
}

function captureScreenshot() {
  mkdirSync(join(root, "artifacts", "android-qa"), { recursive: true });
  const result = spawnSync(
    adb,
    ["-s", device, "exec-out", "screencap", "-p"],
    { cwd: root, windowsHide: true, encoding: null, maxBuffer: 20 * 1024 * 1024 }
  );
  if (result.status === 0 && result.stdout?.length) writeFileSync(screenshotPath, result.stdout);
}

function check(name, ok) {
  checks.push({ name, ok: Boolean(ok) });
}

function fail(message) {
  console.error(JSON.stringify({ ready: false, error: message }, null, 2));
  process.exit(1);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
