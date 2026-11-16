import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderRestaurantBillView as screen,renderRestaurantProgressView as progress,renderRestaurantMethodView as method,renderRestaurantDishView as dish} from '../src/ui/restaurantBillPresentation.mjs';
const stages=Object.freeze(['method','items','review']);
const participants=Object.freeze([Object.freeze({id:'a',displayName:'נועם',connectionLabel:'אתה',connectionBadgeHtml:'<small>אתה</small>'}),Object.freeze({id:'b',displayName:'דנה',connectionLabel:'חברה',connectionBadgeHtml:'<small>חברה</small>'})]);
const model=()=>({item:{name:'פסטה',amount:'90',sharedBy:'a',sharedByParticipantIds:['a']},index:0,participants,currencyLabel:'₪',eventId:'event',guestOptionValue:'__add__',allValue:'__all__',customValue:'__custom__'});

test('restaurant presentation preserves explicit method actions and trusted original icons',()=>{
 const html=method({equalIconHtml:'<i>equal</i>',itemsIconHtml:'<i>items</i>'});
 assert.match(html,/restaurant-split-mode" data-mode="equal"/);assert.match(html,/restaurant-split-mode" data-mode="items"/);assert.match(html,/<i>equal<\/i>/);assert.match(html,/<i>items<\/i>/);
});
test('future progress bars cannot shadow the continue action or bypass method selection',()=>{
 const html=progress({stage:'method',stages});assert.equal((html.match(/data-action="restaurant-quick-stage"/g)||[]).length,1);assert.equal((html.match(/ disabled /g)||[]).length,2);assert.doesNotMatch(html,/data-stage="review"/);
});
test('completed progress allows returning to each earlier stage',()=>{
 const html=progress({stage:'review',stages});for(const stage of stages)assert.match(html,new RegExp('data-stage="'+stage+'"'));assert.match(html,/aria-current="step"/);assert.doesNotMatch(html,/ disabled /);
});
test('screen descriptions and error messages retain accessible relationships and escape caller text',()=>{
 const html=screen({stage:'payer',eventId:'event"<x>',currency:'ILS',canEdit:false,blockedMessage:'<denied>',error:'<failed>',bodyHtml:'<p>body</p>'});
 assert.match(html,/aria-describedby="quick-expense-description"/);assert.match(html,/id="quick-expense-description"/);assert.match(html,/<fieldset[^>]*disabled/);assert.match(html,/&lt;denied&gt;/);assert.match(html,/&lt;failed&gt;/);assert.match(html,/event&quot;&lt;x&gt;/);assert.match(html,/<p>body<\/p>/);assert.doesNotMatch(html,/<failed>|<denied>/);
});
test('description-free screens do not point at missing copy',()=>{
 for(const stage of ['method','review']){const html=screen({stage});assert.doesNotMatch(html,/aria-describedby=/);assert.doesNotMatch(html,/id="quick-expense-description"/)}
});
test('a named dish remains editable without repeating its label or opening details automatically',()=>{
 const html=dish(model());assert.match(html,/<details class="quick-item-description-details">/);assert.match(html,/<summary>פסטה<span/);assert.match(html,/data-action="quick-item-name"/);assert.equal((html.match(/תיאור המנה/g)||[]).length,1);assert.match(html,/restaurant-inline-chevron[\s\S]*?<svg/);
});
test('dish view escapes names, amounts and input values without mutating its model',()=>{
 const value=model();value.item=Object.freeze({...value.item,name:'<img onerror="x">',amount:'90" autofocus'});Object.freeze(value);const before=JSON.stringify(value),html=dish(value);
 assert.match(html,/&lt;img onerror=&quot;x&quot;&gt;/);assert.match(html,/90&quot; autofocus/);assert.doesNotMatch(html,/<img/);assert.equal(JSON.stringify(value),before);
});
test('dish selection, inline guest and removal retain their original action identities',()=>{
 const value=model();value.item.sharedBy='__custom__';value.showInlineGuest=true;value.canRemove=true;value.inlineGuestName='אור';const html=dish(value);
 for(const action of ['quick-item-amount','quick-item-shared-by','quick-item-custom-participant','quick-item-new-guest-name','quick-item-add-guest','quick-item-remove'])assert.match(html,new RegExp('data-action="'+action+'"'));
 assert.match(html,/value="a"\s+checked/);assert.match(html,/aria-label="הסר מנה 1"/);assert.match(html,/data-event-id="event"/);assert.match(html,/value="אור"/);assert.doesNotMatch(dish(model()),/data-action="quick-item-remove"/);
});
test('restaurant view is registered for offline loading and cross-platform journeys',async()=>{
 assert.match(await readFile('sw.js','utf8'),/"\/src\/ui\/restaurantBillPresentation\.mjs"/);assert.match(await readFile('playwright.cross-platform.config.mjs','utf8'),/e2e\/restaurant-bill-presentation\.spec\.mjs/);
});
