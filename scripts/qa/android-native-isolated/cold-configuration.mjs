// Keep the existing cold Native launch boundary: OS font changes must not
// trigger a second Activity relaunch in the still-foreground previous session.
export const QA_PACKAGE = 'com.sogrimhashbon.app.debug';
const PROCESS_QUERY = ['shell','pidof',QA_PACKAGE];

function requireAbsent(adbStatus,readbacks){
  const result=adbStatus(PROCESS_QUERY);
  const record={args:[...PROCESS_QUERY],status:result.status,stdout:result.stdout,stderr:result.stderr};
  readbacks.push(record);
  if(record.status===1&&record.stdout===''&&record.stderr==='')return;
  const pids=typeof record.stdout==='string'?record.stdout.trim():'';
  if(record.status===0&&typeof record.stderr==='string'&&record.stderr===''&&/^\d+(?:\s+\d+)*$/.test(pids))throw new Error('Owned QA process remained live during cold configuration: '+pids);
  throw new Error('Owned QA process observation failed: '+JSON.stringify(record));
}

export async function stopOwnedBeforeConfiguration({adb,adbStatus,sleep}){
  const receipt={stopCommand:['shell','am','force-stop',QA_PACKAGE],processReadbacks:[]};
  adb(receipt.stopCommand);
  // Match the driver's existing post-force-stop settle, without retrying an
  // input action or extending any test deadline.
  await sleep(500);
  requireAbsent(adbStatus,receipt.processReadbacks);
  return receipt;
}

function writeWhileStopped(adb,adbStatus,args,receipt){
  requireAbsent(adbStatus,receipt.processReadbacks);
  adb(args);
  receipt.writes.push([...args]);
  requireAbsent(adbStatus,receipt.processReadbacks);
}

export async function setColdFontScale({adb,adbStatus,sleep,value,settleMs=750}){
  if(value!==null&&(!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(String(value))||!Number.isFinite(Number(value))||Number(value)<=0))throw new Error('Require a declared positive OS font scale');
  const receipt=await stopOwnedBeforeConfiguration({adb,adbStatus,sleep});receipt.writes=[];
  writeWhileStopped(adb,adbStatus,value===null?['shell','settings','delete','system','font_scale']:['shell','settings','put','system','font_scale',String(value)],receipt);
  if(settleMs)await sleep(settleMs);
  requireAbsent(adbStatus,receipt.processReadbacks);
  const readback=adb(['shell','settings','get','system','font_scale']).trim();
  if(value===null?readback!=='null':!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(readback)||!Number.isFinite(Number(readback))||Math.abs(Number(readback)-Number(value))>.001)throw new Error('Cold OS font scale readback differs: '+readback);
  return {...receipt,readback,processAbsent:true};
}

export async function launchColdFontCase({adb,adbStatus,sleep,value,launchForOwnedOrientation,...orientation}){
  const coldConfiguration=await setColdFontScale({adb,adbStatus,sleep,value});
  return {...await launchForOwnedOrientation({...orientation,adb}),coldConfiguration};
}

export async function beginColdMatrix({adb,adbStatus,sleep}){
  const receipt=await stopOwnedBeforeConfiguration({adb,adbStatus,sleep});receipt.writes=[];
  writeWhileStopped(adb,adbStatus,['shell','settings','put','system','accelerometer_rotation','0'],receipt);
  return receipt;
}

export async function restoreColdMatrix({adb,adbStatus,sleep,original}){
  const receipt=await stopOwnedBeforeConfiguration({adb,adbStatus,sleep});receipt.writes=[];
  for(const [key,value] of Object.entries(original)){
    writeWhileStopped(adb,adbStatus,value==='null'?['shell','settings','delete','system',key]:['shell','settings','put','system',key,value],receipt);
  }
  writeWhileStopped(adb,adbStatus,['shell','wm','user-rotation','lock',original.user_rotation==='null'?'0':original.user_rotation],receipt);
  return receipt;
}

export async function restoreColdPages({adb,adbStatus,sleep,originalScale,originalRotation}){
  const receipt=await stopOwnedBeforeConfiguration({adb,adbStatus,sleep});receipt.writes=[];
  writeWhileStopped(adb,adbStatus,['shell','settings','put','system','font_scale',originalScale],receipt);
  writeWhileStopped(adb,adbStatus,['shell','wm','user-rotation','lock',originalRotation==='null'?'0':originalRotation],receipt);
  return receipt;
}

async function launchVerifiedPortrait({adb,launch,waitFor,launchForOwnedOrientation},coldConfiguration){
  try{
    const oriented=await launchForOwnedOrientation({adb,launch,waitFor,orientation:'portrait',rotation:0});
    return {page:oriented.page,coldConfiguration,rotationReceipt:oriented.receipt};
  }catch(error){error.coldConfiguration=coldConfiguration;throw error;}
}

export async function launchColdGeometry({adb,adbStatus,sleep,launch,waitFor,launchForOwnedOrientation}){
  const coldConfiguration=await setColdFontScale({adb,adbStatus,sleep,value:2,settleMs:0});
  await sleep(500);
  requireAbsent(adbStatus,coldConfiguration.processReadbacks);
  return launchVerifiedPortrait({adb,launch,waitFor,launchForOwnedOrientation},coldConfiguration);
}

export async function launchColdJourney({adb,adbStatus,sleep,launch,waitFor,launchForOwnedOrientation}){
  const coldConfiguration=await stopOwnedBeforeConfiguration({adb,adbStatus,sleep});coldConfiguration.writes=[];
  writeWhileStopped(adb,adbStatus,['shell','settings','put','system','font_scale','1'],coldConfiguration);
  writeWhileStopped(adb,adbStatus,['shell','settings','put','system','accelerometer_rotation','0'],coldConfiguration);
  return launchVerifiedPortrait({adb,launch,waitFor,launchForOwnedOrientation},coldConfiguration);
}
