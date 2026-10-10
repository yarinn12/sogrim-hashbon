import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const device = process.env.ANDROID_QA_DEVICE;
export const avd = process.env.ANDROID_QA_AVD;
export const packageName = 'com.sogrimhashbon.app.debug';
const adbPath = process.env.ADB_PATH;
if (!/^emulator-\d+$/.test(device || '') || !/^sogrim_(?:ci_[a-z0-9_]+|[a-z0-9_]+_20261010)$/.test(avd || '') || !adbPath) {
  throw new Error('Require explicit isolated emulator serial, QA AVD name and ADB_PATH');
}
export function adb(args, binary = false) {
  const result = spawnSync(adbPath, ['-s', device, ...args], { encoding: binary ? null : 'utf8', windowsHide: true, timeout: args.includes('-W')?60000:20000, maxBuffer: 20 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`ADB ${args.join(' ')} failed: ${result.error || result.stderr} ${String(result.stdout||'').slice(-700)}`);
  return result.stdout;
}
const name = adb(['emu', 'avd', 'name']).split(/\r?\n/)[0].trim();
if (name !== avd) throw new Error(`Refuse unrelated emulator: ${name}`);
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function waitFor(predicate, label, timeout = 12000) {
  const end = Date.now() + timeout;
  let lastError;
  while (Date.now() < end) {
    try { const result = await predicate(); if (result) return result; } catch (error) { lastError = error; }
    await sleep(150);
  }
  throw new Error(`${label} timed out${lastError ? ': ' + lastError.message : ''}`);
}
export async function connect() {
  return waitFor(async () => {
    const pid = adb(['shell', 'pidof', packageName]).trim();
    const socket = `webview_devtools_remote_${pid}`;
    if (!adb(['shell', 'cat', '/proc/net/unix']).includes(socket)) return;
    adb(['forward', 'tcp:9232', `localabstract:${socket}`]);
    const pages = await fetch('http://127.0.0.1:9232/json').then(r => r.json());
    const page = pages.find(p => p.type === 'page' && /^https:\/\/localhost(?:\/|$)/.test(p.url));
    if (!page) return;
    return new Cdp(page.webSocketDebuggerUrl);
  }, 'Real localhost Capacitor WebView', 30000);
}
class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.sequence = 0; this.pending = new Map(); this.exceptions = [];
    this.ready = new Promise((resolve, reject) => { const timer=setTimeout(()=>{this.socket.close();reject(new Error('CDP WebSocket open timed out'));},10000); this.socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});this.socket.addEventListener('error',e=>{clearTimeout(timer);reject(e);},{once:true}); });
    this.socket.addEventListener('message', e => {
      const m = JSON.parse(String(e.data));
      if (m.method === 'Runtime.exceptionThrown') this.exceptions.push(m.params.exceptionDetails);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject, timer } = this.pending.get(m.id); clearTimeout(timer); this.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    });
  }
  async command(method, params = {}) {
    await this.ready;
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP ${method} timed out`)); }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async click(selector) {
    await waitFor(() => this.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`), selector);
    return this.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (e.disabled) throw new Error('Control disabled'); e.click(); return true; })()`);
  }
  async fill(selector, value) {
    return this.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) throw new Error('Input missing'); const setter = Object.getOwnPropertyDescriptor(e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set; setter.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  }
  async tap(selector){
    const point=await this.evaluate(`(async()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw new Error('Tap control unavailable');e.scrollIntoView({block:'center'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;const hit=document.elementFromPoint(x,y);if(!(hit===e||e.contains(hit)))throw new Error('Tap target covered by '+hit?.outerHTML?.slice(0,200));return{x,y,dpr:devicePixelRatio,action:e.dataset.action};})()`);
    const dumpPath=`/sdcard/qa-native-window-${Date.now()}-${++this.sequence}.xml`;
    const dumped=adb(['shell','uiautomator','dump','--compressed',dumpPath]);
    if(!/dumped to/i.test(dumped))throw new Error('Native UI dump did not produce fresh bounds: '+dumped);
    const xml=adb(['shell','cat',dumpPath]);
    const tag=[...xml.matchAll(/<node[^>]*class="android\.webkit\.WebView"[^>]*>/g)].map(match=>match[0]).find(tag=>tag.includes(`package="${packageName}"`));
    const bounds=tag?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if(!bounds)throw new Error('Native tap requires actual WebView bounds');
    const x=Math.round(+bounds[1]+point.x*point.dpr),y=Math.round(+bounds[2]+point.y*point.dpr);
    if(x<+bounds[1]||x>=+bounds[3]||y<+bounds[2]||y>=+bounds[4])throw new Error('Native tap point outside WebView');
    adb(['shell','input','tap',String(x),String(y)]);return{...point,xPhysical:x,yPhysical:y,webViewBounds:bounds.slice(1)};
  }
  close() { this.socket.close(); }
}
export async function launch() {
  adb(['shell', 'am', 'force-stop', packageName]);
  await sleep(500);
  const started=adb(['shell', 'am', 'start', '-W', '-n', `${packageName}/com.sogrimhashbon.app.MainActivity`]);
  if (/Error|Exception|does not exist/i.test(started)) throw new Error('QA Activity start failed: '+started);
  try { await waitFor(()=>adb(['shell','pidof',packageName]).trim(),'QA process launched',5000); }
  catch { adb(['shell', 'am', 'start', '-n', `${packageName}/com.sogrimhashbon.app.MainActivity`]); }
  const cdp = await connect(); await cdp.command('Runtime.enable');
  await waitFor(() => cdp.evaluate(`Boolean(document.querySelector('#app')?.dataset.screen && !document.querySelector('#app-splash'))`), 'Application screen', 30000);
  await cdp.evaluate('document.fonts.ready.then(() => true)');
  return cdp;
}
export function screenshot(path) { mkdirSync(resolve(path, '..'), { recursive: true }); writeFileSync(path, adb(['exec-out', 'screencap', '-p'], true)); }
export const inspectExpression = `(() => {
  const app = document.querySelector('#app'), root = document.documentElement;
  const controls = [...document.querySelectorAll('button,input,textarea,select')].filter(e => { const r=e.getBoundingClientRect(); return r.width>0 && r.height>0 && getComputedStyle(e).visibility!=='hidden'; });
  return { url: location.href, screen: app?.dataset.screen, overlay: document.querySelector('.modal-overlay')?.dataset, dimensions: { width:innerWidth,height:innerHeight,dpr:devicePixelRatio,visualHeight:visualViewport.height,appWidth:app?.scrollWidth,rootWidth:root.scrollWidth }, fontScale: getComputedStyle(root).getPropertyValue('--android-font-scale'), rootFontSize:getComputedStyle(root).fontSize, bodyFontSize:getComputedStyle(document.body).fontSize, userAgent:navigator.userAgent, dynamicType: root.dataset.dynamicType, rootClasses:root.className, native:Capacitor.isNativePlatform(), platform:Capacitor.getPlatform(), plugins:Object.keys(Capacitor.Plugins), nativeMethods:(Capacitor.PluginHeaders?.find(plugin=>plugin.name==='SogrimCapabilities')?.methods||[]).map(method=>method.name), text:app?.innerText.slice(0,7000), controls:controls.map(e=>({action:e.dataset.action, step:e.dataset.expenseStep, label:e.getAttribute('aria-label'),text:e.innerText?.slice(0,60),tag:e.tagName,rect:e.getBoundingClientRect().toJSON()})), fixtureUnhandled:JSON.parse(localStorage.getItem('qa-native-unhandled')||'[]'), blocked:JSON.parse(localStorage.getItem('qa-native-blocked-network')||'[]'), writes:JSON.parse(localStorage.getItem('qa-native-writes')||'[]').length };
})()`;
