import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const packageName = process.env.ANDROID_QA_PACKAGE || "com.sogrimhashbon.app.debug";
const activityName = "com.sogrimhashbon.app.MainActivity";
const adb = findAdb();
const device = process.env.ANDROID_QA_DEVICE || firstDevice();
const checks = [];
const screens = [];
const screenshotDirectory = join(root, "artifacts", "android-qa", "journey");
let createdFixtureEvent = false;

if (!device) fail("No authorized Android device or emulator is connected");

adbRun(["-s", device, "shell", "am", "force-stop", packageName]);
adbRun(["-s", device, "logcat", "-c"], { allowFailure: true });
adbRun(["-s", device, "shell", "am", "start", "-n", `${packageName}/${activityName}`]);
const page = await waitForPage();
await waitFor(
  () => evaluate(page, `Boolean(document.querySelector('#app')?.dataset?.screen)`),
  25_000
);

await ensureQaAccount(page);

await clickAction(page, "home");
await waitForScreen(page, "home");
await inspect(page, "home");

let hasEvent = await evaluate(page, `Boolean(document.querySelector('[data-action=\"open-event\"]'))`);
createdFixtureEvent = await evaluate(page, `document.body.textContent.includes('QA acceptance event')`);
if (!hasEvent) {
  createdFixtureEvent = await createAcceptanceFixture(page);
  hasEvent = await evaluate(page, `Boolean(document.querySelector('[data-action=\"open-event\"]'))`);
  if (hasEvent) await inspect(page, "home-with-event");
}

async function ensureQaAccount(page) {
  const accountGateVisible = await evaluate(
    page,
    `Boolean(document.querySelector('#public-account-auth-gate'))`
  );
  if (!accountGateVisible) return;

  const credentialsPath = join(root, ".store-review-credentials.json");
  if (!existsSync(credentialsPath)) {
    throw new Error("Clean-install QA requires the private store review account");
  }

  const credentials = JSON.parse(readFileSync(credentialsPath, "utf8"));
  const email = String(credentials?.email ?? "").trim();
  const password = String(credentials?.password ?? "");
  if (!email || password.length < 8) {
    throw new Error("Store review credentials are incomplete");
  }

  await evaluate(
    page,
    `(() => {
      const toggle = document.querySelector('[data-account-action="toggle-email"]');
      if (toggle?.getAttribute('aria-expanded') !== 'true') toggle?.click();
    })()`
  );
  await waitFor(
    () => evaluate(page, `Boolean(document.querySelector('[data-account-form]'))`),
    8_000
  );

  await evaluate(
    page,
    `(() => {
      const form = document.querySelector('[data-account-form]');
      const assign = (name, value) => {
        const input = form?.querySelector('[name="' + name + '"]');
        if (!input) throw new Error('Missing account field: ' + name);
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set;
        setter?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      assign('email', ${JSON.stringify(email)});
      assign('password', ${JSON.stringify(password)});
      form.requestSubmit();
    })()`
  );

  await waitFor(
    () => evaluate(page, `!document.querySelector('#public-account-auth-gate')`),
    30_000
  );
}
check("Home exposes an event for the read-only journey", hasEvent);
if (hasEvent) {
  await clickAction(page, "open-event");
  await waitForScreen(page, "event");
  await inspect(page, "event");

  await openAndInspectOverlay(page, "open-event-participants", "participants");
  await openAndInspectOverlay(page, "open-event-share", "share");
  await openAndInspectOverlay(page, "open-event-settings", "settings");

  await clickAction(page, "settle");
  await waitForScreen(page, "settlement");
  await inspect(page, "settlement");
  await scrollPageToBottom(page);
  await sleep(250);
  await inspect(page, "settlement-bottom");

  await androidBack();
  await waitForScreen(page, "event");
  await inspect(page, "event-after-android-back");

  await clickAction(page, "open-notifications");
  await waitForScreen(page, "notifications");
  await inspect(page, "notifications");
  await androidBack();
  await waitForScreen(page, "event");

  await clickAction(page, "edit-profile");
  await waitForScreen(page, "profile");
  await inspect(page, "profile");

  const hasFriendsHub = await evaluate(
    page,
    `Boolean([...document.querySelectorAll('[data-action="groups"]')].find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      const style = getComputedStyle(candidate);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' &&
        style.visibility !== 'hidden' && !candidate.disabled;
    }))`
  );
  check("Profile exposes the friends and groups hub", hasFriendsHub);
  if (hasFriendsHub) {
    await clickAction(page, "groups");
    await waitForScreen(page, "groups");
    await inspect(page, "friends-people");

    await clickSelector(
      page,
      '[data-action="friends-hub-tab"][data-tab="requests"]',
      "Friends requests tab"
    );
    await waitForFriendsTab(page, "requests");
    await inspect(page, "friends-requests");

    await clickSelector(
      page,
      '[data-action="friends-hub-tab"][data-tab="groups"]',
      "Friends groups tab"
    );
    await waitForFriendsTab(page, "groups");
    await inspect(page, "friends-groups");

    await androidBack();
    await waitForScreen(page, "profile");
  }
  await androidBack();
  await waitForScreen(page, "event");

  await clickAction(page, "home");
  await waitForScreen(page, "home");
  await clickAction(page, "new-event");
  await waitForCreationStep(page, "type");
  await inspect(page, "new-event-type");

  await clickSelector(page, '[data-action="new-event-type"]', "First event type");
  await waitForCreationStep(page, "details");
  await inspect(page, "new-event-details");

  await androidBack();
  await waitForCreationStep(page, "type");
  await inspect(page, "new-event-type-after-back");
  await androidBack();
  await waitForScreen(page, "home");
}

