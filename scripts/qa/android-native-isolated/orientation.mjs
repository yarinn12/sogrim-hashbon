export const nativeOrientationExpression=`(() => ({width:innerWidth,height:innerHeight,orientation:matchMedia('(orientation: portrait)').matches?'portrait':'landscape',native:Capacitor.isNativePlatform(),platform:Capacitor.getPlatform()}))()`;
const activity='com.sogrimhashbon.app.debug/com.sogrimhashbon.app.MainActivity';

export function actualDefaultDisplay(raw){
  const headers=[...raw.matchAll(/^\s*Display:\s*mDisplayId=(\d+)(?=\s|$)/gm)],defaults=headers.filter(match=>match[1]==='0');
  if(defaults.length!==1)throw new Error('Require one actual default display section');
  const start=defaults[0].index,end=headers.find(match=>match.index>start)?.index??raw.length,block=raw.slice(start,end);
  const rotations=[...block.matchAll(/^\s*mRotation=(ROTATION_(?:0|90|180|270)|[0-3])(?=\s|$)/gm)],bounds=[...block.matchAll(/\bcur=(\d+)x(\d+)\b/g)];
  if(rotations.length!==1||bounds.length!==1)throw new Error('Actual default display rotation/bounds are missing or ambiguous');
  const value=rotations[0][1],rotation=value.startsWith('ROTATION_')?Number(value.slice(9))/90:Number(value),width=Number(bounds[0][1]),height=Number(bounds[0][2]);
  if(width<=0||height<=0)throw new Error('Actual default display bounds are invalid');
  return {displayId:0,rotation,width,height};
}

// The launch force-stop exposes a NOSENSOR launcher. Request rotation only after
// the real QA Activity is foreground; a successful shell command is not proof.
export async function launchForOwnedOrientation({launch,adb,waitFor,orientation,rotation,timeout=12000,onPage}){
  if(!['portrait','landscape'].includes(orientation)||rotation!==(orientation==='portrait'?0:1)||!Number.isFinite(timeout)||timeout<=0)throw new Error('Require an exact QA orientation/rotation and bounded timeout');
  const receipt={orientation,rotation,commandApplications:0,observations:[]};
  const page=await launch();onPage?.(page);
  const deadline=Date.now()+timeout;
  const remaining=()=>{const value=deadline-Date.now();if(value<=0)throw new Error('Actual owned orientation deadline exceeded');return value;};
  async function observe(phase){
    const windows=adb(['shell','dumpsys','window','windows']);
    const focus=windows.split(/\r?\n/).find(line=>line.includes('mCurrentFocus='))?.trim()||'';
    const viewport=await page.evaluate(nativeOrientationExpression);
    const nativeDisplayRaw=adb(['shell','dumpsys','window','displays']);let actualDisplay,displayParseError;
    try{actualDisplay=actualDefaultDisplay(nativeDisplayRaw);}catch(error){displayParseError=error.message;}
    const observation={phase,atUtc:new Date().toISOString(),focus,viewport,nativeDisplayRaw,actualDisplay,displayParseError,userRotation:adb(['shell','wm','user-rotation']).trim(),settingRotation:adb(['shell','settings','get','system','user_rotation']).trim(),accelerometer:adb(['shell','settings','get','system','accelerometer_rotation']).trim()};
    receipt.observations.push(observation);
    return observation;
  }
  const foreground=value=>value.focus.includes(activity)&&value.viewport.native===true&&value.viewport.platform==='android';
  try{
    await waitFor(async()=>{const value=await observe('foreground-before-request');return foreground(value)&&value;},'Actual owned QA Activity foreground before rotation',remaining());
    adb(['shell','wm','user-rotation','lock',String(rotation)]);receipt.commandApplications++;
    receipt.readback=await waitFor(async()=>{const value=await observe('after-request'),v=value.viewport,d=value.actualDisplay;return foreground(value)&&value.userRotation===`lock ${rotation}`&&value.settingRotation===String(rotation)&&value.accelerometer==='0'&&d?.rotation===rotation&&(orientation==='portrait'?d.height>d.width:d.width>d.height)&&Number.isFinite(v.width)&&Number.isFinite(v.height)&&v.width>0&&v.height>0&&v.orientation===orientation&&(orientation==='portrait'?v.height>v.width:v.width>v.height)&&value;},'Actual '+orientation+' OS lock and Native viewport',remaining());
    receipt.nativeDisplay=receipt.readback.nativeDisplayRaw;
    return {page,receipt};
  }catch(error){receipt.error=error.message;error.rotationReceipt=receipt;if(!onPage)page.close();throw error;}
}
