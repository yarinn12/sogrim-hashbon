import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {renderFriendRelationshipProfileView} from '../src/ui/friendRelationshipProfilePresentation.mjs';
import {buildParticipantRelationshipInsights} from '../src/domain/participantRelationshipInsights.mjs';

function model(overrides={}) {
  return {participantId:'friend-1',targetName:'דנה לוי',identityView:'account',avatarHtml:'<img data-avatar-proof>',usernameHtml:'<bdi>dana_levi</bdi>',connectionHtml:'<span class="participant-identity-label">חבר</span>',activity:{hasHistory:true,note:'3 אירועים משותפים במטבע ₪',paid:{current:'₪420.00',target:'₪240.00'},expensesAdded:{current:'2',target:'2'},involvement:{current:'7',target:'4'}},habitHtml:'<p data-habit-proof>תיאור</p>',factsHtml:'<div data-facts-proof>פרטים</div>',safetyHtml:'<details data-safety-proof></details>',...overrides};
}
test('friend profile presents identity once and puts supplemental facts inside closed details',()=>{
  const html=renderFriendRelationshipProfileView(model());
  assert.match(html,/<h1>פרטי חבר<\/h1>/);
  assert.equal(html.split('data-avatar-proof').length-1,1);
  assert.match(html,/relationship-identity-copy/);
  assert.match(html,/data-friend-profile-id="friend-1"/);
  assert.match(html,/<details class="friend-activity-more"><summary>/);
  assert.doesNotMatch(html,/<details class="friend-activity-more" open/);
  assert.ok(html.indexOf('data-habit-proof')>html.indexOf('<details class="friend-activity-more"'));
  assert.ok(html.indexOf('data-facts-proof')<html.indexOf('</details>'));
  assert.doesNotMatch(html,/<main|<progress|relationship-duo|relationship-comparison-leader/);
});
test('friend profile retains supplied formatted numbers and currency without recalculation',()=>{
  const input=model();input.activity.paid={current:'USD 1,234,567.89',target:'USD 0.01'};
  const html=renderFriendRelationshipProfileView(input);
  for(const value of ['USD 1,234,567.89','USD 0.01','כמה כל אחד שילם בהוצאות','הוצאות שנוספו','פעולות באירועים'])assert.ok(html.includes(value),value);
  assert.ok(html.indexOf('USD 1,234,567.89')<html.indexOf('USD 0.01'));
});
test('friend profile empty state avoids metrics and keeps connection and safety controls',()=>{
  const html=renderFriendRelationshipProfileView(model({activity:{hasHistory:false}}));
  assert.match(html,/עדיין אין הוצאות משותפות/);assert.doesNotMatch(html,/friend-activity-metric|friend-activity-more|data-habit-proof|data-facts-proof/);
  assert.match(html,/data-safety-proof/);assert.match(html,/participant-identity-label/);
});
test('friend profile escapes untrusted names, attributes, notes and formatted values',()=>{
  const input=model({participantId:'"><script>x</script>',targetName:'<img onerror=x>'});
  input.activity.note='<script>note</script>';input.activity.paid.current='<svg onload=x>';
  const html=renderFriendRelationshipProfileView(input);
  assert.doesNotMatch(html,/<script>|<img onerror|<svg onload/);
  assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img onerror=x&gt;/);assert.match(html,/&lt;svg onload=x&gt;/);
});
test('friend profile view has no persistence dependencies and is in both offline inventories',()=>{
  const view=readFileSync('src/ui/friendRelationshipProfilePresentation.mjs','utf8'),sw=readFileSync('sw.js','utf8');
  assert.doesNotMatch(view,/from ["'].*(?:data|domain|server)\//);
  assert.equal(sw.split('"/src/ui/friendRelationshipProfilePresentation.mjs"').length-1,2);
});

const source=readFileSync('src/app.mjs','utf8');
const adapter=source.slice(source.indexOf('function renderFriendRelationshipProfile()'),source.indexOf('function isAcceptedNetworkFriendParticipant('));
function adapterHarness({allowed=true,missing=false}={}) {
  const person={id:'target',displayName:'דנה'},events=[
    {id:'ils-old',name:'ישן',currency:'ILS',createdAt:'2026-10-01T00:00:00Z',participantIds:['owner','target'],expenses:[{id:'a',name:'אוכל',total:42000,payers:[{participantId:'owner',amount:42000}],createdByParticipantId:'owner'}]},
    {id:'usd-new',name:'חדש',currency:'USD',createdAt:'2026-10-20T00:00:00Z',participantIds:['owner','target'],expenses:[{id:'b',name:'לינה',total:10000,payers:[{participantId:'target',amount:10000}],createdByParticipantId:'target'}]},
    {id:'not-shared',currency:'ILS',createdAt:'2026-10-25T00:00:00Z',participantIds:['owner','someone-else'],expenses:[]}
  ];
  const calls={insights:[],avatars:[],model:null};
  const context=vm.createContext({
    screen:{name:'friend-profile',participantId:'target'},state:{currentParticipantId:'owner'},DEFAULT_CURRENCY:'ILS',
    participantForStatistics:id=>missing?null:person,canOpenParticipantStatistics:()=>allowed,
    visibleEventsForParticipant:(state,id)=>{assert.equal(id,'owner');return events;},creationTimestamp:value=>Date.parse(value),
    isAcceptedNetworkFriendParticipant:()=>true,participantConnectionStatus:()=>({connected:true}),eventCurrency:event=>event.currency,
    buildParticipantRelationshipInsights:input=>{calls.insights.push(input);return buildParticipantRelationshipInsights(input)},
    renderFriendRelationshipProfileView:input=>{calls.model=input;return 'view'},
    renderAvatar:(...args)=>{calls.avatars.push(args);return '<img>'},renderParticipantUsername:()=>'<bdi>dana</bdi>',
    renderParticipantConnectionBadge:()=>'<span>מחובר</span>',renderAppBackButton:()=>'<button>חזרה</button>',renderNotice:()=>'',
    renderParticipantRelationshipHabit:()=>'<h3>ההרגל שלכם</h3>',renderParticipantRelationshipFacts:()=>'<h3>עוד דברים מעניינים</h3>',
    renderParticipantSafetyPanel:()=>'<p>דיווח נשמר באופן פרטי. חסימה מונעת בקשות חברות חדשות ולא משנה חישובים קיימים.</p>',
    formatCount:(n,one,many)=>n+' '+(n===1?one:many),currencyCompactLabel:event=>event.currency,formatEventMoney:(event,value)=>event.currency+':'+value,
    renderGroups:()=> 'friends'
  });
  vm.runInContext(adapter,context);
  return {context,calls};
}
test('friend profile adapter preserves shared-event ordering, latest currency and financial insight values',()=>{
  const {context,calls}=adapterHarness();assert.equal(context.renderFriendRelationshipProfile(),'view');
  const input=calls.insights[0];assert.deepEqual(Array.from(input.events,e=>e.id),['usd-new','ils-old']);assert.equal(input.currency,'USD');assert.equal(input.currentParticipantId,'owner');assert.equal(input.targetParticipantId,'target');
  assert.equal(calls.model.activity.paid.current,'USD:0');assert.equal(calls.model.activity.paid.target,'USD:10000');
  assert.equal(calls.model.activity.expensesAdded.current,'0');assert.equal(calls.model.activity.expensesAdded.target,'1');
  assert.match(calls.model.activity.note,/1 אירוע משותף במטבע USD/);assert.equal(calls.avatars[0][2].suppressParticipantAction,true);
  assert.match(calls.model.safetyHtml,/חסימה מונעת בקשות חברות חדשות/);assert.doesNotMatch(calls.model.safetyHtml,/דיווח נשמר/);
});
for(const mode of [{allowed:false},{missing:true}])test('friend profile refuses unavailable participant '+JSON.stringify(mode),()=>{
  const {context,calls}=adapterHarness(mode);assert.equal(context.renderFriendRelationshipProfile(),'friends');assert.equal(context.screen.name,'groups');assert.equal(calls.insights.length,0);assert.equal(calls.model,null);
});
