import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {openRenderedHome} from './helpers/typographyReadiness.mjs';
import {installSyntheticSystemText} from './helpers/accessibilityPresentation.mjs';
import {paint,pointClick,settled,geometry,navigation,keyboardFieldFocus,unchanged,acknowledged} from './helpers/eventNotesBatchPresentation.mjs';

const fixture=readFileSync(new URL('./fixtures/eventNotesBatchBootstrap.js',import.meta.url),'utf8');
const evidence=new WeakMap();
test.use({serviceWorkers:'block'});
test.beforeEach(async({page})=>{
  const record={errors:[],external:[]};evidence.set(page,record);
  page.on('pageerror',error=>record.errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'
    ?route.continue():(record.external.push(route.request().url()),route.abort()));
  await page.addInitScript({content:fixture});
});
test.afterEach(async({page})=>{const record=evidence.get(page);expect(record.errors).toEqual([]);expect(record.external).toEqual([])});

async function start(page,{width=393,height=852,root=16,query='',system=false}={}) {
  if(system)await page.addInitScript(installSyntheticSystemText);
  await page.setViewportSize({width,height});
  await openRenderedHome(page,{path:'/?review=1&requests=accepted&reward=inactive'+(!system&&root>16?'&dynamic-type-preview='+root:'')+query,bootTimeoutMs:30000,readyTimeoutMs:8000});
  await pointClick(page.locator('.product-home-screen .event-list [data-action="open-event"][data-event-id="friend-weekend"]'));
  await pointClick(page.locator('.event-workspace-nav [data-action="open-event-notes"]'));
  const list=page.locator('.event-notes-screen');await expect(list).toBeVisible();await paint(page);await settled(page);
  return{page,list,root:system?32:root};
}
async function openNew(x) {
  await pointClick(x.list.locator('[data-action="new-event-note"]'));
  const editor=x.page.locator('.event-note-screen');await expect(editor).toBeVisible();await expect(editor).toHaveAttribute('role','region');await paint(x.page);
  await expect(editor.locator('[data-action="save-event-note"]')).toHaveText('צור פתק');return editor;
}
async function openNote(x,id='note-lodging') {
  const row=x.list.locator('.event-note-open[data-note-id="'+id+'"]');await pointClick(row);
  const editor=x.page.locator('.event-note-screen');await expect(editor).toBeVisible();await paint(x.page);return editor;
}
async function back(x,editor) {
  await pointClick(editor.locator('[data-action="close-event-dialog"]'));
  await expect(editor).toHaveCount(0);await expect(x.list).toBeVisible();await paint(x.page);
}
async function openDelete(x,editor) {
  const trigger=editor.locator('[data-action="request-delete-event-note"]');await pointClick(trigger);
  const dialog=x.page.locator('.event-note-delete-confirmation');await expect(dialog).toBeVisible();await expect(dialog.locator('[data-action="cancel-important-action"]')).toBeFocused();await expect.poll(()=>dialog.evaluate(e=>!!e.closest('[inert]'))).toBe(false);await paint(x.page);
  return{dialog,trigger};
}
async function fill(editor,title,body) {
  await editor.locator('[name="eventNoteTitle"]').fill(title);await editor.locator('[name="eventNoteBody"]').fill(body);
}
async function save(editor) {await pointClick(editor.locator('[data-action="save-event-note"]'))}
async function noteId(page,title) {return page.evaluate(title=>__friendInviteQa.canonicalSnapshot.state.events[0].notes.find(n=>n.title===title)?.id,title)}
async function cancelConfirmation(x,editor) {
  const{dialog,trigger}=await openDelete(x,editor),cancel=dialog.locator('[data-action="cancel-important-action"]'),confirm=dialog.locator('[data-action="confirm-important-action"]');
  await geometry({...x,scope:dialog,kind:'confirmation'});
  await cancel.press('Tab');await expect(confirm).toBeFocused();await confirm.press('Tab');await expect(cancel).toBeFocused();await cancel.press('Shift+Tab');await expect(confirm).toBeFocused();await confirm.press('Shift+Tab');await expect(cancel).toBeFocused();
  await cancel.press('Enter');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
  await pointClick(trigger);await expect(dialog).toBeVisible();await x.page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
}

