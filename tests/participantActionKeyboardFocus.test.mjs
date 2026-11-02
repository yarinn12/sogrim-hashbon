import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{runInNewContext}from'node:vm';
const source=await readFile(process.env.PARTICIPANT_ACTION_TEST_APP||'src/app.mjs','utf8');const start=source.indexOf('function handleDialogKeydown(event) {'),end=source.indexOf('\nfunction ',start+10),handler=source.slice(start,end);
function cycle(shift,cssClass='event-participant-action-confirmation'){
 let focused;const cancel={offsetParent:{},inert:false,focus(){focused=this}},confirm={offsetParent:{},inert:false,focus(){focused=this}},backgroundButton={offsetParent:{},inert:false,focus(){focused=this}};
 const modal={closest:()=>null,querySelectorAll:()=>[cancel,confirm]},background={closest:()=>({}),contains:()=>true};focused=shift?cancel:confirm;let prevented=false;
 const ctx={expenseDatePickerOwnsEscape:()=>false,handleRadioGroupKeyboardNavigation:()=>false,handleFriendsHubTabKeyboardNavigation:()=>false,handleInputKeyboardShortcut:()=>false,handleEventSettingsPhotoKeydown:()=>false,settlementCloseConfirmation:false,document:{get activeElement(){return focused}},app:{querySelector:()=>background,querySelectorAll:()=>[backgroundButton]}};
 const event={key:'Tab',shiftKey:shift,target:{closest:s=>s.includes('.'+cssClass+'[role="alertdialog"]')?modal:null},preventDefault(){prevented=true}};
 runInNewContext('('+handler+')',ctx)(event);return{correct:focused===(shift?confirm:cancel),prevented};
}
test('participant confirmation Shift+Tab returns to its last foreground control',()=>assert.deepEqual(cycle(true),{correct:true,prevented:true}));
test('participant confirmation Tab cycles to its first foreground control',()=>assert.deepEqual(cycle(false),{correct:true,prevented:true}));
for(const name of['event-note-delete-confirmation','event-currency-confirmation'])test('existing '+name+' retains foreground keyboard ownership',()=>assert.deepEqual(cycle(true,name),{correct:true,prevented:true}));
