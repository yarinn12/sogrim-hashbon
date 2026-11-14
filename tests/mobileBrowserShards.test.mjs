import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyMobileShards,SCOPE_SKIPS_BY_PROJECT} from '../scripts/qa/verify-large-text-shards.mjs';
const frozen=JSON.parse(readFileSync(new URL('../scripts/qa/mobile-scope-skips.json',import.meta.url),'utf8'));
const keyboardScope=JSON.parse(readFileSync(new URL('./fixtures/keyboard-scroll-reflow-scope-qa518.json',import.meta.url),'utf8'));
const source='a'.repeat(40),tree='b'.repeat(40),runId='123',runAttempt='1';
const clone=x=>structuredClone(x);
function fixture(project){
  const scopeIds=SCOPE_SKIPS_BY_PROJECT.get(project);
  const cases=[...Array.from({length:1203-scopeIds.size},(_,i)=>({id:'ordinary-'+i,title:'ordinary '+i,file:'synthetic.spec.mjs'})),
    ...[...scopeIds].map(id=>frozen.projects[project]?.find(row=>row.id===id)??{id,title:id,file:'synthetic.spec.mjs'})];
  const spec=row=>({...row,tests:[{projectName:project,expectedStatus:'passed',status:'skipped',results:[]}]});
  const report=rows=>({suites:[{specs:rows.map(spec)}],errors:[],stats:{expected:0,skipped:0,unexpected:0,flaky:0}});
  const shardCount=8,planned=Object.fromEntries(Array.from({length:8},(_,i)=>[i+1,report(cases.filter((_,j)=>j%8===i))]));
  const actual=clone(planned);
  for(const r of Object.values(actual))for(const s of r.suites[0].specs){
    const t=s.tests[0],skip=scopeIds.has(s.id);
    t.expectedStatus=skip?'skipped':'passed';t.status=skip?'skipped':'expected';
    t.results=[{status:skip?'skipped':'passed',retry:0}];
    if(skip){t.annotations=[{type:'skip',description:'Existing profile scope'}];r.stats.skipped++;}else r.stats.expected++;
  }
  return {project,source,tree,runId,runAttempt,shardCount,inventory:report(cases),planned,actual,
    receipts:Object.fromEntries(Array.from({length:8},(_,i)=>[i+1,{project,source,tree,runId,runAttempt,shard:i+1,shardCount}]))};
}

function withObservedKeyboardScopes(project){
  const f=fixture(project),visit=(report,fn)=>report.suites[0].specs.forEach(fn);
  for(const [index,row]of keyboardScope.cases.entries()){
    const exists=f.inventory.suites[0].specs.some(s=>s.id===row.id);
    const replaced=exists?row.id:'ordinary-'+index;
    for(const report of [f.inventory,...Object.values(f.planned),...Object.values(f.actual)])
      visit(report,s=>{if(s.id===replaced)Object.assign(s,row);});
    for(const report of Object.values(f.actual))visit(report,s=>{
      if(s.id!==row.id)return;
      const t=s.tests[0],wasSkipped=t.expectedStatus==='skipped';
      t.expectedStatus='skipped';t.status='skipped';t.annotations=[{type:'skip',description:keyboardScope.existingReason}];
      t.results=[{status:'skipped',retry:0}];
      if(!wasSkipped){report.stats.expected--;report.stats.skipped++;}
    });
  }
  return f;
}

test('original reflow keyboard cases retain their existing touch-only scope and exact identities',()=>{
  const declaration=readFileSync(new URL('../e2e/keyboard-scroll-intent.spec.mjs',import.meta.url),'utf8');
  assert.ok(declaration.includes("test.skip(!info.project.use.hasTouch, '"+keyboardScope.existingReason+"')"));
  assert.equal(keyboardScope.cases.length,2);
  assert.equal(verifyMobileShards(withObservedKeyboardScopes('reflow-200')).count,1203);
});

test('a reflow-only keyboard scope cannot excuse missing execution on a touch profile',()=>{
  assert.throws(()=>verifyMobileShards(withObservedKeyboardScopes('android-mobile')),
    /missing, failed, retried or skipped result/);
});
for(const project of SCOPE_SKIPS_BY_PROJECT.keys()){
  test(project+' eight shards retain every source case and exact existing profile scopes',()=>{
    const f=fixture(project),r=verifyMobileShards(f);
    assert.equal(r.count,1203);
    assert.equal(r.shardCount,8);assert.equal(Object.values(r.shards).reduce((a,b)=>a+b,0),r.count);
  });
  test(project+' cannot accept absent, extra, duplicate, stale, retried or skipped ordinary cases',()=>{
    for(const change of [f=>delete f.actual[8],f=>f.receipts[8].shardCount=2,
      f=>f.receipts[8].source='f'.repeat(40),f=>f.planned[9]=clone(f.planned[8]),
      f=>f.actual[8].suites[0].specs.push(clone(f.actual[8].suites[0].specs[0])),
      f=>f.actual[8].suites[0].specs[0].tests[0].results.push({status:'passed',retry:1}),
      f=>{const t=f.actual[1].suites[0].specs[0].tests[0];t.expectedStatus='skipped';t.status='skipped';t.results=[{status:'skipped',retry:0}];},
      f=>f.actual[8].suites[0].specs[0].tests[0].results[0].error={message:'controlled nested error'}]){
      const f=fixture(project);change(f);assert.throws(()=>verifyMobileShards(f));
    }
  });
}

test('unsupported mobile scopes are fixed to unchanged source declarations',()=>{
  assert.deepEqual(Object.fromEntries(Object.entries(frozen.projects).map(([id,rows])=>[id,rows.length])),
    {'android-mobile':10,'ipad-webkit':1,'reflow-200':20});
  const f=fixture('android-mobile');f.inventory.suites[0].specs.find(s=>s.id===frozen.projects['android-mobile'][0].id).title='unreviewed replacement';
  assert.throws(()=>verifyMobileShards(f),/source-declared mobile scope/);
});
test('coherent omission from every mobile inventory and shard still blocks source acceptance',()=>{
  const f=fixture('android-mobile');
  f.inventory.suites[0].specs.shift();f.planned[1].suites[0].specs.shift();f.actual[1].suites[0].specs.shift();
  f.actual[1].stats.expected--;
  assert.throws(()=>verifyMobileShards(f),/source inventory narrowed/);
});