if (createdFixtureEvent) {
  await removeAcceptanceFixture(page);
}

const crashLog = adbRun([
  "-s",
  device,
  "logcat",
  "-d",
  "-v",
  "brief",
  "AndroidRuntime:E",
  "chromium:E",
  "*:S"
], { allowFailure: true });
check(
  "Journey logs contain no Android crash or JavaScript fatal error",
  !/FATAL EXCEPTION|Uncaught TypeError|Uncaught ReferenceError|Renderer process crash/i.test(crashLog)
);

const ready = checks.every((item) => item.ok);
console.log(JSON.stringify({ ready, device, packageName, checks, screens }, null, 2));
if (!ready) process.exitCode = 1;

async function openAndInspectOverlay(page, action, label) {
  await clickAction(page, action);
  await waitFor(() => evaluate(page, visibleOverlayExpression()));
  if (label === "share") {
    await waitFor(
      () => evaluate(page, `(
        document.querySelector('input[name="eventInviteUrl"]')?.dataset?.shareReady === 'true' ||
        Boolean(document.querySelector('.event-invite-recovery'))
      )`),
      20_000
    );
    const shareReady = await evaluate(
      page,
      `document.querySelector('input[name="eventInviteUrl"]')?.dataset?.shareReady === 'true'`
    );
    check("share: secure invitation link is ready", shareReady);
  }
  await inspect(page, label);
  await androidBack();
  await waitFor(() => evaluate(page, `!(${visibleOverlayExpression()})`));
  await waitForScreen(page, "event");
}