const profiles=[['phone',393,852,16,false],['medium',360,740,20,false],['large',320,852,32,false],['short',320,390,32,false],['landscape',852,393,32,false],['desktop',1280,720,16,false],['system-text',320,390,32,true]];
for(const[id,width,height,root,system]of profiles)test('notes batch all four screens remain readable and cancellable '+id,async({page})=>{
  const x=await start(page,{width,height,root,system});
  await navigation(page);await geometry({...x,scope:x.list,kind:'list'});
  await expect(x.list.locator('.event-note-row')).toHaveCount(3);
  await expect(x.list.locator('.event-note-row button')).toHaveCount(3);
  await expect(x.list.locator('.event-notes-intro,.event-note-row .avatar-stack')).toHaveCount(0);
  const fresh=await openNew(x);await navigation(page,'editor');await geometry({...x,scope:fresh,kind:'editor'});
  await fill(fresh,'כתובת הלינה','רחוב הדקל 12\nנפגשים בכניסה.');await keyboardFieldFocus(fresh);
  const pin=fresh.locator('[data-action="toggle-event-note-pin"]');await expect(pin).toHaveAttribute('aria-pressed','false');await pointClick(pin);await expect(pin).toHaveAttribute('aria-pressed','true');await expect(pin).toBeFocused();await expect(fresh.locator('[name="eventNoteTitle"]')).toHaveValue('כתובת הלינה');await expect(fresh.locator('[name="eventNoteBody"]')).toHaveValue('רחוב הדקל 12\nנפגשים בכניסה.');await pointClick(pin);await expect(pin).toHaveAttribute('aria-pressed','false');await back(x,fresh);
  const editor=await openNote(x);await navigation(page,'editor');await geometry({...x,scope:editor,kind:'editor'});await expect(editor.locator('[data-action="save-event-note"]')).toHaveText('שמור שינויים');await cancelConfirmation(x,editor);await back(x,editor);
  await settled(page);await unchanged(page);
});

for(const exit of['back','escape'])test('notes editor '+exit+' restores the second note row rather than the first row',async({page})=>{
  const x=await start(page),row=x.list.locator('.event-note-open[data-note-id="note-meeting"]');await pointClick(row);const editor=page.locator('.event-note-modal');await expect(editor).toBeVisible();await paint(page);
  if(exit==='back')await back(x,editor);else{await page.keyboard.press('Escape');await expect(editor).toHaveCount(0)}
  await expect(row).toBeFocused();await settled(page);await unchanged(page);
});

test('foreground note deletion owns Tab over its editor and restores the delete trigger',async({page})=>{
  const x=await start(page);await pointClick(x.list.locator('.event-note-open[data-note-id="note-meeting"]'));
  const editor=page.locator('.event-note-modal');await expect(editor).toBeVisible();await paint(page);const trigger=editor.locator('[data-action="request-delete-event-note"]');await pointClick(trigger);
  const dialog=page.locator('.important-action-dialog[data-important-action-kind="delete-event-note"]'),cancel=dialog.locator('[data-action="cancel-important-action"]'),confirm=dialog.locator('[data-action="confirm-important-action"]');await expect(dialog).toBeVisible();await expect(cancel).toBeFocused();await cancel.press('Shift+Tab');await expect(confirm).toBeFocused();await confirm.press('Tab');await expect(cancel).toBeFocused();await cancel.press('Enter');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();await back(x,editor);await unchanged(page);
});

test('notes empty state has one create action and required-content validation preserves the draft',async({page})=>{
  const x=await start(page,{width:320,root:32,query:'&notes=empty'});await expect(x.list.locator('.event-note-row')).toHaveCount(0);await expect(x.list.locator('.event-notes-empty')).toContainText('עוד אין פתקים באירוע');await expect(x.list.locator('[data-action="new-event-note"]')).toHaveCount(1);await geometry({...x,scope:x.list,kind:'list'});
  const editor=await openNew(x);await save(editor);await expect(editor.locator('#event-note-error')).toContainText('צריך לכתוב כותרת או תוכן');await expect(editor.locator('[name="eventNoteTitle"]')).toBeFocused();await expect(editor.locator('[name="eventNoteTitle"]')).toHaveAttribute('maxlength','120');await expect(editor.locator('[name="eventNoteBody"]')).toHaveAttribute('maxlength','5000');await back(x,editor);await unchanged(page);
});

for(const mode of['notes-locked','notes-readonly'])test('notes '+mode+' keeps long content readable without edit actions',async({page})=>{
  const x=await start(page,{width:320,root:32,query:'&'+mode+'=1&notes-long=1'});await expect(x.list.locator('[data-action="new-event-note"]')).toBeDisabled();await geometry({...x,scope:x.list,kind:'list'});
  const editor=await openNote(x),seed=await page.evaluate(()=>__friendInviteQa.noteBatchSeed[0]);await expect(editor.locator('input,textarea,.event-note-pin-toggle,.event-note-delete,[data-action="save-event-note"]')).toHaveCount(0);await expect(editor.locator('.event-note-readonly-content h3')).toHaveText(seed.title);await expect(editor.locator('.event-note-readonly-content p')).toHaveText(seed.body);await geometry({...x,scope:editor,kind:'editor'});await back(x,editor);await unchanged(page);
});

