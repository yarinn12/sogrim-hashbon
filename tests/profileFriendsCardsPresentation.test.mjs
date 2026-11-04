import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";
import {renderProfileAvatarPickerView} from "../src/ui/profileAvatarPresentation.mjs";
import {renderFriendsSearchEmptyView} from "../src/ui/friendsSearchEmptyPresentation.mjs";
import {renderHomeEventCardView} from "../src/ui/homeEventCardPresentation.mjs";

const presets = [
  {id:"avatar-1", label:"תמונה ראשונה", src:"/assets/avatars/avatar-1.png"},
  {id:"avatar-2", label:"תמונה שנייה", src:"/assets/avatars/avatar-2.png"}
];

test("first-run avatar selection retains its existing radio choices without profile actions", () => {
  const html=renderProfileAvatarPickerView({presets,selectedPresetId:"avatar-2"});
  assert.match(html, /<legend>בחר תמונת פרופיל<\/legend>/);
  assert.match(html, /value="avatar-2"[^>]*checked/);
  assert.doesNotMatch(html, /value="avatar-1"[^>]*checked/);
  assert.doesNotMatch(html, /<details|choose-profile-avatar-image|remove-profile-avatar-image/);
});

test("profile image sources keep distinct camera and gallery inputs and concise labels", () => {
  const html=renderProfileAvatarPickerView({presets,editing:true,selectedPresetId:"avatar-1",selectedSource:presets[0].src});
  assert.match(html, /profile-avatar-picker-shell avatar-selection-review/);
  assert.match(html, /<strong>בחירה מהגלריה<\/strong>/);
  assert.match(html, /<strong>צילום תמונה<\/strong>/);
  assert.match(html, /<legend>תמונות מוכנות<\/legend>/);
  const inputs=[...html.matchAll(/<input[^>]*type="file"[^>]*>/g)].map(m=>m[0]);
  assert.equal(inputs.length,2);
  assert.match(inputs[0], /data-image-source="gallery"/);
  assert.doesNotMatch(inputs[0], /capture=/);
  assert.match(inputs[1], /data-image-source="camera"/);
  assert.match(inputs[1], /capture="environment"/);
  for(const input of inputs)assert.match(input,/accept="image\/\*"[^>]*hidden/);
  assert.doesNotMatch(html,/תמונה מהמכשיר|צילום תמונה חדשה|remove-profile-avatar-image/);
});

test("an uploaded profile photo offers removal and does not falsely select a preset", () => {
  const html=renderProfileAvatarPickerView({presets,editing:true,hasImage:true,selectedPresetId:"avatar-1",selectedSource:"data:image/png;base64,c3ludGhldGlj"});
  assert.match(html, /data-action="remove-profile-avatar-image">הסרת התמונה/);
  assert.match(html, /החלפה או הסרה/);
  assert.doesNotMatch(html, /\schecked(?:\s|\/|>)/);
});

