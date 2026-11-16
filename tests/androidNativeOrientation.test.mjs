import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {launchForOwnedOrientation,actualDefaultDisplay,actualDefaultDisplayFocus} from '../scripts/qa/android-native-isolated/orientation.mjs';

// A boundary adapter models the observed force-stop -> NOSENSOR home -> QA
// launch reset. These are tool regression tests, never Native acceptance data.
function boundary({wrongViewport=false,wrongLock=false,wrongDisplay=false,foreignFocus=false,missingFocus=false,native=true,commandError=false}={}){
  const events=[];let rotation=0,closed=0,foreground=false;
  const page={evaluate:async()=>({width:wrongViewport||rotation===0?411:914,height:wrongViewport||rotation===0?866:363,orientation:wrongViewport||rotation===0?'portrait':'landscape',native,platform:'android'}),close:()=>closed++};
  const launch=async()=>{events.push('launch');rotation=0;foreground=true;return page;};
  const adb=args=>{
    if(args[1]==='dumpsys'&&args[3]==='windows')return '';
    if(args[1]==='dumpsys'&&args[3]==='displays'){const actual=wrongDisplay?0:rotation;return 'Display: mDisplayId=0\n  init=1080x2400 420dpi cur='+(actual===0?'1080x2400':'2400x1080')+' app=1080x2400\n'+(missingFocus?'':'  mCurrentFocus=Window{1 u0 '+(foreground&&!foreignFocus?'com.sogrimhashbon.app.debug/com.sogrimhashbon.app.MainActivity':'com.google.android.apps.nexuslauncher/com.google.android.apps.nexuslauncher.NexusLauncherActivity')+'}\n')+'  DisplayRotation\n    mRotation='+actual+' mDeferredRotationPauseCount=0\n    mUserRotationMode=USER_ROTATION_LOCKED mUserRotation=ROTATION_'+(rotation*90);}
    if(args[1]==='wm'&&args[3]==='lock'){events.push('request:'+args[4]);if(commandError)throw new Error('Owned wm request failed');rotation=Number(args[4]);return '';}
    if(args[1]==='wm')return 'lock '+(wrongLock?0:rotation);
    if(args[1]==='settings'&&args[4]==='user_rotation')return String(rotation);
    if(args[1]==='settings'&&args[4]==='accelerometer_rotation')return '0';
    throw new Error('Unexpected boundary command '+args.join(' '));
  };
  const waitFor=async(predicate,label,timeout)=>{assert.ok(timeout>0&&timeout<=15000);const value=await predicate();if(!value)throw new Error(label+' timed out');return value;};
  return {launch,adb,waitFor,page,events,closed:()=>closed};
}
test('a launcher reset cannot undo rotation requested after actual QA foreground',async()=>{
  const b=boundary(),owned=[];const {page,receipt}=await launchForOwnedOrientation({...b,onPage:p=>owned.push(p),orientation:'landscape',rotation:1,timeout:15000});
  assert.deepEqual(b.events,['launch','request:1']);assert.equal(page,b.page);assert.deepEqual(owned,[b.page]);assert.equal(receipt.commandApplications,1);assert.equal(receipt.readback.viewport.width,914);assert.equal(receipt.readback.userRotation,'lock 1');assert.equal(receipt.observations[0].phase,'foreground-before-request');
});
test('a successful wm command with a portrait viewport still fails landscape acceptance',async()=>{
  const b=boundary({wrongViewport:true});await assert.rejects(launchForOwnedOrientation({...b,orientation:'landscape',rotation:1}),error=>{assert.match(error.message,/Actual landscape OS lock and Native viewport timed out/);assert.equal(error.rotationReceipt.commandApplications,1);assert.equal(error.rotationReceipt.observations.at(-1).viewport.orientation,'portrait');return true;});assert.deepEqual(b.events,['launch','request:1']);assert.equal(b.closed(),1);
});
test('a landscape viewport cannot replace actual locked OS rotation readback',async()=>{const b=boundary({wrongLock:true});await assert.rejects(launchForOwnedOrientation({...b,orientation:'landscape',rotation:1}),/Actual landscape OS lock and Native viewport timed out/);assert.equal(b.events.filter(e=>e==='request:1').length,1);});
test('a launcher or foreign Activity must not receive the orientation request',async()=>{const b=boundary({foreignFocus:true});await assert.rejects(launchForOwnedOrientation({...b,orientation:'landscape',rotation:1}),/foreground before rotation timed out/);assert.deepEqual(b.events,['launch']);});
test('desktop viewport data is rejected before any Native orientation input',async()=>{const b=boundary({native:false});await assert.rejects(launchForOwnedOrientation({...b,orientation:'landscape',rotation:1}),/foreground before rotation timed out/);assert.deepEqual(b.events,['launch']);});
test('a failed owned rotation input propagates once and retains its receipt',async()=>{const b=boundary({commandError:true});await assert.rejects(launchForOwnedOrientation({...b,orientation:'landscape',rotation:1}),error=>{assert.equal(error.message,'Owned wm request failed');assert.equal(error.rotationReceipt.observations.length,1);return true;});assert.deepEqual(b.events,['launch','request:1']);});
test('portrait also requires matching real OS and Native viewport',async()=>{const b=boundary();const {receipt}=await launchForOwnedOrientation({...b,orientation:'portrait',rotation:0});assert.equal(receipt.readback.viewport.orientation,'portrait');assert.equal(receipt.readback.userRotation,'lock 0');assert.deepEqual(b.events,['launch','request:0']);});
test('invalid orientation/rotation pairs fail before launching or changing the device',async()=>{const b=boundary();await assert.rejects(launchForOwnedOrientation({...b,orientation:'landscape',rotation:0}),/exact QA orientation/);assert.deepEqual(b.events,[]);});
test('lock1 and a wide Native viewport cannot replace actual portrait display rotation',async()=>{const b=boundary({wrongDisplay:true});await assert.rejects(launchForOwnedOrientation({...b,orientation:'landscape',rotation:1}),error=>{const last=error.rotationReceipt.observations.at(-1);assert.equal(last.userRotation,'lock 1');assert.equal(last.viewport.orientation,'landscape');assert.equal(last.actualDisplay.rotation,0);assert.equal(last.actualDisplay.width,1080);return true;});assert.deepEqual(b.events,['launch','request:1']);});
test('default display parser separates actual rotation from user preference and other displays',()=>{const raw='Display: mDisplayId=4\n cur=400x600\n mRotation=0\nDisplay: mDisplayId=0 (organized)\n init=1080x2400 cur=2400x1080 app=2400x952\n DisplayRotation\n mRotation=1 mDeferredRotationPauseCount=0\n mUserRotation=ROTATION_0\nDisplay: mDisplayId=7\n cur=700x900\n mRotation=0';assert.deepEqual(actualDefaultDisplay(raw),{displayId:0,rotation:1,width:2400,height:1080});});
test('default display parser supports named actual rotations without reading mUserRotation',()=>{assert.equal(actualDefaultDisplay('Display: mDisplayId=0\n cur=2400x1080\n mRotation=ROTATION_90\n mUserRotation=ROTATION_0').rotation,1);});
test('missing or ambiguous actual default display evidence is rejected',()=>{for(const raw of ['Display: mDisplayId=2\n cur=1080x2400\n mRotation=0','Display: mDisplayId=0\n cur=1080x2400\n mUserRotation=ROTATION_90','Display: mDisplayId=0\n cur=1080x2400\n mRotation=0\n mRotation=1','Display: mDisplayId=0\n cur=1080x2400\n mRotation=0\nDisplay: mDisplayId=0\n cur=2400x1080\n mRotation=1'])assert.throws(()=>actualDefaultDisplay(raw),/actual default display/i);});