test('notes create edit pin unpin and delete reach canonical and personal ACK without changing any money',async({page})=>{
  const x=await start(page,{width:320,root:32});let editor=await openNew(x);
  const title='פרטי ההסעה',body='נפגשים ביום חמישי ב־09:00.\nליד שער הכניסה.';
  await fill(editor,title,body);await pointClick(editor.locator('[data-action="toggle-event-note-pin"]'));await save(editor);await expect(editor).toHaveCount(0);await acknowledged(page,{title,body,pinned:true});
  const id=await noteId(page,title);expect(id).toBeTruthy();await expect(x.list.locator('.event-notes-section.is-pinned [data-note-id="'+id+'"]')).toHaveCount(1);
  editor=await openNote(x,id);await fill(editor,'פרטי ההסעה המעודכנים','ההסעה יוצאת ב־10:00.');await save(editor);await expect(editor).toHaveCount(0);await acknowledged(page,{id,title:'פרטי ההסעה המעודכנים',body:'ההסעה יוצאת ב־10:00.',pinned:true});
  editor=await openNote(x,id);await pointClick(editor.locator('[data-action="toggle-event-note-pin"]'));await save(editor);await expect(editor).toHaveCount(0);await acknowledged(page,{id,title:'פרטי ההסעה המעודכנים',pinned:false});
  editor=await openNote(x,id);await pointClick(editor.locator('[data-action="toggle-event-note-pin"]'));await save(editor);await expect(editor).toHaveCount(0);await acknowledged(page,{id,pinned:true});
  editor=await openNote(x,id);const{dialog}=await openDelete(x,editor);await expect(dialog.locator('#event-note-delete-name')).toHaveText('פרטי ההסעה המעודכנים');await pointClick(dialog.locator('[data-action="confirm-important-action"]'));await expect(dialog).toHaveCount(0);await expect(editor).toHaveCount(0);await acknowledged(page,{id,deleted:true});await expect(x.list.locator('.event-note-open[data-note-id="'+id+'"]')).toHaveCount(0);await expect(x.list.locator('.event-note-row')).toHaveCount(3);
});

for(const operation of['create','edit','delete'])test('notes denied '+operation+' keeps the same draft or note and succeeds on explicit retry',async({page})=>{
  const x=await start(page);let editor=operation==='create'?await openNew(x):await openNote(x);
  const title='טיוטה שלא תאבד',body='הכתובת המעודכנת נשארת בטיוטה.';
  if(operation!=='delete')await fill(editor,title,body);
  const before=await page.evaluate(()=>({canonical:__friendInviteQa.canonicalWrites.length,personal:__friendInviteQa.snapshotWrites.length}));
  await page.evaluate(()=>__friendInviteQa.noteWriteMode='permission-all');
  if(operation==='delete'){const{dialog}=await openDelete(x,editor);await pointClick(dialog.locator('[data-action="confirm-important-action"]'));await expect(dialog).toHaveCount(0)}else await save(editor);
  await expect.poll(()=>page.evaluate(()=>__friendInviteQa.noteDeniedAttempts.length)).toBeGreaterThan(0);await expect(editor.locator('#event-note-error')).toBeVisible();await expect(editor.locator('[data-action="save-event-note"]')).toBeEnabled();
  expect(await page.evaluate(()=>({canonical:__friendInviteQa.canonicalWrites.length,personal:__friendInviteQa.snapshotWrites.length}))).toEqual(before);
  if(operation!=='delete'){await expect(editor.locator('[name="eventNoteTitle"]')).toHaveValue(title);await expect(editor.locator('[name="eventNoteBody"]')).toHaveValue(body)}else await expect(editor.locator('[name="eventNoteTitle"]')).toHaveValue('פרטי הלינה');
  await unchanged(page);await page.evaluate(()=>__friendInviteQa.noteWriteMode='ready');
  if(operation==='delete'){const{dialog}=await openDelete(x,editor);await pointClick(dialog.locator('[data-action="confirm-important-action"]'));await expect(dialog).toHaveCount(0);await expect(editor).toHaveCount(0);await acknowledged(page,{id:'note-lodging',deleted:true})}
  else{await save(editor);await expect(editor).toHaveCount(0);await acknowledged(page,{...(operation==='edit'?{id:'note-lodging'}:{}),title,body,pinned:operation==='edit'});expect(await page.evaluate(title=>__friendInviteQa.canonicalSnapshot.state.events[0].notes.filter(n=>n.title===title).length,title)).toBe(1)}
});