test("profile presentation escapes draft and asset attributes", () => {
  const html=renderProfileAvatarPickerView({editing:true,selectedSource:'x" <img>',presets:[{id:'id"',label:'שם <בדיקה> & "',src:'path"'}]});
  assert.match(html, /src="x&quot; &lt;img&gt;"/);
  assert.match(html, /value="id&quot;"/);
  assert.match(html, /title="שם &lt;בדיקה&gt; &amp; &quot;"/);
  assert.doesNotMatch(html, /שם <בדיקה>|src="path""/);
});

test("profile adapter retains pending preview priority and first-run scope", async () => {
  const app=await readFile("src/app.mjs","utf8"),source=app.slice(app.indexOf("function renderProfileAvatarPicker()"),app.indexOf("function renderInviteProfilePreview"));
  let model;
  const context={AVATAR_PRESETS:presets,profileAvatarDraft:"avatar-2",profileAvatarPendingPreview:"blob:pending",profileAvatarImageDraft:"data:image/png;base64,saved",localProfile:{},screen:{name:"profile"},renderProfileAvatarPickerView:input=>(model=input,"picker")};
  assert.equal(runInNewContext(source+";renderProfileAvatarPicker()",context),"picker");
  assert.equal(model.selectedSource,"blob:pending");assert.equal(model.selectedPresetId,"avatar-2");assert.equal(model.hasImage,true);assert.equal(model.editing,true);
  context.localProfile=null;context.profileAvatarPendingPreview="";context.profileAvatarImageDraft="";
  runInNewContext(source+";renderProfileAvatarPicker()",context);
  assert.equal(model.editing,false);assert.equal(model.selectedSource,presets[1].src);
});

test("no-result presentation stays hidden until the existing filter enables its reset", () => {
  const html=renderFriendsSearchEmptyView();
  assert.match(html,/data-friends-search-empty role="status" hidden/);
  assert.match(html,/<strong>לא נמצאו חברים<\/strong>/);
  assert.match(html,/data-action="clear-friends-search">ניקוי החיפוש/);
  assert.doesNotMatch(html,/open-friend-add|בקשת חברות|אין חברים עדיין/);
});

test("home cards expose the full escaped name and preserve separate open and options controls", () => {
  const name='שם ארוך עם <בדיקה> & "',id='event"1';
  const html=renderHomeEventCardView({id,name,optionsLabel:name,avatarsHtml:'<span class="avatar-stack"></span>',metaHtml:'<span class="event-row-meta">פרטים</span>'});
  assert.match(html,/<strong>שם ארוך עם &lt;בדיקה&gt; &amp; &quot;<\/strong>/);
  assert.match(html,/data-action="open-event" data-event-id="event&quot;1"/);
  assert.match(html,/data-action="event-status-select" data-event-id="event&quot;1"/);
  assert.match(html,/data-long-press-event="true"/);
  assert.match(html,/class="event-row-main"/);
  assert.match(html,/class="event-row-context"><span class="avatar-stack"><\/span><span class="event-row-meta">פרטים/);
  assert.equal((html.match(/<button\b/g)||[]).length,2);
  assert.doesNotMatch(html,/event-row-balance|event-note-pin|<select/);
});

test("pinned card and expanded options keep their accessible state", () => {
  const html=renderHomeEventCardView({pinned:true,expanded:true,name:"אירוע"});
  assert.match(html,/long-event-card-review is-pinned/);
  assert.match(html,/aria-label="אירוע מוצמד"/);
  assert.match(html,/aria-expanded="true"/);
  assert.equal((renderHomeEventCardView({expanded:false}).match(/aria-expanded="false"/g)||[]).length,1);
});

test("home adapter keeps participant actions suppressed and supplies existing status and pin state", async () => {
  const app=await readFile("src/app.mjs","utf8"),source=app.slice(app.indexOf("function renderEventRow(event, pinned = false)"),app.indexOf("function ensureNewEventDraft"));
  let model,avatarArgs;
  const event={id:"e1",name:"שם ארוך"};
  const context={event,eventStatusMenu:{eventId:"e1"},activeEventParticipants:()=>[{id:"p1"},{id:"p2"}],eventRowDisplayName:()=>"השם המוצג",renderAvatarStack:(...args)=>(avatarArgs=args,"avatars"),renderEventRowMeta:()=>"meta",renderHomeEventCardView:input=>(model=input,"card")};
  assert.equal(runInNewContext(source+";renderEventRow(event,true)",context),"card");
  assert.equal(model.name,"השם המוצג");assert.equal(model.pinned,true);assert.equal(model.expanded,true);assert.equal(model.metaHtml,"meta");
  assert.deepEqual(Array.from(avatarArgs[0]),["p1","p2"]);assert.equal(avatarArgs[1],event);assert.equal(avatarArgs[2].suppressParticipantAction,true);
});

test("home metadata keeps one date-time group and omits dates for undated legacy records", async () => {
  const app=await readFile("src/app.mjs","utf8"),source=app.slice(app.indexOf("function renderEventRowMeta("),app.indexOf("function renderEventRow(event, pinned = false)"));
  const date=new Date("2026-10-21T10:00:00Z"),context={event:{},participants:[{},{}],creationDate:()=>date,eventHomeStatusLabel:()=>"מתחשבנים",formatCount:()=>"2 משתתפים",formatRelativeCalendarDate:()=>"היום",formatClockTime:()=>"13:00",escapeHtml:s=>s,escapeAttribute:s=>s};
  const html=runInNewContext(source+";renderEventRowMeta(event,participants)",context);
  assert.match(html,/event-row-state is-settling/);assert.match(html,/event-row-date-time/);assert.match(html,/<bdi>היום<\/bdi>/);assert.match(html,/dir="ltr"/);assert.equal((html.match(/event-row-meta-separator/g)||[]).length,1);
  context.creationDate=()=>null;
  const undated=runInNewContext(source+";renderEventRowMeta(event,participants)",context);
  assert.doesNotMatch(undated,/<time|event-row-date-time|event-row-meta-separator/);assert.match(undated,/2 משתתפים/);
});
