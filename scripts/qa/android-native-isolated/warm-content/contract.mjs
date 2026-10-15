import {matrixExitCode} from '../matrix-verdict.mjs';
import {APP_SOURCE,APP_TREE,CONTROL_INDEX_SHA256,SIGNATURE_MEMBER_ALLOWLIST} from './apk-members.mjs';

export function requirePair(manifest){
  if(manifest?.appSource!==APP_SOURCE||manifest.appTree!==APP_TREE||manifest.schemaVersion!==1||manifest.nativeAcceptance!==false||manifest.fixtureOnly!==true||manifest.productLineageVerified!==true||manifest.requiredSignerVerification!==true||manifest.reviewedControlIndexSha256!==CONTROL_INDEX_SHA256||!Array.isArray(manifest.changedMembers)||!manifest.changedMembers.includes('assets/public/index.html')||manifest.changedMembers.some(n=>n!=='assets/public/index.html'&&!SIGNATURE_MEMBER_ALLOWLIST.includes(n))||!['A','B'].every(k=>typeof manifest.variants?.[k]?.path==='string'&&/^[a-f0-9]{64}$/.test(manifest.variants[k].apkSha256||'')))throw new Error('Require freshly verified c14 product/minimal-index APK pair');
  return manifest;
}
export function validateWarmPrelude(results,font){
  const warm=results?.[0],cut=results?.[1];
  const valid=font?.ready===true&&font.osScaleRestore?.exact===true&&warm?.scale===1&&warm.orientation==='portrait'&&!warm.error&&warm.checks?.length===36&&warm.checks.every(c=>c.ok===true)&&warm.nativeHolds?.length===1&&warm.nativeHolds[0].durationMs===650&&warm.capabilities?.fontScale===1&&warm.rotationReceipt?.commandApplications===1&&warm.holdRotationReceipt?.commandApplications===1&&warm.exceptions?.length===0&&warm.holdExceptions?.length===0&&results.length===2&&cut.scale===1&&cut.orientation==='landscape'&&cut.warmContentCut===true&&cut.checks?.length===0&&cut.nativeHolds?.length===0;
  return {valid:Boolean(valid),warmChecks:warm?.checks?.length??0,warmHolds:warm?.nativeHolds?.length??0,originalMatrixVerdict:matrixExitCode(results||[]),nativeAcceptance:false};
}
function attributedHistory(closed,target){
  const lines=closed?.targetAppAnrLines;
  if(!Array.isArray(lines))return {parsed:false,targetAnr:false,unattributed:true};
  const pids=lines.filter(l=>/\bam_anr\s*:/.test(l)).map(l=>/\bam_anr\s*:\s*\[[^,]*,(\d+),com\.sogrimhashbon\.app\.debug,/.exec(l)?.[1]);
  return {parsed:true,targetAnr:lines.length>0,unattributed:lines.length>0&&(!pids.length||pids.some(pid=>pid!==String(target?.newPid)))};
}
export function warmOutcome(report){
  const history=attributedHistory(report.closedLog,report.target);
  // A parsed, owned closed log with a positive ANR is complete evidence. It must
  // still fail the unchanged ANR gate and actual exit status.
  const evidenceComplete=report.errors?.length===0&&report.trace?.captureComplete===true&&report.anr?.diagnosticsComplete===true&&report.closedLog?.logcatClosed===true&&Boolean(report.closedLog?.file?.sha256)&&history.parsed&&report.cleanup?.complete===true;
  const target=report.target;
  const factorTested=report.prelude?.valid===true&&target?.prelude?.valid===true&&target.preludeHistoryReady===true&&target.cutPostureVerified===true&&target.installVerified===true&&target.pairVerified===true&&target.clockAnchorsComplete===true&&!target.clockError&&!target.pidError&&Number.isSafeInteger(target.newPid)&&target.newPid>1&&target.newPid!==target.warmPid&&target.rotationRequested===false&&target.holdRequested===false&&target.pmClearRequested===false&&!history.unattributed;
  const positiveAnrObservation=evidenceComplete&&factorTested&&history.targetAnr;
  const variantReady=target?.variant==='A'?target.productNativeReady===true:target?.controlFixtureReady===true;
  const successfulObservation=evidenceComplete&&factorTested&&!history.targetAnr&&!target.error&&target.foregroundBeforeRotationReached===true&&variantReady;
  return {evidenceComplete,factorTested,anrObserved:history.targetAnr,positiveAnrObservation,successfulObservation,observation:positiveAnrObservation?'positive-target-anr':successfulObservation?'no-target-anr-observed':factorTested?'inconclusive-target-failure':'factor-not-tested',exitCode:successfulObservation&&report.anr?.anrHistoryReady===true&&report.closedLog?.anrHistoryReady===true?0:1,nativeAcceptance:false,releaseAuthorized:false};
}
export function contentContrast(reports){
  const order=['A','B','B','A'];
  if(reports.length!==4||reports.some((r,i)=>r.target?.variant!==order[i]||r.nativeAcceptance!==false))throw new Error('Require four original fresh-AVD ABBA reports');
  const complete=reports.every(r=>r.evidenceComplete&&r.factorTested),aReproduced=complete&&reports.some(r=>r.target.variant==='A'&&r.positiveAnrObservation),bWithoutAnr=complete&&reports.filter(r=>r.target.variant==='B').every(r=>r.successfulObservation);
  const pair=reports[0].target.pairHashes,bootIds=reports.map(r=>r.target.bootId);
  const samePair=Boolean(pair)&&reports.every(r=>JSON.stringify(r.target.pairHashes)===JSON.stringify(pair));
  const freshGuests=bootIds.every(id=>typeof id==='string'&&id.length>0)&&new Set(bootIds).size===4;
  return {complete:complete&&samePair&&freshGuests,aReproduced,descriptiveContrastObserved:complete&&samePair&&freshGuests&&aReproduced&&bWithoutAnr,installerConfoundRetained:true,causalAttributionAuthorized:false,nativeAcceptance:false};
}