test('notes partial shared ACK retains one creation and retries the same ID without duplicate notes',async({page})=>{
  const x=await start(page),editor=await openNew(x);await fill(editor,'הזמנה משותפת','מספר ההזמנה 12345.');await page.evaluate(()=>__friendInviteQa.noteWriteMode='permission-shared');await save(editor);await expect(editor.locator('#event-note-error')).toContainText('עדיין לא התקבל אישור');await expect(editor.locator('[name="eventNoteTitle"]')).toHaveValue('הזמנה משותפת');
  expect(await page.evaluate(()=>__friendInviteQa.canonicalSnapshot.state.events[0].notes.some(n=>n.title==='הזמנה משותפת'))).toBe(false);
  const id=await editor.locator('.event-note-editor').getAttribute('data-note-id');expect(id).toBeTruthy();await page.evaluate(()=>__friendInviteQa.noteWriteMode='ready');await save(editor);await expect(editor).toHaveCount(0);await acknowledged(page,{id,title:'הזמנה משותפת',body:'מספר ההזמנה 12345.',pinned:false});
  expect(await page.evaluate(()=>__friendInviteQa.canonicalSnapshot.state.events[0].notes.filter(n=>n.title==='הזמנה משותפת').length)).toBe(1);
});

test('notes offline creation queues locally then replays the same note to shared and personal storage',async({page,context})=>{
  const x=await start(page),editor=await openNew(x);await fill(editor,'פרטי נסיעה אופליין','המידע נשמר במכשיר עד שהחיבור חוזר.');
  const before=await page.evaluate(()=>__friendInviteQa.canonicalWrites.length);await context.setOffline(true);await expect.poll(()=>page.evaluate(()=>navigator.onLine)).toBe(false);await save(editor);await expect(editor).toHaveCount(0);await expect(x.list.locator('.event-note-open').filter({hasText:'פרטי נסיעה אופליין'})).toBeVisible();
  expect(await page.evaluate(()=>__friendInviteQa.canonicalWrites.length)).toBe(before);await expect.poll(()=>page.evaluate(async()=>{const m=await import('/src/data/localStore.mjs');return m.pendingSharedSyncStatus().pending})).toBe(true);
  await context.setOffline(false);await expect.poll(()=>page.evaluate(()=>navigator.onLine)).toBe(true);await acknowledged(page,{title:'פרטי נסיעה אופליין',body:'המידע נשמר במכשיר עד שהחיבור חוזר.',pinned:false});expect(await page.evaluate(()=>__friendInviteQa.canonicalSnapshot.state.events[0].notes.filter(n=>n.title==='פרטי נסיעה אופליין').length)).toBe(1);
});

test('notes competing server title keeps the unconfirmed editor draft instead of reporting success',async({page})=>{
  const x=await start(page),editor=await openNote(x);await editor.locator('[name="eventNoteTitle"]').fill('הכותרת שלי לפני אישור');await page.evaluate(()=>__friendInviteQa.noteWriteMode='remote-title-conflict');await save(editor);await expect.poll(()=>page.evaluate(()=>__friendInviteQa.noteConflictAttempts.length)).toBe(1);await expect(editor.locator('#event-note-error')).toContainText('הפתק השתנה במכשיר אחר');await expect(editor.locator('[name="eventNoteTitle"]')).toHaveValue('הכותרת שלי לפני אישור');await expect(editor.locator('[data-action="save-event-note"]')).toBeEnabled();
  expect(await page.evaluate(()=>__friendInviteQa.canonicalSnapshot.state.events[0].notes.find(n=>n.id==='note-lodging').title)).toBe('פרטי הלינה עודכנו במכשיר אחר');await unchanged(page,{allowNotes:true});
});

test('notes system preference changes and orientation retain reachable editor content',async({page})=>{
  const x=await start(page,{width:320,height:390,system:true}),editor=await openNew(x);await geometry({...x,scope:editor,kind:'editor'});
  for(const[value,root]of[['extra-large',20],['system',32]]) {
    const access=editor.locator('[data-open-accessibility]');await pointClick(access);await pointClick(page.locator('.accessibility-segmented-control label:has(input[value="'+value+'"])'));await page.keyboard.press('Escape');await expect(access).toBeFocused();x.root=root;await geometry({...x,scope:editor,kind:'editor'});await navigation(page,'editor');
  }
  await page.setViewportSize({width:852,height:393});await geometry({...x,scope:editor,kind:'editor'});await navigation(page,'editor');await page.setViewportSize({width:320,height:852});await geometry({...x,scope:editor,kind:'editor'});await back(x,editor);await unchanged(page);
});