function recordedDisplayBoundary(raw){
  const events=[],page={evaluate:async()=>({width:411,height:866,orientation:'portrait',native:true,platform:'android'}),close:()=>{}};
  const launch=async()=>{events.push('launch');return page;};
  const adb=args=>{
    // The failed source recorded empty focus from the windows listing. Its
    // exact raw windows text was not retained; raw displays is frozen above.
    if(args[1]==='dumpsys'&&args[3]==='windows')return '';
    if(args[1]==='dumpsys'&&args[3]==='displays')return raw;
    if(args[1]==='wm'&&args[3]==='lock'){events.push('request:'+args[4]);return '';}
    if(args[1]==='wm')return 'lock 0';
    if(args[1]==='settings')return '0';
    throw new Error('Unexpected recorded boundary command');
  };
  const waitFor=async(predicate,label)=>{const value=await predicate();if(!value)throw new Error(label+' timed out');return value;};
  return {launch,adb,waitFor,events};
}
test('recorded API36.1 Display0 foreground is accepted when window listing has no focus field',async()=>{
  const raw=readFileSync(new URL('./fixtures/android-native-api36-display0.txt',import.meta.url),'utf8');
  assert.equal(createHash('sha256').update(raw).digest('hex'),'8f0639c2aa6dc1632d9c4646b225bfbc32afb95d39dfd02db0a1a8832b69e60f');
  const b=recordedDisplayBoundary(raw),{receipt}=await launchForOwnedOrientation({...b,orientation:'portrait',rotation:0});
  assert.match(receipt.readback.focus,/^mCurrentFocus=Window\{[^\n]*com.sogrimhashbon.app.debug\/com.sogrimhashbon.app.MainActivity/);
  assert.deepEqual(receipt.readback.actualDisplay,{displayId:0,rotation:0,width:1080,height:2400});assert.deepEqual(b.events,['launch','request:0']);
});

test('foreground parser reads only Display0 and ignores another display with the QA Activity',()=>{
  const owner='mCurrentFocus=Window{1 u0 com.sogrimhashbon.app.debug/com.sogrimhashbon.app.MainActivity}',launcher='mCurrentFocus=Window{2 u0 com.google.android.apps.nexuslauncher/.NexusLauncherActivity}';
  assert.equal(actualDefaultDisplayFocus('Display: mDisplayId=4\n '+owner+'\nDisplay: mDisplayId=0\n '+launcher+'\nDisplay: mDisplayId=7\n '+owner),launcher);
});
test('missing or ambiguous default display focus is rejected without falling back to focused app',()=>{
  for(const raw of ['Display: mDisplayId=0\n mFocusedApp=ActivityRecord{QA}','Display: mDisplayId=0\n mCurrentFocus=Window{one}\n mCurrentFocus=Window{two}','Display: mDisplayId=4\n mCurrentFocus=Window{QA}'])assert.throws(()=>actualDefaultDisplayFocus(raw),/actual default display/i);
});
test('unknown default display focus schema retains raw evidence and receives no rotation input',async()=>{
  const b=boundary({missingFocus:true});await assert.rejects(launchForOwnedOrientation({...b,orientation:'landscape',rotation:1}),error=>{const last=error.rotationReceipt.observations.at(-1);assert.match(last.focusParseError,/default display focus/);assert.match(last.nativeDisplayRaw,/Display: mDisplayId=0/);assert.equal(error.rotationReceipt.commandApplications,0);return true;});assert.deepEqual(b.events,['launch']);
});
test('recorded ANR window is rejected despite owned focused app and responsive Native WebView',async()=>{
  const raw=readFileSync(new URL('./fixtures/android-native-api36-anr-display0.txt',import.meta.url),'utf8');
  assert.equal(createHash('sha256').update(raw).digest('hex'),'e708aa23f1314e87f90c5ffbbec8293bbd1d7bb6245db7b974bfe71b55d5241c');
  assert.match(raw,/mFocusedApp=ActivityRecord\{[^\n]*com.sogrimhashbon.app.debug\/com.sogrimhashbon.app.MainActivity/);
  const b=recordedDisplayBoundary(raw);await assert.rejects(launchForOwnedOrientation({...b,orientation:'portrait',rotation:0}),error=>{
    const last=error.rotationReceipt.observations.at(-1);assert.match(last.focus,/Application Not Responding: com.sogrimhashbon.app.debug/);assert.equal(last.viewport.native,true);assert.equal(error.rotationReceipt.commandApplications,0);return true;
  });assert.deepEqual(b.events,['launch']);
});
