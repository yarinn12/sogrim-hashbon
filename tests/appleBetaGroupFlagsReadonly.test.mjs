import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';

const yaml = readFileSync(
  new URL('../.github/workflows/ios194-group-flags-readonly-once.yml', import.meta.url),
  'utf8'
).replace(/\r\n/g, '\n');
const block = yaml.match(
  /^          \/\/ BEGIN COLLECTOR\n([\s\S]*?)^          \/\/ END COLLECTOR$/m
);
assert.ok(block, 'Collector markers absent');
const source = block[1].replace(/^          /gm, '');

const controlsBody = String.raw`
const ids = [
  '4646e3de-7401-4e70-ac32-9a00072e1376',
  '00000000-0000-0000-0000-000000000001'
];
const group = (id = ids[0], attrs = {}) => ({
  type:'betaGroups',
  id,
  attributes:{
    isInternalGroup:true,
    hasAccessToAllBuilds:false,
    publicLinkEnabled:false,
    name:'DO_NOT_OUTPUT',
    ...attrs
  }
});
const app = {
  data:{
    type:'apps',
    id:'6809952514',
    attributes:{
      bundleId:'com.sogrimhashbon.app',
      name:'DO_NOT_OUTPUT'
    }
  }
};

async function run(pages, {
  team=TEAM_ID,
  appResponse=app,
  error=null
}={}) {
  const calls=[];
  let page=0;
  const r=await collectBetaGroupFlags({
    teamId:team,
    now:()=> '2026-10-14T20:30:00.000Z',
    rawClient:async(path,options)=>{
      calls.push({path,options});
      if(error) throw error;
      return path===APP_PATH ? appResponse : pages[page++];
    }
  });
  return {r,calls};
}

const controls=[];
function check(name, yes) {
  if (!yes) throw Error('Control failed: '+name);
  controls.push(name);
}

const ok=await run([{
  data:[group()],
  meta:{paging:{total:1}},
  links:{next:null}
}]);

check(
  'exact projection and booleans',
  ok.r.completeness.complete &&
  JSON.stringify(Object.keys(ok.r.groups[0])) ===
    JSON.stringify(['id',...FLAGS]) &&
  ok.r.groups[0].hasAccessToAllBuilds===false &&
  !JSON.stringify(ok.r).includes('DO_NOT_OUTPUT')
);
check(
  'GET only without body',
  ok.calls.every(c=>
    c.options.method==='GET' &&
    Object.keys(c.options).length===1
  )
);
check(
  'wrong team before request',
  (await run([],{team:'WRONG'})).calls.length===0
);
check(
  'wrong app',
  (await run([],{
    appResponse:{
      data:{type:'apps',id:'1',attributes:{bundleId:BUNDLE_ID}}
    }
  })).r.completeness.failureCode==='UNEXPECTED_APP_IDENTITY'
);
check(
  'wrong bundle',
  (await run([],{
    appResponse:{
      data:{type:'apps',id:APP_ID,attributes:{bundleId:'wrong'}}
    }
  })).r.completeness.failureCode==='UNEXPECTED_APP_IDENTITY'
);
check(
  'same origin pagination',
  (await run([
    {
      data:[group()],
      meta:{paging:{total:2}},
      links:{next:ORIGIN+GROUP_PATH+'?cursor=second&limit=200'}
    },
    {
      data:[group(ids[1],{isInternalGroup:false})],
      meta:{paging:{total:2}},
      links:{next:null}
    }
  ])).r.completeness.complete
);

for(const [label,value] of [
  ['missing',undefined],
  ['null',null],
  ['string','false']
]) {
  const r=(await run([{
    data:[group(ids[0],{hasAccessToAllBuilds:value})]
  }])).r;
  check(
    label+' remains null',
    !r.completeness.complete &&
    r.groups[0].hasAccessToAllBuilds===null &&
    r.completeness.failureCode==='INCOMPLETE_GROUP_FLAGS'
  );
}

const hostile=[
  ['foreign origin','https://evil.example'+GROUP_PATH],
  [
    'credentials',
    'https://user:pass@api.appstoreconnect.apple.com'+GROUP_PATH
  ],
  ['foreign path','/v1/betaTesters?limit=200'],
  ['protocol relative','//api.appstoreconnect.apple.com'+GROUP_PATH],
  ['fragment',GROUP_PATH+'#secret'],
  ['extra fields',GROUP_PATH+'?fields%5BbetaGroups%5D=name'],
  ['duplicate keys',GROUP_PATH+'?cursor=x&cursor=y'],
  ['malformed percent',GROUP_PATH+'?cursor=%zz'],
  ['extra filter',GROUP_PATH+'?filter%5Bapp%5D=another'],
  ['wrong limit',GROUP_PATH+'?limit=201']
];
for(const [name,next] of hostile) {
  const result=await run([{data:[group()],links:{next}}]);
  check(
    name+' blocked',
    result.calls.length===2 &&
    result.r.completeness.failureCode==='UNSAFE_PAGINATION'
  );
}

check(
  'duplicate group',
  (await run([{data:[group(),group()]}]))
    .r.completeness.failureCode==='DUPLICATE_GROUP_ID'
);
check(
  'repeated page',
  (await run([{data:[group()],links:{next:GROUP_PATH}}]))
    .r.completeness.failureCode==='REPEATED_PAGINATION'
);
check(
  'bounded pages',
  (await run(Array.from({length:20},(_,i)=>({
    data:[],
    links:{next:GROUP_PATH+'?cursor='+i}
  })))).r.completeness.failureCode==='PAGINATION_LIMIT_REACHED'
);
check(
  'malformed collection',
  (await run([{data:{secret:'DO_NOT_OUTPUT'}}]))
    .r.completeness.failureCode==='MALFORMED_GROUP_COLLECTION'
);
check(
  'wrong total',
  (await run([{data:[group()],meta:{paging:{total:2}}}]))
    .r.completeness.failureCode==='REPORTED_TOTAL_MISMATCH'
);
check(
  'changing total',
  (await run([
    {
      data:[],
      meta:{paging:{total:1}},
      links:{next:GROUP_PATH+'?cursor=a'}
    },
    {
      data:[group()],
      meta:{paging:{total:2}}
    }
  ])).r.completeness.failureCode==='CHANGING_REPORTED_TOTAL'
);
const safeError=await run([],{
  error:{status:403,message:'DO_NOT_OUTPUT'}
});
check(
  'sanitized errors',
  safeError.r.completeness.httpStatus===403 &&
  !JSON.stringify(safeError.r).includes('DO_NOT_OUTPUT')
);
return controls;
`;

const run = Function(
  source + '\nreturn async function(){' + controlsBody + '};'
)();

test('26 isolated collector controls from proposed workflow bytes', async () => {
  const controls = await run();
  assert.equal(controls.length, 26);
});

test('probe activation is unique, app scoped and GET only',()=>{
 assert.match(yaml,/github.run_number == 1 && github.run_attempt == 1/);
 assert.match(yaml,/github.ref == 'refs\/heads\/codex\/ios194-group-flags-readonly-20261014'/);
 assert.doesNotMatch(yaml,/workflow_dispatch:|pull_request:|workflow_call:|method: 'POST'|method: 'PATCH'|method: 'DELETE'/);
 assert.match(yaml,/contents: read/);
 assert.match(yaml,/persist-credentials: false/);
});