async function createAcceptanceFixture(page) {
  await clickAction(page, "new-event");
  await waitForCreationStep(page, "type");
  await clickSelector(
    page,
    '[data-action="new-event-type"][data-event-type="standard"]',
    "Standard event type"
  );
  await waitForCreationStep(page, "details");
  await fillSelector(page, '[data-action="new-event-name"]', "QA acceptance event");
  await clickSelector(page, ".new-event-participants > summary", "Participants section");
  await fillSelector(page, '[data-action="new-event-guest-name"]', "QA Guest");
  await clickAction(page, "new-event-add-guest");
  await waitFor(
    () => evaluate(page, `document.querySelector('[data-new-event-participant-count]')?.textContent?.includes('2')`)
  );
  await clickAction(page, "create-event");
  await waitForScreen(page, "event");

  await clickAction(page, "show-expense-form");
  await waitForExpenseStep(page, "amount");
  await fillSelector(page, '[data-action="expense-total"]', "120");
  await clickAction(page, "expense-step-next");
  await waitForExpenseStep(page, "name");
  await fillSelector(page, '[data-action="expense-name"]', "QA Ride");
  await clickAction(page, "expense-step-next");
  await waitForExpenseStep(page, "payer");
  await clickAction(page, "expense-step-next");
  await waitForExpenseStep(page, "participants");
  await clickAction(page, "expense-step-next");
  await waitForExpenseStep(page, "review");
  await clickAction(page, "save-expense");
  await waitFor(() => evaluate(page, `!(${visibleOverlayExpression()})`));
  await waitForScreen(page, "event");
  let expenseVisible = false;
  try {
    await waitFor(
      () => evaluate(page, `document.body.textContent.includes('QA Ride')`),
      15_000
    );
    expenseVisible = true;
  } catch {
    // Keep the journey running so the remaining screens still receive coverage.
  }
  check(
    "Acceptance fixture creates an expense through the native UI",
    expenseVisible
  );

  await clickAction(page, "home");
  await waitForScreen(page, "home");
  return true;
}

async function removeAcceptanceFixture(page) {
  await clickAction(page, "open-event");
  await waitForScreen(page, "event");
  await clickAction(page, "open-event-settings");
  await waitFor(() => evaluate(page, visibleOverlayExpression()));
  await clickSelector(
    page,
    '[data-action="open-event-settings-section"][data-settings-section="danger"]',
    "Danger settings section"
  );
  await waitFor(() => evaluate(page, `Boolean(document.querySelector('[data-action="delete-event"]'))`));
  await scrollSelectorIntoView(page, '[data-action="delete-event"]');
  await clickAction(page, "delete-event");
  await waitFor(
    () => evaluate(page, `Boolean(document.querySelector('.important-action-dialog[data-important-action-kind="delete-event"]'))`)
  );
  await clickAction(page, "confirm-important-action");
  await waitForScreen(page, "home");
  check(
    "Acceptance fixture is removed after the journey",
    !(await evaluate(page, `Boolean(document.querySelector('[data-action="open-event"]'))`))
  );
}

async function fillSelector(page, selector, value) {
  const updated = await evaluate(page, `(() => {
    const candidates = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const element = candidates.find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      const style = getComputedStyle(candidate);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' &&
        style.visibility !== 'hidden' && !candidate.disabled;
    });
    if (!element) return false;
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(element),
      'value'
    )?.set;
    if (setter) setter.call(element, ${JSON.stringify(value)});
    else element.value = ${JSON.stringify(value)};
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  check(`Fill ${selector}`, updated);
}

async function scrollSelectorIntoView(page, selector) {
  const found = await evaluate(page, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "nearest" });
    return true;
  })()`);
  check(`Scroll ${selector} into view`, found);
  await sleep(250);
}

async function waitForExpenseStep(page, step) {
  await waitFor(
    () => evaluate(
      page,
      `document.querySelector('.expense-step-modal[role="dialog"]')?.dataset?.expenseStep === ${JSON.stringify(step)}`
    )
  );
}

