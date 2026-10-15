export const HOST_COHORT_CONTRACT=Object.freeze({version:5,name:'observed-owned-cohort-v5',scope:'observed-owned-cohort',selection:'union-before-afterDiscovery'});
const fields=['userTicks','systemTicks','runNs','runQueueWaitNs','timeslices'];
const scheduling=fields.slice(2),numeric=value=>typeof value==='string'&&/^\d+$/.test(value);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const key=(owner,tid,start)=>`${owner.pid}:${owner.startTicks}:${tid}:${start}`;

// Classify observations, not whole thread lifetimes. An absent terminal TID
// never receives an invented closing identity or a fabricated final counter.
export function classifyHostCohort(sample){
  const result={survivorsVerified:[],departedVerified:[],departedPartial:[],unobservedExits:[],observedOutsideCohort:[],unresolvedGaps:[]},seenIssues=new Set();
  const issue=(kind,tid,field,code)=>{
    const value={kind,...(tid===undefined?{}:{tid}),...(field===undefined?{}:{field}),...(code===undefined?{}:{code})};
    if(!seenIssues.has(JSON.stringify(value))){seenIssues.add(JSON.stringify(value));result.unresolvedGaps.push(value);}
  };
  const inv=sample.inventory,owner=sample.owner;
  if(inv?.coverageVersion!==5||inv.coverageContract!==HOST_COHORT_CONTRACT.name||inv.scope!==HOST_COHORT_CONTRACT.scope||inv.cohortSelection!==HOST_COHORT_CONTRACT.selection||inv.atomic!==false||inv.lifetimeCoverageProven!==false||inv.identityContinuityProven!==false||inv.allThreadsCoverageProven!==false||inv.rendererRoleProven!==false)issue('contract');
  const validIds=ids=>Array.isArray(ids)&&ids.includes(owner?.pid)&&ids.every((id,index)=>Number.isSafeInteger(id)&&id>0&&(!index||id>ids[index-1]));
  const inventories=[inv?.before,inv?.afterDiscovery,inv?.afterFinal,inv?.terminal];
  if(!inventories.every(validIds)||!['threads','identitiesAfterCounters','finalIdentities','unavailable','lifecycle'].every(name=>Array.isArray(sample[name]))){issue('malformed-observations');return result;}
  const [before,discovery,final,terminal]=inventories.map(ids=>new Set(ids));
  const observed=[...new Set(inventories.flat())].sort((a,b)=>a-b),targets=new Set([...before,...discovery]);
  if(!validIds(inv.cohort)||!same(inv.cohort,[...targets].sort((a,b)=>a-b)))issue('cohort-selection-mismatch');
  const records=new Map(),afterIds=new Map(),closing=new Map();
  for(const row of sample.threads){
    if(!Number.isSafeInteger(row.pid)||row.pid<1||records.has(row.pid))issue('counter-record-identity',row.pid);
    records.set(row.pid,row);
    if(!targets.has(row.pid)||row.emulatorPid!==owner.pid||row.emulatorStartTicks!==owner.startTicks||!numeric(row.startTicks)||!numeric(row.userTicks)||!numeric(row.systemTicks))issue('malformed-counter-record',row.pid);
    if(row.pid===owner.pid&&row.startTicks!==owner.startTicks)issue('main-identity',row.pid);
    const hasScheduling=scheduling.some(name=>Object.hasOwn(row,name));
    if(hasScheduling&&!scheduling.every(name=>numeric(row[name])))issue('malformed-scheduler-counters',row.pid);
    if(Object.hasOwn(row,'wchan')&&(typeof row.wchan!=='string'||!row.wchan))issue('malformed-wchan',row.pid);
  }
  for(const row of sample.identitiesAfterCounters){
    if(!targets.has(row.tid)||afterIds.has(row.tid)||row.pid!==row.tid||!numeric(row.startTicks))issue('counter-identity-reuse-or-malformed',row.tid);
    afterIds.set(row.tid,row);
  }
  for(const row of sample.finalIdentities){
    if(!targets.has(row.pid)||!final.has(row.pid)||closing.has(row.pid)||!numeric(row.startTicks)||row.emulatorPid!==owner.pid||row.emulatorStartTicks!==owner.startTicks||fields.some(name=>Object.hasOwn(row,name)))issue('closing-identity-malformed',row.pid);
    closing.set(row.pid,row);
    const record=records.get(row.pid),matched=!!record&&record.startTicks===row.startTicks;
    if(record&&!matched)issue('closing-identity-reuse',row.pid);
    if(row.identityVerified!==matched)issue('closing-identity-claim',row.pid);
  }
  if(sample.threadsScanned!==targets.size||sample.selectedThreads!==sample.threads.length||sample.finalIdentityReadCount!==[...final].filter(tid=>targets.has(tid)).length)issue('read-accounting');
  const lifecycleKeys=new Set();
  for(const event of sample.lifecycle){
    const lifecycleKey=JSON.stringify([event.tid,event.kind,event.phase]);
    if(lifecycleKeys.has(lifecycleKey))issue('duplicate-lifecycle',event.tid);
    lifecycleKeys.add(lifecycleKey);
    if(!observed.includes(event.tid)||!['tid-reused-during-read','tid-reused-before-final-identity','exited-during-sample','born-during-sample','unobserved-exit','observed-outside-cohort'].includes(event.kind))issue('malformed-lifecycle',event.tid);
    if(event.kind.startsWith('tid-reused'))issue('observed-identity-reuse',event.tid);
  }
  const gapsByTid=new Map(),gapKeys=new Set();
  for(const gap of sample.unavailable){
    if(!targets.has(gap.tid))issue('read-outside-cohort',gap.tid,gap.field);
    const gapKey=JSON.stringify([gap.tid,gap.field]);
    if(gapKeys.has(gapKey))issue('duplicate-read-gap',gap.tid,gap.field);
    gapKeys.add(gapKey);
    const list=gapsByTid.get(gap.tid)||[];list.push(gap);gapsByTid.set(gap.tid,list);
    const expectedPhase=gap.field==='identity-final'?'closing':before.has(gap.tid)?'initial':'newborn';
    const record=records.get(gap.tid),expectedStart=['stat','identity-final'].includes(gap.field)?undefined:record?.startTicks;
    if(gap.phase!==expectedPhase||gap.startTicks!==expectedStart)issue('read-gap-identity-or-phase',gap.tid,gap.field);
    if(gap.field==='wchan'&&gap.code==='ZERO_WCHAN'){
      if(records.get(gap.tid)?.wchan!=='0')issue('missing-zero-wchan-observation',gap.tid);
      continue;
    }
    if(!observed.includes(gap.tid)||!['stat','schedstat','wchan','identity-after','identity-final'].includes(gap.field))issue('malformed-read-gap',gap.tid,gap.field,gap.code);
    if(gap.code!=='ENOENT')issue('non-exit-read-error',gap.tid,gap.field,gap.code);
    else{
      if(terminal.has(gap.tid))issue('live-read-gap',gap.tid,gap.field,gap.code);
      const phase=gap.field==='identity-final'?'closing':gap.phase;
      const later=phase==='initial'?[discovery,final,terminal]:phase==='newborn'?[final,terminal]:phase==='closing'?[terminal]:null;
      if(!later)issue('missing-read-phase',gap.tid,gap.field);
      else if(later.some(ids=>ids.has(gap.tid)))issue('reappeared-after-enoent',gap.tid,gap.field);
      const record=records.get(gap.tid),post=afterIds.has(gap.tid),close=closing.has(gap.tid);
      const laterRead=gap.field==='stat'?!!record||post||close:
        gap.field==='schedstat'?!!record&&Object.hasOwn(record,'wchan')||post||close:
        gap.field==='wchan'?post||close:gap.field==='identity-after'?post||close:close;
      if(laterRead)issue('read-succeeded-after-enoent',gap.tid,gap.field);
    }
  }
  for(const tid of observed){
    let appeared=false,absentAfterAppearance=false;
    for(const ids of [before,discovery,final,terminal]){
      if(ids.has(tid)){if(absentAfterAppearance)issue('inventory-reappearance',tid);appeared=true;}
      else if(appeared)absentAfterAppearance=true;
    }
    if(!targets.has(tid)){
      result.observedOutsideCohort.push(tid);
      const events=sample.lifecycle.filter(event=>event.tid===tid),expected=[{tid,kind:'observed-outside-cohort',phase:final.has(tid)?'final':'terminal',startTicks:null,identity:null,counters:null}];
      if(!same(events,expected))issue('outside-cohort-observation-mismatch',tid);
      if(records.has(tid)||afterIds.has(tid)||closing.has(tid)||gapsByTid.has(tid))issue('read-outside-cohort',tid);
      continue;
    }
    const record=records.get(tid),post=afterIds.get(tid),close=closing.get(tid),gaps=gapsByTid.get(tid)||[];
    const hasGap=field=>gaps.some(gap=>gap.field===field&&gap.code==='ENOENT');
    const events=sample.lifecycle.filter(event=>event.tid===tid&&!event.kind.startsWith('tid-reused'));
    const expectedEvents=[];
    if(before.has(tid)&&(!discovery.has(tid)||!final.has(tid))){
      if(!record&&hasGap('stat')&&!discovery.has(tid)&&!final.has(tid))expectedEvents.push({tid,kind:'unobserved-exit',startTicks:null,identity:null,counters:null});
      else expectedEvents.push({tid,kind:'exited-during-sample',startTicks:record?.startTicks??null});
    }
    if(discovery.has(tid)&&!before.has(tid)){
      expectedEvents.push({tid,kind:'born-during-sample',phase:'discovery',startTicks:record?.startTicks??null});
      if(!final.has(tid))expectedEvents.push({tid,kind:'exited-during-sample',startTicks:record?.startTicks??null});
    }
    if(!same(events,expectedEvents))issue('lifecycle-observation-mismatch',tid);
    if(!record){
      if(!hasGap('stat'))issue('missing-initial-observation',tid);
      if(post||close)issue('identity-without-counter-observation',tid);
      if(terminal.has(tid))issue('unmeasured-live-task',tid);
      else if(hasGap('stat'))result.unobservedExits.push(tid);
      continue;
    }
    if(post&&(post.pid!==tid||post.startTicks!==record.startTicks))issue('counter-identity-reuse',tid);
    if(!post&&!hasGap('identity-after'))issue('missing-counter-identity-proof',tid);
    if(!scheduling.some(name=>Object.hasOwn(record,name))&&!hasGap('schedstat'))issue('unexplained-missing-scheduler-counters',tid);
    if(!Object.hasOwn(record,'wchan')&&!gaps.some(gap=>gap.field==='wchan'))issue('unexplained-missing-wchan',tid);
    const verified=fields.every(name=>numeric(record[name]))&&!!post&&post.pid===tid&&post.startTicks===record.startTicks;
    if(record.countersVerified!==verified)issue('counter-verification-claim',tid);
    if(final.has(tid)&&!close&&!hasGap('identity-final'))issue('missing-closing-identity-observation',tid);
    if(terminal.has(tid)){
      if(!verified||!close||close.identityVerified!==true||close.startTicks!==record.startTicks||gaps.some(gap=>gap.code!=='ZERO_WCHAN'))issue('unverified-live-survivor',tid);
      else result.survivorsVerified.push(tid);
    }else if(verified)result.departedVerified.push(tid);
    else result.departedPartial.push(tid);
  }
  return result;
}

