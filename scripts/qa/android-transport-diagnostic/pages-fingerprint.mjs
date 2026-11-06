// Diagnostic evidence classifier only. It never changes a product/test outcome.
const PACKAGE='com.sogrimhashbon.app.debug';
const TIMEOUT='Actual owned QA Activity foreground before rotation timed out';
const at=value=>typeof value==='string'?Date.parse(value):NaN;
function logTime(monthDay,time,year){return at(`${year}-${monthDay}T${time}Z`);}
function processBlocks(stacks){
  const rows=[];
  for(const match of stacks.matchAll(/^----- pid (\d+) at (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}\.\d{3})\d*\+0000 -----\r?$/gm)){
    const end=new RegExp('^----- end '+match[1]+' -----\\r?$','gm');end.lastIndex=match.index+match[0].length;
    const last=end.exec(stacks);if(!last)continue;
    const body=stacks.slice(match.index+match[0].length,last.index);if(!/^Cmd line: com\.sogrimhashbon\.app\.debug\r?$/m.test(body))continue;
    const headings=[...body.matchAll(/^"([^"\n]+)"[^\n]*$/gm)];
    const threads=headings.map((h,i)=>({name:h[1],body:body.slice(h.index,headings[i+1]?.index??body.length)}));
    const main=threads.some(t=>t.name==='main'&&new RegExp('sysTid='+match[1]+'(?:\\s|$)').test(t.body)&&/DrawFrameTask::drawFrame/.test(t.body));
    const render=threads.some(t=>t.name==='RenderThread'&&/WebViewFunctor::drawGl/.test(t.body));
    const asg=threads.some(t=>/^(?:RenderThread|Chrome_InProcGpuThread)$/.test(t.name)&&/AddressSpaceStream::/.test(t.body)&&/(?:rcCreateSyncKHR_enc|glCreateProgram_enc)/.test(t.body));
    rows.push({pid:Number(match[1]),at:at(match[2]+'T'+match[3]+'Z'),graphics:main&&render,asg});
  }
  return rows;
}
function matchingEvidence({diagnostics,matrix,pages,acceptance,stacks,logcat}){
  const stages=acceptance.stages,pagesStage=stages[1],year=new Date(pagesStage.startedAtUtc).getUTCFullYear();
  const startMap=new Map();
  for(const line of new Set(logcat.split(/\r?\n/))){
    const m=line.match(/^(\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}\.\d{3}).*\bam_proc_start\s*:\s*\[0,(\d+),\d+,com\.sogrimhashbon\.app\.debug,/);
    if(m){const time=logTime(m[1],m[2],year);startMap.set(m[3]+'/'+time,{pid:Number(m[3]),at:time});}
  }
  const starts=[...startMap.values()].sort((a,b)=>a.at-b.at);starts.forEach((s,i)=>s.ordinal=i+1);
  const blocks=processBlocks(stacks),incidents=[];
  for(const line of new Set(diagnostics.targetAppAnrLines)){
    const m=line.match(/^(\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}\.\d{3}).*\bam_anr\s*:\s*\[0,(\d+),com\.sogrimhashbon\.app\.debug,.*Input dispatching timed out.*Waited (\d+)ms for FocusEvent\(hasFocus=true\)/);
    if(!m||!Number.isSafeInteger(Number(m[4]))||Number(m[4])<5000)continue;
    const pid=Number(m[3]),time=logTime(m[1],m[2],year),paired=blocks.filter(b=>b.pid===pid&&b.at>=time&&b.at<=time+5000);
    incidents.push({pid,at:time,reportedWaitMs:Number(m[4]),graphics:paired.some(b=>b.graphics),asg:paired.some(b=>b.graphics&&b.asg),dumpAt:paired.find(b=>b.graphics)?.at});
  }
  const attempts=pages.orientationAttempts,failed=attempts[2],previous=attempts[1];
  const profiles=new Set(matrix.results.map(r=>r.scale+'/'+r.orientation));
  const matrixComplete=matrix.results.length===6&&profiles.size===6&&[1,1.5,2].every(scale=>['portrait','landscape'].every(o=>profiles.has(scale+'/'+o)))&&matrix.results.every(r=>!r.error&&r.checks?.length===36&&r.checks.every(c=>c.ok===true));
  const observations=failed?.observations||[],anrViews=observations.filter(o=>o.focus?.includes('Application Not Responding: '+PACKAGE)&&o.phase==='foreground-before-request'&&o.viewport?.native===true&&o.viewport.platform==='android'&&o.viewport.orientation==='landscape'&&o.viewport.width>o.viewport.height&&o.actualDisplay?.rotation===1);
  const firstAt=at(anrViews[0]?.atUtc),lastAt=at(observations.at(-1)?.atUtc),previousAt=at(previous?.observations?.at(-1)?.atUtc);
  const profile=matrixComplete&&attempts[0]?.scale===1&&attempts[0]?.orientation==='portrait'&&!attempts[0].error&&attempts[0].commandApplications===1&&previous?.scale===1&&previous.orientation==='landscape'&&!previous.error&&previous.commandApplications===1&&failed?.scale===1.5&&failed.orientation==='portrait'&&failed.error===TIMEOUT&&failed.commandApplications===0&&pages.checks.some(c=>c.ok===false&&c.name.startsWith('1.5/portrait:')&&c.name.includes(TIMEOUT))&&stages[0].exitCode===0&&pagesStage.exitCode===1&&stages[2].exitCode===0&&Number.isFinite(firstAt)&&lastAt>=firstAt&&previousAt<firstAt;
  const latest=starts.filter(s=>s.at<=firstAt).at(-1);
  const candidates=profile&&latest?.ordinal===16&&latest.at>=at(pagesStage.startedAtUtc)?incidents.filter(i=>i.pid===latest.pid&&i.at>=latest.at&&i.at>previousAt&&i.at<=firstAt&&i.at<=at(pagesStage.completedAtUtc)):[];
  return {graphicsFocusAnr:incidents.some(i=>i.graphics),matched:candidates.length===1&&candidates[0].graphics?{...candidates[0],launchOrdinal:latest.ordinal,profile:'pages150portrait'}:null,mainProcessStarts:starts.length,matrixComplete};
}
export function inspectPagesArm({id,transport,diagnostics,matrix,pages,journey,acceptance,stacks,logcat,stageCodes,integrity},{source,tree}){
  const sourceMatches=value=>value?.sourceCommit===source&&value?.sourceTree===tree;
  const lines=diagnostics?.targetAppAnrLines||[],targetAnr=Array.isArray(lines)&&lines.length>0,stages=acceptance?.stages;
  const valid=integrity===true&&diagnostics?.source===source&&diagnostics.ownershipVerified===true&&diagnostics.diagnosticsComplete===true&&diagnostics.continuousLogCaptured===true&&Array.isArray(diagnostics.targetAppAnrLines)&&sourceMatches(matrix?.provenance)&&sourceMatches(pages?.provenance)&&sourceMatches(journey?.provenance)&&Array.isArray(matrix.results)&&Array.isArray(pages.orientationAttempts)&&Array.isArray(pages.checks)&&Array.isArray(journey.checks)&&Array.isArray(journey.exceptions)&&stages?.length===3&&stages.every((s,i)=>s.name===['matrix','pages','journey'][i]&&Number.isFinite(at(s.startedAtUtc))&&at(s.completedAtUtc)>=at(s.startedAtUtc))&&at(stages[0].completedAtUtc)<=at(stages[1].startedAtUtc)&&at(stages[1].completedAtUtc)<=at(stages[2].startedAtUtc)&&typeof logcat==='string'&&logcat.includes('am_proc_start')&&typeof stacks==='string'&&Array.isArray(stageCodes)&&stageCodes.length>0;
  const evidence=valid?matchingEvidence({diagnostics,matrix,pages,acceptance,stacks,logcat}):{graphicsFocusAnr:false,matched:null};
  const commandFailure=!Array.isArray(stageCodes)||stageCodes.some(c=>c.exitCode!==0||c.error||c.signal);
  const clean=valid&&!commandFailure&&!targetAnr&&diagnostics.anrHistoryReady===true&&acceptance.ready===true&&stages.every(s=>s.exitCode===0)&&evidence.matrixComplete&&pages.samples?.length===24&&pages.checks.length===325&&pages.checks.every(c=>c.ok===true)&&journey.checks.length===8&&journey.checks.every(c=>c.ok===true)&&journey.exceptions.length===0;
  const matchesFailureSignature=Boolean(evidence.matched),matchesOriginal=transport==='asg'&&matchesFailureSignature&&evidence.matched.asg;
  return {id,transport,source,valid,targetAnr,graphicsFocusAnr:evidence.graphicsFocusAnr,matchesFailureSignature,matchesOriginal,clean,commandFailure,stageCodes,evidence,
    invalidReason:valid?null:'Required source, integrity, complete workload or event evidence is absent'};
}
