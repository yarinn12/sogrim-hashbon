import {expect} from '@playwright/test';

export async function paint(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter(a =>
    Number.isFinite(a.effect?.getComputedTiming().endTime) && a.playState === 'running').length)).toBe(0);
}

export async function pointClick(locator, page = locator.page()) {
  await expect(locator).toBeVisible();
  await expect(locator).toBeEnabled();
  await locator.evaluate(e => e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));
  await expect.poll(() => locator.evaluate(async e => {
    const before=e.getBoundingClientRect();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const r=e.getBoundingClientRect(),hit=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);
    return Math.abs(before.top-r.top)<.1 && Math.abs(before.left-r.left)<.1 && !!hit && (hit===e || e.contains(hit));
  })).toBe(true);
  const point=await locator.evaluate(e => {const r=e.getBoundingClientRect();return{x:(r.left+r.right)/2,y:(r.top+r.bottom)/2}});
  await page.mouse.click(point.x,point.y);
}

export async function settled(page) {
  await expect.poll(() => page.evaluate(async () => {
    const m=await import('/src/data/localStore.mjs');return m.pendingSharedSyncStatus().pending;
  })).toBe(false);
}

const listSpecs=[['.event-notes-heading h2',1.125],['.event-notes-heading p',.875],['.event-notes-entry-action',.9375],['.event-note-title-line strong',1],['.event-note-preview',.875],['.event-note-meta',.8125],['.event-notes-empty h3',1],['.event-notes-empty p',.875]];
const editorSpecs=[['.event-modal-header h2',1.5],['#event-modal-description',.8125],['.event-note-sharing-help',.875],['.field > span',.875],['.field input',1],['.field textarea',1],['.event-note-pin-toggle > span:last-child',.9375],['[data-action="save-event-note"]',.9375],['.event-note-delete',.875],['.event-note-readonly-content h3',1.125],['.event-note-readonly-content p',1],['.event-note-readonly-content small',.8125]];
const confirmationSpecs=[['#important-action-title',1.25],['#event-note-delete-name',.875],['#important-action-description',.875],['[data-action="cancel-important-action"]',.9375],['[data-action="confirm-important-action"]',.9375]];

export async function geometry({page,scope,kind,root}) {
  await paint(page);
  const specs=kind==='list'?listSpecs:kind==='confirmation'?confirmationSpecs:editorSpecs;
  const metrics=await scope.evaluate((e,specs) => {
    const fonts=[],bad=[];let lines=0;
    const ancestorOwner=el=>{for(let p=el;p&&p!==document.documentElement;p=p.parentElement){if(/auto|scroll/.test(getComputedStyle(p).overflowY)&&p.scrollHeight>p.clientHeight+1)return p}return document.scrollingElement};
    const owner=ancestorOwner(e);
    for(const [s,ratio] of specs)for(const el of e.querySelectorAll(s)) {
      fonts.push({s,ratio,size:parseFloat(getComputedStyle(el).fontSize)});
      // Native editable fields scroll their text/caret internally. Labels,
      // static readonly content and every action still undergo glyph checks.
      if(el.matches('input,textarea'))continue;
      const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let text;
      while(text=walker.nextNode()) {
        if(!text.textContent.trim())continue;
        const range=document.createRange();range.selectNodeContents(text);
        for(let i=0;i<range.getClientRects().length;i++) {
          let b=range.getClientRects()[i];const box=el.getBoundingClientRect();
          if(b.left<Math.max(0,box.left)-1.5||b.right>Math.min(innerWidth,box.right)+1.5)bad.push({s,kind:'horizontal',i});
          const host=owner===document.scrollingElement?{top:0,bottom:innerHeight}:owner.getBoundingClientRect();
          owner.scrollTop+=b.top-(host.top+host.bottom)/2;b=range.getClientRects()[i];
          const frame=owner===document.scrollingElement?{top:0,bottom:innerHeight}:owner.getBoundingClientRect(),hit=document.elementFromPoint((b.left+b.right)/2,(b.top+b.bottom)/2);
          lines++;
          if(b.top<Math.max(0,frame.top)-1.5||b.bottom>Math.min(innerHeight,frame.bottom)+1.5||!(hit&&(hit===el||el.contains(hit))))bad.push({s,kind:'unreachable',i});
        }
      }
    }
    return{fonts,bad,lines,overflow:document.documentElement.scrollWidth-innerWidth,localOverflow:e.scrollWidth-e.clientWidth};
  },specs);
  expect(metrics.fonts.length).toBeGreaterThan(0);
  expect(metrics.bad).toEqual([]);
  expect(metrics.overflow).toBe(0);expect(metrics.localOverflow).toBe(0);
  for(const f of metrics.fonts)expect(f.size,f.s).toBe(root*f.ratio);
  for(const action of await scope.locator('button:not([disabled]),input,textarea').all()) {
    if(!await action.isVisible())continue;
    const r=await action.boundingBox();expect(r.width).toBeGreaterThanOrEqual(44);expect(r.height).toBeGreaterThanOrEqual(44);
  }
  await paint(page);
  return metrics;
}