const countFields=['coverageSamples','cohortTasksTargeted','survivorsVerified','nonMainSurvivorsVerified','departedVerified','departedPartial','unobservedExits','observedOutsideCohort','samplesWithOutsideCohort','unresolvedGaps','counterRecordsVerified','nonMainTasksMeasured','samplesWithUnobservedExits','newbornTasksMeasured','finalIdentitiesVerified'];
export function recordHostCohortInventory(summary,sample,priorCounters=new Map()){
  if(sample.owner.pid!==summary.owner.pid||sample.owner.startTicks!==summary.owner.startTicks)throw new Error('Host sample owner changed');
  for(const field of countFields)summary[field]??=0;
  summary.historyGaps??=[];summary.rejectedSamples??=[];
  const coverage=classifyHostCohort(sample),gaps=[...coverage.unresolvedGaps],pending=new Map();
  if(!same(sample.coverage,coverage)||sample.inventory.coverageComplete!==(gaps.length===0))gaps.push({kind:'coverage-declaration-mismatch'});
  const observed=new Set([sample.inventory.before,sample.inventory.afterDiscovery].filter(Array.isArray).flat());
  for(const tid of observed)if(priorCounters.get(key(summary.owner,tid,'unknown'))?.closed)gaps.push({tid,kind:'unobserved-departed-tid-reappeared'});
  for(const record of sample.threads){
    if(!numeric(record.startTicks))continue;
    const identity=key(summary.owner,record.pid,record.startTicks),previous=priorCounters.get(identity);
    if(previous?.closed)gaps.push({tid:record.pid,kind:'departed-identity-reappeared'});
    if(previous&&fields.some(field=>numeric(record[field])&&numeric(previous[field])&&BigInt(record[field])<BigInt(previous[field])))gaps.push({tid:record.pid,kind:'counter-decreased'});
    if(record.countersVerified)pending.set(identity,Object.fromEntries(fields.map(field=>[field,record[field]])));
  }
  if(gaps.length){
    summary.unresolvedGaps+=gaps.length;summary.historyGaps.push(...gaps.filter(gap=>!coverage.unresolvedGaps.includes(gap)));
    summary.rejectedSamples.push({atUtc:sample.atUtc,coverage,unresolvedGaps:gaps});
    const counterDecrease=gaps.some(gap=>gap.kind==='counter-decreased');
    throw new Error(counterDecrease?'Owned host task scheduler counter decreased':'Owned host task inventory/counter coverage is incomplete');
  }
  for(const[identity,counters]of pending)priorCounters.set(identity,counters);
  for(const tid of [...coverage.departedVerified,...coverage.departedPartial]){
    const record=sample.threads.find(row=>row.pid===tid),identity=key(summary.owner,tid,record.startTicks);
    priorCounters.set(identity,{...priorCounters.get(identity),...Object.fromEntries(fields.filter(field=>numeric(record[field])).map(field=>[field,record[field]])),closed:true});
  }
  for(const tid of coverage.unobservedExits)priorCounters.set(key(summary.owner,tid,'unknown'),{closed:true});
  summary.coverageSamples++;
  summary.cohortTasksTargeted+=sample.inventory.cohort.length;
  summary.observedOutsideCohort+=coverage.observedOutsideCohort.length;
  summary.samplesWithOutsideCohort+=coverage.observedOutsideCohort.length?1:0;
  for(const field of ['survivorsVerified','departedVerified','departedPartial','unobservedExits'])summary[field]+=coverage[field].length;
  summary.nonMainSurvivorsVerified+=coverage.survivorsVerified.filter(tid=>tid!==summary.owner.pid).length;
  const verified=sample.threads.filter(row=>row.countersVerified);
  summary.counterRecordsVerified+=verified.length;
  summary.nonMainTasksMeasured+=verified.filter(row=>row.pid!==summary.owner.pid).length;
  summary.samplesWithUnobservedExits+=coverage.unobservedExits.length?1:0;
  const newborn=new Set(sample.inventory.afterDiscovery.filter(tid=>!sample.inventory.before.includes(tid)));
  summary.newbornTasksMeasured+=verified.filter(row=>newborn.has(row.pid)).length;
  summary.finalIdentitiesVerified+=sample.finalIdentities.filter(row=>row.identityVerified).length;
}

