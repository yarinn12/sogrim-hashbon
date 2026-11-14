import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {renderEventCreationProgressView} from '../src/ui/eventCreationProgress.mjs';

const ids=['type','details','settlement','participants'];
function buttons(html) {
  return [...html.matchAll(/<button\b([^>]+)>([\s\S]*?)<\/button>/g)].map(([,attrs,body])=>({
    id:/data-new-event-step="([^"]+)"/.exec(attrs)?.[1],
    disabled:/\bdisabled\b/.test(attrs),
    action:/data-action="([^"]+)"/.exec(attrs)?.[1],
    label:body.replace(/<[^>]+>/g,'').trim()
  }));
}

test('approved creation tabs preserve four named button actions without numbered markers',()=>{
  const html=renderEventCreationProgressView({activeStep:'type'});
  const rendered=buttons(html);
  assert.deepEqual(rendered.map(b=>b.id),ids);
  assert.deepEqual(rendered.map(b=>b.label),['אירוע','פרטים','הגדרות חשבון','משתתפים']);
  assert.ok(rendered.every(b=>b.action==='go-new-event-step'));
  assert.deepEqual(rendered.map(b=>b.disabled),[false,true,true,true]);
  assert.match(html,/<ol[^>]*aria-label="שלבי יצירת אירוע"/);
  assert.doesNotMatch(html,/<span|<svg|<input|<a\b/);
});

test('selected event type keeps every stage reachable and marks exactly the current stage',()=>{
  for(const activeStep of ids){
    const html=renderEventCreationProgressView({activeStep,eventTypeSelected:true});
    assert.ok(buttons(html).every(b=>!b.disabled));
    const current=[...html.matchAll(/<li\b[^>]*aria-current="step"[^>]*>([\s\S]*?)<\/li>/g)];
    assert.equal(current.length,1);
    assert.equal(buttons(current[0][1])[0].id,activeStep);
  }
});

test('legacy management and unknown stage names keep the first-stage fallback',()=>{
  for(const activeStep of ['management','unknown',undefined]){
    const html=renderEventCreationProgressView({activeStep});
    const current=/<li\b[^>]*aria-current="step"[^>]*>([\s\S]*?)<\/li>/.exec(html);
    assert.equal(buttons(current[1])[0].id,'type');
  }
});

test('the app adapter derives stage availability from the existing draft without altering it',async()=>{
  const source=await readFile('src/app.mjs','utf8');
  const start=source.indexOf('function renderEventCreationProgress(activeStep) {');
  const end=source.indexOf('function renderJoinEvent()',start);
  assert.ok(start>=0&&end>start);
  for(const draft of [null,{eventType:''},{eventType:'standard',name:'Keep draft',participantIds:['owner']}]){
    const before=JSON.stringify(draft);
    const context=vm.createContext({newEventDraft:draft,renderEventCreationProgressView});
    vm.runInContext(source.slice(start,end),context);
    const rendered=buttons(context.renderEventCreationProgress('details'));
    assert.equal(rendered.filter(b=>!b.disabled).length,draft?.eventType?4:1);
    assert.equal(JSON.stringify(draft),before);
  }
});