export async function navigation(page,kind='list') {
  await paint(page);
  const nav=page.locator(kind==='list'?'.product-app-nav:not(.event-route-primary-nav)':'.event-route-primary-nav');
  await expect(nav).toBeVisible();await expect(nav.locator('button[data-nav-destination]')).toHaveCount(4);
  const bad=await nav.evaluate(e=>[...e.querySelectorAll('button[data-nav-destination] > span:not(.product-nav-badge)')].flatMap(el=>{
    const range=document.createRange();range.selectNodeContents(el);const b=range.getBoundingClientRect(),s=getComputedStyle(el),hit=document.elementFromPoint((b.left+b.right)/2,(b.top+b.bottom)/2);
    return b.left<0||b.right>innerWidth||b.top<0||b.bottom>innerHeight||b.width===0||s.visibility!=='visible'||+s.opacity===0||!(hit&&el.closest('button').contains(hit))?[el.textContent]:[];
  }));expect(bad).toEqual([]);
}

export async function keyboardFieldFocus(editor) {
  for(const field of [editor.locator('[name="eventNoteTitle"]'),editor.locator('[name="eventNoteBody"]')]) {
    await field.press('ArrowLeft');
    await expect(field).toBeFocused();
    expect(await field.evaluate(e=>getComputedStyle(e).outlineStyle)).toBe('solid');
    expect(await field.evaluate(e=>parseFloat(getComputedStyle(e).outlineWidth))).toBe(2);
  }
}

export async function unchanged(page,{allowNotes=false}={}) {
  const result=await page.evaluate(allowNotes=>{
    const q=__friendInviteQa;
    const keys=['id','name','currency','participantIds','expenses','transfers','activityLog','adminIds','createdByParticipantId','adminsCanEditOnly','roundSettlementTransfers','directSettlementTransfers','locked','closedAt'];
    const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
    const equal=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
    const bad=s=>s.events.some(e=>{
      const seed=q.seedFinancialEvents.find(x=>x.id===e.id);
      const fields=[...keys,...(!allowNotes||e.id!=='friend-weekend'?['notes','deletedNotes']:[])];
      return !seed||fields.some(k=>!equal(e[k],seed[k]));
    });
    const saved=JSON.parse(localStorage.getItem('qa-invite-server-row'));
    return {profile:q.profileWrites.length,friends:q.writes.length,rewards:q.rewardWrites.length,shared:q.shared.length,copied:q.copied.length,windows:q.shareWindows.length,personalFinancial:q.snapshotWrites.filter(w=>{const s=(Array.isArray(w.body)?w.body[0]:w.body).state;return s&&bad(s)}).length,canonicalFinancial:q.canonicalWrites.filter(bad).length,finalPersonalFinancial:Number(bad(saved.state)),wrongScope:q.canonicalRequests.filter(r=>r.p_snapshot_id!=='synthetic-share-event-space'||r.p_space_key!=='synthetic-share-event-key-abcdefghijklmnopqrstuvwxyz'||r.p_state.events.length!==1||r.p_state.events[0].id!=='friend-weekend').length};
  },allowNotes);
  for(const [key,count] of Object.entries(result))expect(count,key).toBe(0);
}

export async function acknowledged(page,{id,title,body,pinned,deleted=false}) {
  await expect.poll(()=>page.evaluate(expected=>{
    const q=__friendInviteQa,personal=JSON.parse(localStorage.getItem('qa-invite-server-row'))?.state;
    const valid=s=>{
      const e=s?.events?.find(e=>e.id==='friend-weekend'),n=e?.notes?.find(n=>expected.id?n.id===expected.id:n.title===expected.title);
      if(expected.deleted)return !n&&e?.deletedNotes?.some(d=>d.id===expected.id);
      return !!n&&(expected.title===undefined||n.title===expected.title)&&(expected.body===undefined||n.body===expected.body)&&(expected.pinned===undefined||(n.pinned===true)===expected.pinned);
    };
    return valid(q.canonicalSnapshot.state)&&valid(personal)&&q.canonicalWrites.some(valid)&&q.snapshotWrites.some(w=>valid((Array.isArray(w.body)?w.body[0]:w.body).state));
  },{id,title,body,pinned,deleted})).toBe(true);
  await settled(page);
  const untouched=await page.evaluate(expected=>{
    const q=__friendInviteQa,e=q.canonicalSnapshot.state.events[0],saved=JSON.parse(localStorage.getItem('qa-invite-server-row')).state.events.find(e=>e.id==='friend-weekend');
    const changedId=expected.id||e.notes.find(n=>n.title===expected.title)?.id;
    return q.noteBatchSeed.filter(n=>n.id!==changedId).map(seed=>({seed,canonical:e.notes.find(n=>n.id===seed.id),personal:saved.notes.find(n=>n.id===seed.id)}));
  },{id,title});
  for(const record of untouched){expect(record.canonical).toEqual(record.seed);expect(record.personal).toEqual(record.seed)}
  await unchanged(page,{allowNotes:true});
}