async function inspect(page, label) {
  const state = await evaluate(page, inspectionExpression());
  screens.push({ label, ...state });
  captureScreenshot(label);
  check(`${label}: no horizontal overflow`, !state.horizontalOverflow);
  check(`${label}: no duplicate element ids`, state.duplicateIds.length === 0);
  check(`${label}: no unnamed visible controls`, state.unnamedControls.length === 0);
  check(`${label}: visible controls meet 44px targets`, state.smallControls.length === 0);
  check(`${label}: no blocked visible controls`, state.blockedControls.length === 0);
  check(`${label}: modal header content is not clipped`, state.clippedModalHeaders.length === 0);
  if (label === "share") {
    const inviteUrl = safelyParseUrl(state.visibleInviteUrl);
    check(
      `${label}: prepared invite uses a public HTTPS address`,
      inviteUrl?.protocol === "https:" &&
        !["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(inviteUrl.hostname) &&
        inviteUrl.pathname.startsWith("/i/")
    );
  }
  if (label === "settlement-bottom") {
    check(
      `${label}: final content clears the bottom navigation`,
      Number.isFinite(state.bottomContentClearance) && state.bottomContentClearance >= 12
    );
  }
  const usesStandaloneModalChrome = state.overlayVisible && state.overlayDismissVisible;
  const usesFocusedRouteChrome = state.backVisible && (state.focusedRoute || state.overlayVisible);
  check(
    `${label}: product header stays visible before page scroll`,
    state.scrollY > 1 || usesStandaloneModalChrome || usesFocusedRouteChrome || state.productHeaderVisible
  );
  check(
    `${label}: bottom navigation or focused route exit stays visible`,
    usesStandaloneModalChrome || usesFocusedRouteChrome || state.bottomNavigationVisible
  );
  check(
    `${label}: previous or close control stays available away from home`,
    label === "home" || state.backVisible || state.overlayDismissVisible
  );
}

function inspectionExpression() {
  return `(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' &&
        style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 &&
        rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth &&
        !element.closest('[hidden],[aria-hidden="true"]');
    };
    const fullyWithinViewport = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth;
    };
    const activeOverlay = [...document.querySelectorAll('.event-modal,.profile-modal,[role="dialog"],dialog')]
      .filter(visible)
      .sort((left, right) => Number(getComputedStyle(right).zIndex || 0) - Number(getComputedStyle(left).zIndex || 0))[0] || null;
    const controls = [...document.querySelectorAll('button,a[href],input,select,textarea,[role="button"]')]
      .filter(visible)
      .filter((element) => !element.matches(':disabled,[aria-disabled="true"]'))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < innerHeight;
      })
      .filter((element) => !activeOverlay || activeOverlay.contains(element) || element.matches('[data-action="go-back"]'));
    const label = (element) => String(
      element.innerText || element.value || element.getAttribute('aria-label') ||
      element.getAttribute('title') || element.getAttribute('placeholder') || ''
    ).trim().replace(/\\s+/g, ' ');
    const hitTarget = (element) => {
      const rect = element.getBoundingClientRect();
      const x = Math.min(innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
      const y = Math.min(innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
      const hit = document.elementFromPoint(x, y);
      const associatedLabel = element.closest('label');
      return hit === element || element.contains(hit) || associatedLabel?.contains(hit);
    };
    const targetRect = (element) => {
      const target = element.matches('input[type="radio"],input[type="checkbox"]')
        ? element.closest('label') || element
        : element;
      return target.getBoundingClientRect();
    };
    const bottomNav = [...document.querySelectorAll('.product-app-nav')].find(visible) || null;
    const settlementTail = document.querySelector(
      '.settlement-screen > .settlement-audit-section:last-child'
    );
    const bottomContentClearance = bottomNav && settlementTail
      ? Math.round(
          bottomNav.getBoundingClientRect().top -
          settlementTail.getBoundingClientRect().bottom
        )
      : null;
    const canScrollFurther = document.scrollingElement &&
      document.scrollingElement.scrollTop + innerHeight < document.scrollingElement.scrollHeight - 1;
    const waitsBelowFixedNavigation = (element) => {
      if (!bottomNav || bottomNav.contains(element) || !canScrollFurther) return false;
      const rect = element.getBoundingClientRect();
      return rect.bottom > bottomNav.getBoundingClientRect().top;
    };
    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id).filter(Boolean);
    const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    const visibleInviteInput = [...document.querySelectorAll('input[name="eventInviteUrl"]')].find(visible);
    return {
      screen: document.querySelector('#app')?.dataset?.screen || '',
      focusedRoute: ['new-event', 'join-event'].includes(
        document.querySelector('#app .screen')?.dataset?.screenKind || ''
      ),
      nativeBootstrapPublicUrl: String(globalThis.SogrimNativeRuntimeConfig?.publicUrl || ''),
      scrollY: Math.round(window.scrollY || document.documentElement.scrollTop || 0),
      overlayVisible: ${visibleOverlayExpression()},
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      duplicateIds,
      unnamedControls: controls.filter((element) => hitTarget(element) && !label(element))
        .map((element) => element.dataset?.action || element.tagName),
      smallControls: controls.filter((element) => {
        if (!hitTarget(element)) return false;
        const rect = targetRect(element);
        return rect.width < 44 || rect.height < 44;
      }).map((element) => {
        const rect = targetRect(element);
        return { action: element.dataset?.action || '', label: label(element), width: Math.round(rect.width), height: Math.round(rect.height) };
      }),
      blockedControls: controls.filter((element) =>
        label(element) && !hitTarget(element) && !waitsBelowFixedNavigation(element)
      )
        .map((element) => ({ action: element.dataset?.action || '', label: label(element) })),
      modalHeaderDescriptions: [...document.querySelectorAll('.event-modal-header .muted,.expense-modal-header .muted')]
        .filter(visible)
        .map((element) => ({
          text: label(element),
          color: getComputedStyle(element).color,
          opacity: getComputedStyle(element).opacity,
          background: getComputedStyle(element.closest('.event-modal-header,.expense-modal-header')).backgroundColor
        })),
      clippedModalHeaders: [...document.querySelectorAll('.event-modal-header,.expense-modal-header')]
        .filter(visible)
        .map((header) => {
          const title = header.querySelector('h2');
          const actions = header.querySelector('.event-modal-header-actions,.expense-modal-header-actions');
          const titleRect = title?.getBoundingClientRect();
          const actionsRect = actions?.getBoundingClientRect();
          const clipped = Boolean(
            (title && (title.scrollWidth > title.clientWidth + 1 || titleRect.left < 0 || titleRect.right > innerWidth)) ||
            (actions && (actionsRect.left < 0 || actionsRect.right > innerWidth))
          );
          return clipped ? {
            title: label(title),
            titleLeft: Math.round(titleRect?.left || 0),
            titleRight: Math.round(titleRect?.right || 0),
            titleScrollWidth: title?.scrollWidth || 0,
            titleClientWidth: title?.clientWidth || 0,
            actionsLeft: Math.round(actionsRect?.left || 0),
            actionsRight: Math.round(actionsRect?.right || 0)
          } : null;
        })
        .filter(Boolean),
      visibleInviteUrl: visibleInviteInput?.value || '',
      bottomContentClearance,
      productHeaderVisible: [...document.querySelectorAll('.product-header-profile-avatar')]
        .some((element) => visible(element) && fullyWithinViewport(element) && hitTarget(element)),
      bottomNavigationVisible: [...document.querySelectorAll('.product-nav-button')]
        .filter((element) => visible(element) && fullyWithinViewport(element) && hitTarget(element)).length >= 3,
      backVisible: [...document.querySelectorAll(
        '[data-action="go-back"],.modal-section-back-button'
      )]
        .some((element) => visible(element) && fullyWithinViewport(element) && hitTarget(element)),
      overlayDismissVisible: Boolean(activeOverlay && [...activeOverlay.querySelectorAll(
        '[data-action="close-event-dialog"],[data-action="close-profile-dialog"],[data-action="close-dialog"],button[aria-label*="סגור"]'
      )].some((element) => visible(element) && fullyWithinViewport(element) && hitTarget(element))),
      visibleControlCount: controls.filter(hitTarget).length
    };
  })()`;
}

function safelyParseUrl(value) {
  try {
    return new URL(String(value || ""));
  } catch {
    return null;
  }
}

function visibleOverlayExpression() {
  return `[...document.querySelectorAll('.event-modal,.profile-modal,[role="dialog"],dialog')].some((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  })`;
}

async function clickAction(page, action) {
  return clickSelector(page, `[data-action="${action}"]`, `Action ${action}`);
}

async function clickSelector(page, selector, description) {
  let available = false;
  try {
    await waitFor(
      () => evaluate(page, `(() => {
        return [...document.querySelectorAll(${JSON.stringify(selector)})]
          .some((candidate) => {
            const rect = candidate.getBoundingClientRect();
            const style = getComputedStyle(candidate);
            return rect.width > 0 && rect.height > 0 && style.display !== 'none' &&
              style.visibility !== 'hidden' && !candidate.disabled;
          });
      })()`),
      4_000
    );
    available = true;
  } catch {
    // Report the missing action through the journey checks below.
  }
  check(`${description} is available`, available);
  if (!available) throw new Error(`${description} is unavailable`);

  const clicked = await evaluate(page, `(() => {
    const element = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        const style = getComputedStyle(candidate);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' &&
          style.visibility !== 'hidden' && !candidate.disabled;
      });
    if (!element) return false;
    element.click();
    return true;
  })()`);
  check(`${description} remains available`, clicked);
  if (!clicked) throw new Error(`${description} disappeared before click`);
  await sleep(250);
}

async function androidBack() {
  adbRun(["-s", device, "shell", "input", "keyevent", "4"]);
  await sleep(350);
}

async function scrollPageToBottom(page) {
  return evaluate(page, `(() => {
    const scroller = document.scrollingElement;
    if (!scroller || scroller.scrollHeight <= innerHeight + 1) return false;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'instant' });
    return true;
  })()`);
}

async function waitForScreen(page, screen) {
  await waitFor(() => evaluate(page, `document.querySelector('#app')?.dataset?.screen === '${screen}'`));
}

async function waitForFriendsTab(page, tab) {
  await waitFor(() => evaluate(
    page,
    `document.querySelector('#app .friends-hub-screen')?.dataset?.friendsTab === '${tab}'`
  ));
}

async function waitForCreationStep(page, step) {
  await waitFor(() => evaluate(
    page,
    `document.querySelector('#app [data-event-creation-step]')?.dataset?.eventCreationStep === '${step}'`
  ));
}

async function waitFor(predicate, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(100);
  }
  throw new Error("Android journey condition timed out");
}

