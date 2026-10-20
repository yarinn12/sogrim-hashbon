import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fetchWithTimeout } from "../src/data/fetchTimeout.mjs";
const app = readFileSync("src/app.mjs", "utf8").replaceAll("\r\n", "\n");
const bridge = readFileSync("src/publicNativeBridgeLayer.mjs", "utf8").replaceAll("\r\n", "\n");
function declaration(source, name, optional = false) {
  const match = new RegExp(`(?:async )?function ${name}\\(`).exec(source);
  if (optional && !match) return "";
  assert.ok(match, `actual source must define ${name}`);
  const end = source.indexOf("\n}\n", match.index) + 2;
  assert.ok(end > match.index, name);
  return source.slice(match.index, end);
}
function native(plugin) {
  const calls = [];
  const context = vm.createContext({ File, Date, fetchWithTimeout, fetch: async url => {
    calls.push(url); return new Response(new Blob(["synthetic-image-bytes"], { type: "image/jpeg" }));
  }});
  for (const name of ["nativeImageFile", "createNativeCameraApi", "createNativeGalleryApi"])
    vm.runInContext(declaration(bridge, name, name !== "createNativeCameraApi"), context);
  return { context, calls, camera: context.createNativeCameraApi(plugin), gallery: () => {
    assert.equal(typeof context.createNativeGalleryApi, "function", "Gallery requires its own direct native API");
    return context.createNativeGalleryApi(plugin);
  }};
}
function editor() {
  const applied = [], fallback = [], renders = [];
  const draft = { name: "Original", notes: "Keep my notes", attachmentImage: "original-image", error: "" };
  const context = vm.createContext({ expenseDraft: draft, expenseAttachmentRequest: null,
    state: { currentParticipantId: "owner-a" }, SogrimNative: {}, console: { warn() {} },
    applyExpenseAttachmentImage: async file => { applied.push({ file, draft: context.expenseDraft }); },
    render: () => renders.push(true), activateExpenseEntryDialog() {} });
  for (const name of ["selectExpenseAttachment", "captureExpenseAttachment"])
    vm.runInContext(declaration(app, name, name !== "captureExpenseAttachment"), context);
  function trigger() { return { disabled: false, attrs: {}, setAttribute(k,v) { this.attrs[k]=v; },
    removeAttribute(k) { delete this.attrs[k]; }, closest: () => ({ querySelector: selector => ({ click: () => fallback.push(selector) }) }) }; }
  return { context, applied, fallback, renders, draft, trigger };
}
const media = { webPath: "https://localhost/_capacitor_file_/synthetic.jpg", metadata: { format: "jpeg" } };
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
test("native camera calls only takePhoto with rear camera and returns readable image bytes", async () => {
  let options; const h=native({takePhoto: async o => { options=o; return media; },chooseFromGallery: () => assert.fail("camera opened gallery")});
  const file=await h.camera.takePhoto(); assert.equal(options.cameraDirection,"REAR");assert.equal(options.saveToGallery,false);
  assert.equal(file.type,"image/jpeg");assert.equal(await file.text(),"synthetic-image-bytes");assert.deepEqual(h.calls,[media.webPath]);
});
test("native gallery calls only single-photo chooseFromGallery and returns readable image bytes", async () => {
  let options; const h=native({takePhoto: () => assert.fail("gallery opened camera"), chooseFromGallery: async o => {options=o;return {results:[media]};}});
  const file=await h.gallery().pickPhoto();assert.equal(options.mediaType,0);assert.equal(options.allowMultipleSelection,false);
  assert.equal(file.type,"image/jpeg");assert.equal(await file.text(),"synthetic-image-bytes");assert.deepEqual(h.calls,[media.webPath]);
});
for (const [source,method,code] of [["camera","takePhoto","OS-PLUG-CAMR-0006"],["gallery","chooseFromGallery","OS-PLUG-CAMR-0020"]]) {
  test(`${source} cancellation returns no image and never reads a file`,async()=>{
    const h=native({[method]:async()=>{throw Object.assign(new Error("Cancelled"),{code});}});
    assert.equal(await (source==="camera"?h.camera.takePhoto():h.gallery().pickPhoto()),null);assert.equal(h.calls.length,0);
  });
  test(`${source} permission denial is propagated rather than opening another source`,async()=>{
    const error=Object.assign(new Error("Denied"),{code:source==="camera"?"OS-PLUG-CAMR-0003":"OS-PLUG-CAMR-0005"});
    const h=native({[method]:async()=>{throw error;}});await assert.rejects(source==="camera"?h.camera.takePhoto():h.gallery().pickPhoto(),e=>e===error);assert.equal(h.calls.length,0);
  });
}
test("browser camera requests capture while gallery requests an image chooser without capture",async()=>{
  const h=editor();await h.context.captureExpenseAttachment(h.trigger());
  assert.match(h.fallback[0],/camera-fallback/);
  assert.equal(typeof h.context.selectExpenseAttachment,"function","Gallery needs a distinct action");
  await h.context.selectExpenseAttachment(h.trigger(),"gallery");assert.match(h.fallback[1],/:not\(\[data-image-source\]\)/);
});
for (const source of ["camera","gallery"]) {
  test(`${source} applies a returned photo to its draft without touching notes`,async()=>{
    const h=editor(),file={name:"synthetic.jpg"},t=h.trigger();h.context.SogrimNative={camera:{available:true,takePhoto:async()=>file},gallery:{available:true,pickPhoto:async()=>file}};
    if(source==="camera")await h.context.captureExpenseAttachment(t);else {assert.equal(typeof h.context.selectExpenseAttachment,"function");await h.context.selectExpenseAttachment(t,source);}
    assert.equal(h.applied.length,1);assert.equal(h.applied[0].draft,h.draft);assert.equal(h.draft.notes,"Keep my notes");assert.equal(t.disabled,false);
  });
}
for (const source of ["camera","gallery"]) for (const result of ["photo","error"]) for (const changed of ["draft","account"]) {
  test(`${source} ${result} arriving after ${changed} changed cannot affect the new editor`,async()=>{
    const h=editor(),pending=deferred(),t=h.trigger();h.context.SogrimNative={camera:{available:true,takePhoto:()=>pending.promise},gallery:{available:true,pickPhoto:()=>pending.promise}};
    const request=source==="camera"?h.context.captureExpenseAttachment(t):h.context.selectExpenseAttachment(t,source);if(changed==="draft")h.context.expenseDraft={notes:"New notes",error:"New message"};else h.context.state.currentParticipantId="owner-b";
    const before=JSON.stringify(h.context.expenseDraft);
    if(result==="photo")pending.resolve({name:"late.jpg"});else pending.reject(new Error("Late denial"));await request;
    assert.equal(h.applied.length,0);assert.equal(JSON.stringify(h.context.expenseDraft),before);assert.equal(h.renders.length,0);assert.equal(t.disabled,false);
  });
}
test("a pending picker prevents another camera or gallery request in the same draft",async()=>{
  const h=editor(),pending=deferred();let calls=0;h.context.SogrimNative={camera:{available:true,takePhoto:()=>{calls++;return pending.promise;}},gallery:{available:true,pickPhoto:()=>{calls++;return pending.promise;}}};
  const first=h.context.captureExpenseAttachment(h.trigger());const second=h.context.captureExpenseAttachment(h.trigger());
  assert.equal(typeof h.context.selectExpenseAttachment,"function");const third=h.context.selectExpenseAttachment(h.trigger(),"gallery");
  pending.resolve(null);await Promise.all([first,second,third]);assert.equal(calls,1);assert.equal(h.applied.length,0);assert.equal(h.draft.attachmentImage,"original-image");
});

test("unavailable native gallery falls back without requesting camera permissions", async () => {
  const h=native({takePhoto:async()=>assert.fail("gallery invoked camera")});const gallery=h.gallery();assert.equal(gallery.available,false);assert.equal(await gallery.pickPhoto(),null);assert.equal(h.calls.length,0);
});
test("an empty native gallery result is a cancellation, not a broken image", async () => {
  const h=native({chooseFromGallery:async()=>({results:[]})});assert.equal(await h.gallery().pickPhoto(),null);assert.equal(h.calls.length,0);
});
