import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

import {
  ACCESSIBILITY_PREFERENCES_STORAGE_KEY,
  DEFAULT_ACCESSIBILITY_PREFERENCES,
  loadAccessibilityPreferences,
  normalizeAccessibilityPreferences,
  saveAccessibilityPreferences
} from "../src/data/accessibilityPreferences.mjs";

function memoryStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return entries.get(key) ?? null;
    },
    setItem(key, value) {
      entries.set(key, String(value));
    }
  };
}

test("accessibility preferences normalize malformed values safely", () => {
  assert.deepEqual(normalizeAccessibilityPreferences(null), {
    ...DEFAULT_ACCESSIBILITY_PREFERENCES
  });
  assert.deepEqual(
    normalizeAccessibilityPreferences({
      textSize: "huge",
      highContrast: "yes",
      reduceMotion: 1
    }),
    { ...DEFAULT_ACCESSIBILITY_PREFERENCES }
  );
});

test("accessibility preferences persist on the device", () => {
  const storage = memoryStorage();
  const saved = saveAccessibilityPreferences(
    { textSize: "extra-large", highContrast: true, reduceMotion: true },
    storage
  );

  assert.deepEqual(loadAccessibilityPreferences(storage), saved);
  assert.ok(storage.getItem(ACCESSIBILITY_PREFERENCES_STORAGE_KEY));
});

test("accessibility center is semantic, persistent and compatible with app navigation", async () => {
  const [index, app, layer, splash, motion, icons, ledger] = await Promise.all([
    readFile("index.html", "utf8"),
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicAccessibilityLayer.mjs", "utf8"),
    readFile("src/publicAppSplashLayer.mjs", "utf8"),
    readFile("src/publicFramerMotionLayer.mjs", "utf8"),
    readFile("src/uiIcons.mjs", "utf8"),
    readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8")
  ]);

  assert.match(index, /publicAccessibilityLayer\.mjs/);
  assert.match(layer, /aria-label="פתיחת הגדרות נגישות"/);
  assert.match(app, /class="secondary-button profile-accessibility-entry" data-open-accessibility/);
  assert.match(layer, /role="dialog"/);
  assert.match(layer, /aria-modal="true"/);
  assert.match(layer, /aria-labelledby="accessibility-center-title"/);
  assert.match(layer, /aria-describedby="accessibility-center-description"/);
  assert.match(layer, /\.accessibility-entry-auth \{[\s\S]*?left: 14px;[\s\S]*?right: auto;/);
  assert.match(layer, /role="status" aria-live="polite"/);
  assert.match(layer, /role="switch"/);
  assert.match(layer, /href="\.\/accessibility\.html"/);
  assert.match(layer, /min-height: 44px/);
  assert.match(layer, /handleAccessibilityHistoryBack/);
  assert.match(layer, /handleAccessibilityNativeBack/);
  assert.match(layer, /setBackgroundInert\(true\)/);
  assert.match(layer, /accessibility-reduced-motion/);
  assert.match(layer, /addEventListener\("storage", handleAccessibilityStorageChange\)/);
  assert.match(layer, /\.screen > \.top/);
  assert.match(layer, /settle-friends:accessibility-center-changed/);
  assert.match(layer, /backButton\.insertAdjacentElement\("afterend", entry\)/);
  assert.doesNotMatch(
    layer,
    /addEventListener\("pointerdown", handleAccessibilityPointerDown/
  );
  assert.match(ledger, /\.product-route-controls > \.app-back-button \{\s*order: 0 !important/);
  assert.match(ledger, /\.screen\[data-screen-kind="home"\][\s\S]*?\.product-route-controls[\s\S]*?> \.app-back-button[\s\S]*?display: inline-grid !important/);
  assert.match(ledger, /\.product-route-controls > \.accessibility-entry-button \{\s*order: 1 !important/);
  assert.match(ledger, /\.product-route-controls \{\s*direction: ltr !important;\s*flex-direction: row !important/);
  assert.match(ledger, /left: max\(12px, calc\(\(100vw - 448px\) \/ 2 \+ 22px\)\) !important/);
  assert.doesNotMatch(
    ledger.match(/html\.ledger-workspace-v1 \.product-route-controls,[\s\S]*?display: inline-flex !important;/)?.[0] ?? "",
    /inset-inline-(?:start|end)/
  );
  assert.match(ledger, /\.product-app-identity > \.product-brand-lockup,[\s\S]*?\.product-header-profile-avatar \{[\s\S]*?visibility: visible !important/);
  assert.match(layer, /prefers-contrast: more/);
  assert.match(splash, /loadAccessibilityPreferences\(\)\.reduceMotion/);
  assert.match(motion, /accessibility-reduced-motion/);
  assert.match(icons, /accessibility:/);
});


async function changeHandlerHarness(kind, value, checked=true) {
  const layer=await readFile('src/publicAccessibilityLayer.mjs','utf8');
  const start=layer.indexOf('function handleAccessibilityChange('), end=layer.indexOf('\nfunction ',start+1);
  const initial={textSize:'extra-large',highContrast:true,reduceMotion:true};
  const storage=memoryStorage({[ACCESSIBILITY_PREFERENCES_STORAGE_KEY]:JSON.stringify(initial)});
  const calls={applied:0,synced:0,announced:[],writes:0};
  const set=storage.setItem.bind(storage);storage.setItem=(...args)=>{calls.writes++;set(...args);};
  const rootMarker={value:undefined,matches:selector=>selector.includes('data-accessibility-text-size')};
  class InputControl {
    constructor(){this.value=value;this.checked=checked;}
    closest(){return ['text-size','contrast','motion'].includes(kind)?this:rootMarker;}
    matches(selector){return selector.includes('data-accessibility-'+kind);}
  }
  const context=vm.createContext({HTMLInputElement:InputControl,preferences:{...initial},
    saveAccessibilityPreferences:p=>saveAccessibilityPreferences(p,storage),
    applyAccessibilityPreferences:()=>{calls.applied++;},syncAccessibilityControls:()=>{calls.synced++;},
    announceAccessibilityUpdate:message=>calls.announced.push(message)});
  vm.runInContext(layer.slice(start,end),context);
  context.handleAccessibilityChange({target:new InputControl()});
  return{initial,stored:loadAccessibilityPreferences(storage),calls};
}
for(const ordinary of ['ordinary-text','ordinary-checkbox','ordinary-select']){
 test(`ordinary ${ordinary} changes cannot treat the root preference marker as a settings control`,async()=>{
  const result=await changeHandlerHarness(ordinary,'שם שהוזן');
  assert.deepEqual(result.stored,result.initial,'a form change must preserve the explicit device text-size choice');
  assert.equal(result.calls.writes,0);assert.equal(result.calls.applied,0);assert.equal(result.calls.synced,0);assert.deepEqual(result.calls.announced,[]);
 });
}
for(const [kind,value,checked,expected] of [
 ['text-size','large',true,{textSize:'large',highContrast:true,reduceMotion:true}],
 ['contrast',undefined,false,{textSize:'extra-large',highContrast:false,reduceMotion:true}],
 ['motion',undefined,false,{textSize:'extra-large',highContrast:true,reduceMotion:false}]
]){
 test(`the actual ${kind} input still saves and applies its chosen preference`,async()=>{
  const result=await changeHandlerHarness(kind,value,checked);assert.deepEqual(result.stored,expected);
  assert.equal(result.calls.writes,1);assert.equal(result.calls.applied,1);assert.equal(result.calls.synced,1);assert.equal(result.calls.announced.length,1);
 });
}