async function waitForPage() {
  const waitTimeoutMs = Number(process.env.ANDROID_QA_WEBVIEW_TIMEOUT_MS) || 40_000;
  const deadline = Date.now() + waitTimeoutMs;
  while (Date.now() < deadline) {
    const pid = adbRun(["-s", device, "shell", "pidof", packageName], { allowFailure: true }).trim();
    if (pid) {
      const socket = `webview_devtools_remote_${pid}`;
      const sockets = adbRun(["-s", device, "shell", "cat", "/proc/net/unix"], { allowFailure: true });
      if (sockets.includes(socket)) {
        const port = 9_232;
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
      if (message.result?.exceptionDetails) {
        const details = message.result.exceptionDetails;
        const description = details.exception?.description || details.text || "CDP expression failed";
        reject(new Error(description + " while evaluating: " + expression.slice(0, 240)));
      } else {
        resolve(message.result?.result?.value);
      }
    });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("CDP WebSocket failed"));
    });
  });
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

function captureScreenshot(label) {
  mkdirSync(screenshotDirectory, { recursive: true });
  const result = spawnSync(
    adb,
    ["-s", device, "exec-out", "screencap", "-p"],
    { cwd: root, windowsHide: true, encoding: null, maxBuffer: 20 * 1024 * 1024 }
  );
  if (result.status !== 0 || !result.stdout?.length) return;
  const safeLabel = label.replace(/[^a-z0-9-]+/gi, "-");
  writeFileSync(join(screenshotDirectory, `${safeLabel}.png`), result.stdout);
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
