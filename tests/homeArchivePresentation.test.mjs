import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {renderHomeEventOptionsView as options} from '../src/ui/homeEventOptionsPresentation.mjs';
import {renderHomeEmptyStateView as empty} from '../src/ui/homeEmptyStatePresentation.mjs';

const model=()=>({event:{id:'event',name:'סוף השבוע'},canShare:true,canRemove:true,removesForEveryone:true,removalDescription:'מחיקה לכל המשתתפים, לאחר אישור נוסף',commandIcons:{share:'<i>share</i>',archive:'<i>archive</i>',danger:'<i>danger</i>'}});
test('owner and participant receive the labels for their existing confirmation paths',()=>{
 assert.match(options(model()),/<strong>מחיקת האירוע<\/strong>/);
 assert.match(options({...model(),removesForEveryone:false}),/<strong>עזיבת האירוע<\/strong>/);
 for(const action of ['share-event-from-list','toggle-personal-event-archive','remove-event-from-list','cancel-event-status-menu'])assert.match(options(model()),new RegExp('data-action="'+action+'"'));
});
test('permission decisions remain disabled instead of being inferred by the view',()=>{
 const html=options({...model(),canShare:false,canRemove:false,shareDescription:'רק מנהל יכול להזמין'});
 assert.match(html,/data-action="share-event-from-list"[^>]*disabled aria-disabled="true"/);
 assert.match(html,/data-action="remove-event-from-list"[^>]*disabled/);
 assert.match(html,/רק מנהל יכול להזמין/);
});
test('pin and archive actions reflect each independent preference',()=>{
 const html=options({...model(),isPersonallyPinned:true,isPersonallyArchived:true});
 assert.match(html,/aria-pressed="true"/);assert.match(html,/ביטול הצמדה/);assert.match(html,/החזר לאירועים/);
 assert.match(options(model()),/aria-pressed="false"/);assert.match(options(model()),/העבר לארכיון/);
});
test('pin copy covers private account persistence while archive copy remains device-specific',()=>{
 const html=options(model());assert.match(html,/id="event-pin-description">ברשימה האישית שלך\./);assert.match(html,/מסתיר מהרשימה שלך במכשיר הזה/);
 assert.doesNotMatch(html,/ברשימה שלך במכשיר הזה בלבד/);
});
test('error recovery and accessible context survive the flatter layout',()=>{
 const html=options({...model(),pinError:'אפשר לנסות שוב'});
 assert.match(html,/role="alert">אפשר לנסות שוב/);assert.match(html,/aria-describedby="event-status-menu-description"/);assert.match(html,/id="event-status-menu-description"/);assert.match(html,/id="event-pin-description"/);
 for(const icon of ['share','archive','danger'])assert.match(html,new RegExp('<i>'+icon+'<\\/i>'));
});
test('event names, identifiers and server messages are escaped without mutating caller state',()=>{
 const value=Object.freeze({...model(),event:Object.freeze({id:'event" data-x="1',name:'<img onerror="x">'}),pinError:'<denied>'});const before=JSON.stringify(value),html=options(value);
 assert.match(html,/&lt;img onerror=&quot;x&quot;&gt;/);assert.match(html,/data-event-id="event&quot; data-x=&quot;1"/);assert.match(html,/&lt;denied&gt;/);assert.doesNotMatch(html,/<img|<denied>/);assert.equal(JSON.stringify(value),before);
});
test('archive and current-list empty actions return to the opposite existing filter',()=>{
 assert.match(empty({view:'archive'}),/data-filter="events">חזרה לאירועים/);assert.match(empty({view:'archive'}),/הארכיון שלך ריק/);
 assert.match(empty({view:'events'}),/data-filter="archive">פתיחת הארכיון/);
});
test('first-event copy has one library icon and preserves the existing create action elsewhere',()=>{
 const html=empty({view:'first'});assert.match(html,/home-first-event-empty/);assert.match(html,/ui-icon-svg/);assert.match(html,/הזמנה שקיבלת בקישור/);assert.doesNotMatch(html,/<img|data-action="new-event"|sogrim-home-hero/);
});
test('brand decoration respects the first-event presentation and removes its old duplicate icon',async()=>{
 const source=await readFile('src/publicBrandLayer.mjs','utf8');const fn=source.slice(source.indexOf('function syncEmptyEventIllustration('),source.indexOf('\nfunction renderHeroArtwork('));
 let removed=0,inserted=0;const old={remove(){removed++}},node={classList:{contains:n=>n==='home-first-event-empty'},querySelector:s=>s==='.product-empty-icon'?old:null,insertAdjacentHTML(){inserted++}};
 const run=runInNewContext(fn+';syncEmptyEventIllustration',{renderEmptyEventArtwork(){throw Error('The old drawing must not be injected into the approved view')}});
 run({querySelector:()=>node},true);assert.equal(removed,1);assert.equal(inserted,0);
});
test('new pure views are available offline and their journeys stay in the cross-platform inventory',async()=>{
 const sw=await readFile('sw.js','utf8');for(const name of ['homeEventOptionsPresentation','homeEmptyStatePresentation'])assert.equal((sw.match(new RegExp('/src/ui/'+name+'\\.mjs','g'))||[]).length,2);
 assert.match(await readFile('playwright.cross-platform.config.mjs','utf8'),/e2e\/home-archive-presentation\.spec\.mjs/);
});
