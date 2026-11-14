import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext,createContext,runInContext} from 'node:vm';
import {sanitizeParticipantAlias,participantAliasUpdate} from '../src/domain/participantIdentity.mjs';
import {participantAliasDraftUpdate as update,participantAliasDraftValue as value,participantAliasAcknowledgedDrafts as acknowledged} from '../src/ui/eventParticipantIdentityPresentation.mjs';
const source=await readFile(process.env.PARTICIPANT_ALIAS_DRAFT_TEST_APP||'src/app.mjs','utf8');
const section=(start,end)=>{const a=source.indexOf(start);assert.ok(a>=0);return source.slice(a,source.indexOf(end,a+start.length));};
const inputHandler=section('function handleInput(event)','\nasync function handleChange(');
const saveHandler=section('async function saveParticipantAlias(','\nfunction requestExpenseDeletion(');

test('alias drafts are scoped to the exact event form and retain an intentional empty value',()=>{
 const d={kind:'participant-identities',eventId:'e',aliasDrafts:{p:''}};
 assert.equal(value(d,'e','p','previous'),'');
 assert.equal(value(d,'other','p','previous'),'previous');
 assert.equal(value({...d,kind:'other'},'e','p','previous'),'previous');
 assert.equal(update(d,'other','p','new'),null);
 assert.equal(update(null,'e','p','new'),null);
});
test('draft update and acknowledged cleanup preserve all other participants without mutating inputs',()=>{
 const d={kind:'participant-identities',eventId:'e',aliasDrafts:{p:'new',q:'other'}};
 const before=JSON.stringify(d);assert.deepEqual(update(d,'e','p','later'),{p:'later',q:'other'});
 assert.deepEqual(acknowledged(d,d,'e','p','new',true),{q:'other'});
 assert.equal(JSON.stringify(d),before);
});
test('an acknowledgement cannot clear a newer edit, a newer write or a reopened form',()=>{
 const d={kind:'participant-identities',eventId:'e',aliasDrafts:{p:'new'}};
 assert.equal(acknowledged(d,d,'e','p','old',true),null);
 assert.equal(acknowledged(d,d,'e','p','new',false),null);
 assert.equal(acknowledged({...d},d,'e','p','new',true),null);
 assert.equal(acknowledged(d,d,'other','p','new',true),null);
});
test('the actual input adapter remembers a draft in UI state without persisting it',()=>{
 const d={kind:'participant-identities',eventId:'e'},calls=[];
 const context={eventDialog:d,participantAliasDraftUpdate:update,scheduleBrowserHistoryReplacement:()=>calls.push('history')};
 runInNewContext('('+inputHandler+')',context)({target:{dataset:{action:'participant-alias',eventId:'e',participantId:'p'},value:'מהעבודה'}});
 assert.equal(d.aliasDrafts.p,'מהעבודה');assert.deepEqual(calls,['history']);
});
for(const mode of ['rejected','acknowledged','newer-input','newer-write','replaced-event','reopened'])test('actual alias save preserves UI ownership: '+mode,async()=>{
 class Input{value='  חדש  ';}
 const input=new Input(),event={id:'e',participantIds:['p','q'],participantAliases:{p:'ישן',q:'אחר'},participantAliasUpdatedAtByParticipant:{p:'2020-01-01T00:00:00.000Z'}};
 const dialog={kind:'participant-identities',eventId:'e',aliasDrafts:{p:input.value,q:'טיוטה אחרת'}};
 let currentEvent=event;
 let respond,shown,reactivations=0;const pending=new Promise(resolve=>respond=resolve),writes=[];
 const context=createContext({HTMLInputElement:Input,eventDialog:dialog,notice:'',sanitizeParticipantAlias,participantAliasUpdate,participantAliasAcknowledgedDrafts:acknowledged,
  getEvent:()=>currentEvent,canCurrentParticipantManage:()=>true,
  app:{querySelector:s=>s.includes('participant-alias')?input:{scrollTop:17}},
  persistState:options=>{writes.push({awaitCloud:options.awaitCloud,scope:[...options.forceSharedEventIds],event:structuredClone(event)});return pending},
  render:()=>shown=value(context.eventDialog,'e','p',currentEvent.participantAliases.p),reactivateDialogAfterRender:()=>reactivations++});
 runInContext(saveHandler,context);const request=context.saveParticipantAlias('e','p');
 assert.equal(writes[0].awaitCloud,true);assert.deepEqual(writes[0].scope,['e']);assert.equal(writes[0].event.participantAliases.p,'חדש');
 if(mode==='newer-input')dialog.aliasDrafts.p='טיוטה חדשה';
 if(mode==='newer-write'){event.participantAliasUpdatedAtByParticipant.p=new Date(Date.parse(event.participantAliasUpdatedAtByParticipant.p)+1).toISOString();event.participantAliases.p='שמירה חדשה';}
 if(mode==='replaced-event')currentEvent={...event,participantAliases:{...event.participantAliases,p:'שמירה חדשה'},participantAliasUpdatedAtByParticipant:{...event.participantAliasUpdatedAtByParticipant,p:new Date(Date.parse(event.participantAliasUpdatedAtByParticipant.p)+1).toISOString()}};
 if(mode==='reopened')context.eventDialog={kind:'participant-identities',eventId:'e',aliasDrafts:{p:'טיוטה שנפתחה מחדש'}};
 respond({ok:mode!=='rejected'});await request;
 assert.equal(event.participantAliases.q,'אחר');
 if(mode==='rejected'){assert.equal(event.participantAliases.p,'ישן');assert.equal(shown,input.value);assert.match(context.notice,/לא הצלחנו לשמור/);}
 if(mode==='acknowledged'){assert.equal(shown,'חדש');assert.equal(Object.hasOwn(dialog.aliasDrafts,'p'),false);assert.equal(dialog.aliasDrafts.q,'טיוטה אחרת');}
 if(mode==='newer-input')assert.equal(shown,'טיוטה חדשה');
 if(mode==='newer-write'){assert.equal(event.participantAliases.p,'שמירה חדשה');assert.equal(dialog.aliasDrafts.p,input.value);}
 if(mode==='replaced-event'){assert.equal(currentEvent.participantAliases.p,'שמירה חדשה');assert.equal(dialog.aliasDrafts.p,input.value);assert.equal(shown,input.value);}
 if(mode==='reopened'){assert.equal(shown,'טיוטה שנפתחה מחדש');assert.equal(reactivations,0);}
 else assert.equal(reactivations,1);
});
