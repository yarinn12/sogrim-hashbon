import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createSyncNoticePresentation,renderPendingSyncSummary} from "../src/ui/syncNoticePresentation.mjs";

class Node {
  constructor(document) { this.ownerDocument=document; this.dataset={}; this.children=[]; this.attributes={}; this.classList={add(){}}; this.isConnected=true; this.hidden=false; this.offsetHeight=80; this.scrolled=0; }
  setAttribute(key,value) { this.attributes[key]=value; }
  append(...nodes) { for(const node of nodes){node.parentElement=this;this.children.push(node);} }
  prepend(node) { node.parentElement=this;this.children.unshift(node); }
  after(node) { this.parentElement.append(node); }
  replaceChildren() { this.children=[]; }
  contains(node) { return this.children.some(child=>child===node||child.contains?.(node)); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  scrollIntoView() { this.scrolled++; }
}
function harness() {
  const frames=[],document={createElement(){return new Node(document);},createTextNode(textContent){return{textContent}},querySelectorAll(){return[]}};
  const app=new Node(document),screen=new Node(document),header=new Node(document);screen.append(header);
  screen.querySelector=selector=>selector===':scope > .top'?header:null;
  app.querySelector=selector=>selector===':scope > .screen'?screen:null;
  document.body=new Node(document);
  document.querySelector=selector=>selector==='#app'?app:document.body.children.find(node=>node.dataset.syncStatus!==undefined)||screen.children.find(node=>node.dataset.syncStatus!==undefined)||null;
  const view=createSyncNoticePresentation({document,requestFrame:cb=>frames.push(cb)});
  return{document,app,screen,view,frames,flush(){while(frames.length)frames.shift()()}};
}
test('sync notice is a polite independently owned live region with source close and escaped text',()=>{
 const h=harness(),node=h.view.render({status:'offline',message:'<img onerror="bad"> & שגיאה'});
 assert.equal(node.attributes.role,'status');assert.equal(node.attributes['aria-live'],'polite');assert.equal(node.attributes['aria-atomic'],'true');
 assert.match(node.className,/sync-inline-notice/);assert.doesNotMatch(node.className,/app-inline-notice/);
 assert.match(node.innerHTML,/&lt;img/);assert.doesNotMatch(node.innerHTML,/<img|app-toast-icon/);assert.match(node.innerHTML,/data-sync-dismiss/);
});
test('sync notice retains its identity after the app replaces the screen DOM',()=>{
 const h=harness(),node=h.view.render({status:'offline',message:'אין חיבור'});h.view.place('offline');assert.equal(node.parentElement,h.screen);
 h.screen.children=[];h.document.body.children=[];node.parentElement=null;h.view.place('offline');assert.equal(node.parentElement,h.screen);assert.equal(h.screen.children[0],node);
 assert.equal(h.view.render({status:'conflict',message:'שינוי ממכשיר אחר'}),node);
});
test('explicit dismissal and a newer feedback revision cancel old scroll callbacks',()=>{
 const h=harness(),node=h.view.render({status:'offline',message:'אין חיבור'});h.view.place('offline');node.hidden=true;h.view.place('');h.flush();assert.equal(node.scrolled,0);
 node.hidden=false;h.view.place('offline');h.view.render({status:'conflict',message:'שינוי ממכשיר אחר'});h.view.place('conflict');h.flush();assert.equal(node.scrolled,1);
});
function summary(events,failureDetails){const h=harness(),target=new Node(h.document);target.dataset.syncAccountEvents=JSON.stringify(events);const options={pendingEventIds:events.map(e=>e.id),failureDetails,document:h.document};renderPendingSyncSummary(target,'אין הרשאה לבצע את השינוי',options);return{...h,target,options};}
const descendants=root=>root.children.flatMap(node=>[node,...(node.children?descendants(node):[])]);
test('pending summary keeps original event identity and per-event failure attribution without rebuilding open details',()=>{
 const events=[{id:'a',name:'אירוע א'},{id:'b',name:'אירוע ב'}],h=summary(events,{failureKind:'permission',eventFailures:[{id:'a',failureKind:'permission'}]});
 const nodes=descendants(h.target),links=nodes.filter(n=>n.dataset?.action==='open-event');assert.deepEqual(links.map(n=>[n.dataset.eventId,n.textContent]),events.map(e=>[e.id,e.name]));
 assert.equal(nodes.filter(n=>n.textContent?.includes('— השמירה נחסמה בגלל הרשאה')).length,1);
 assert.ok(!nodes.some(n=>n.className==='sync-pending-heading'),'unknown event outcomes cannot be labelled as confirmed permission rejections');
 const details=nodes.find(n=>n.dataset?.syncEventDetails!==undefined);details.open=true;renderPendingSyncSummary(h.target,'אין הרשאה לבצע את השינוי',h.options);assert.equal(descendants(h.target).find(n=>n.dataset?.syncEventDetails!==undefined),details);assert.equal(details.open,true);
});
test('all confirmed permission failures use concise count, retained-on-device guidance and explicit retry',()=>{
 const events=[{id:'a',name:'<b>שם</b>'},{id:'b',name:'אירוע ב'}],h=summary(events,{failureKind:'permission',eventFailures:events.map(e=>({id:e.id,failureKind:'permission'}))});const nodes=descendants(h.target);
 assert.equal(nodes.find(n=>n.className==='sync-pending-heading').textContent,'שמירת העדכונים נחסמה ב־2 אירועים');assert.match(nodes.find(n=>n.className==='sync-pending-explanation').textContent,/שמורים במכשיר הזה/);
 assert.equal(nodes.find(n=>n.dataset?.syncRetry!==undefined).textContent,'נסה לשמור שוב');assert.equal(nodes.find(n=>n.dataset?.eventId==='a').textContent,'<b>שם</b>');
 assert.equal(nodes.find(n=>n.dataset?.syncEventDetails!==undefined).children[0].textContent,'באילו אירועים?');
});
test('quiet or account-wide pending state never invents event IDs or drops failure guidance',()=>{
 const h=summary([],{failureKind:'auth'});assert.equal(descendants(h.target).filter(n=>n.dataset?.action==='open-event').length,0);assert.match(h.target.children[0].textContent,/אין הרשאה לבצע את השינוי/);
 renderPendingSyncSummary(h.target,'',h.options);assert.equal(h.target.children.length,0);
});
test('sync presentation has no data or server dependency and ships in both offline inventories',()=>{
 const source=readFileSync('src/ui/syncNoticePresentation.mjs','utf8');assert.doesNotMatch(source,/from ["'][^"']*(?:data|domain|server)\//);assert.equal(readFileSync('sw.js','utf8').split('"/src/ui/syncNoticePresentation.mjs"').length-1,2);
});