export function requireHostCohortCoverage(summary){
  if(summary.coverageVersion!==5||summary.coverageContract!==HOST_COHORT_CONTRACT.name||summary.coverageScope!==HOST_COHORT_CONTRACT.scope||summary.cohortSelection!==HOST_COHORT_CONTRACT.selection||summary.inventoryAtomic!==false||summary.lifetimeCoverageProven!==false||summary.identityContinuityProven!==false||summary.allThreadsCoverageProven!==false||summary.rendererRoleProven!==false||
    ![summary.samples,...countFields.map(field=>summary[field])].every(value=>Number.isSafeInteger(value)&&value>=0)||
    summary.samples<2||summary.coverageSamples!==summary.samples||summary.nonMainSurvivorsVerified<1||summary.unresolvedGaps!==0||
    summary.survivorsVerified!==summary.samples+summary.nonMainSurvivorsVerified||summary.counterRecordsVerified!==summary.survivorsVerified+summary.departedVerified||
    summary.cohortTasksTargeted!==summary.survivorsVerified+summary.departedVerified+summary.departedPartial+summary.unobservedExits||
    summary.samplesWithOutsideCohort>summary.samples||summary.samplesWithOutsideCohort>summary.observedOutsideCohort||(summary.observedOutsideCohort===0)!==(summary.samplesWithOutsideCohort===0)||
    summary.nonMainTasksMeasured!==summary.nonMainSurvivorsVerified+summary.departedVerified||summary.finalIdentitiesVerified<summary.survivorsVerified||summary.finalIdentitiesVerified>summary.counterRecordsVerified||
    summary.newbornTasksMeasured>summary.nonMainTasksMeasured||summary.samplesWithUnobservedExits>summary.samples||summary.samplesWithUnobservedExits>summary.unobservedExits||
    (summary.unobservedExits===0)!==(summary.samplesWithUnobservedExits===0)||summary.capReached||summary.errors?.length||summary.historyGaps?.length||summary.rejectedSamples?.length)
    throw new Error('Observed cohort scheduling coverage is missing');
  return true;
}
