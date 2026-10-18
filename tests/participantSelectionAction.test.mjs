import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile('src/app.mjs','utf8');
const extract=name=>{
  const start=source.indexOf(`function ${name}(`);
  assert.notEqual(start,-1);
  const end=source.indexOf('\nfunction ',start+1);
  return source.slice(start,end<0?undefined:end);
};
function renderer(connected=true) {
  const peer={id:'peer',displayName:'דנה <בדיקה>',kind:connected?'user':'guest'};
  const context=vm.createContext({
    state:{currentParticipantId:'owner'},
    IDENTITY_GROUPED_PARTICIPANT_ACTIONS:new Set(['new-event-participant']),
    participantName:()=>peer.displayName,participantForStatistics:()=>peer,
    participantConnectionStatus:()=>({connected,label:connected?'חבר באפליקציה':'שם אופליין'}),
    participantSearchIdentity:(_p,name)=>name,
    avatarPresetForParticipant:()=> 'avatar-2',avatarSourceForParticipant:()=> './assets/avatars/avatar-2.png',
    canOpenParticipantStatistics:()=>true,
    renderParticipantUsername:()=> '',renderParticipantConnectionBadge:()=> '<small>זהות</small>',
    iconSvg:()=> '<svg aria-hidden="true"></svg>'
  });
  for(const name of ['escapeHtml','escapeAttribute','participantStatisticsAvatarAttributes','renderAvatar','renderParticipantPill','renderExpenseParticipantRow']) {
    vm.runInContext(extract(name),context);
  }
  return {context,peer,event:{id:'event-qa'}};
}
for(const connected of [true,false]) {
  for(const name of ['renderParticipantPill','renderExpenseParticipantRow']) {
    test(`${name} keeps ${connected?'connected':'offline'} avatar navigation out of its checkbox label`,()=>{
      const {context,peer,event}=renderer(connected);
      const html=name==='renderParticipantPill'
        ?context[name](peer,[peer.id],'new-event-participant',event,false)
        :context[name](peer,[peer.id],event,false);
      assert.match(html,/type="checkbox"/);
      assert.match(html,/checked/);
      assert.match(html,/דנה &lt;בדיקה&gt;/);
      assert.doesNotMatch(html,/data-action="open-participant-statistics"/,
        'an avatar nested in a selection label must not navigate away instead of activating its checkbox');
      assert.doesNotMatch(html,/role="button"|tabindex="0"/,
        'a checkbox label must not contain a competing keyboard action');
    });
  }
}
test('standalone participant avatars still open statistics outside selection labels',()=>{
  const {context,event}=renderer();
  assert.match(context.renderAvatar('peer',event),/data-action="open-participant-statistics"/);
  assert.match(context.renderAvatar('peer',event),/role="button" tabindex="0"/);
});
