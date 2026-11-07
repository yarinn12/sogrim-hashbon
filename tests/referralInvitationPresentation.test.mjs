import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {emptyReferralProgramStatus,isAdFreeActive,referralAnnualProgress} from "../src/domain/entitlements.mjs";
import {renderReferralInvitationDialogView,renderReferralInvitationQrView} from "../src/ui/referralInvitationPresentation.mjs";
const layer=readFileSync(process.env.INVITATION_TEST_LAYER||"src/publicReferralRewardsLayer.mjs","utf8");
function fn(name){const start=layer.indexOf("function "+name+"("),next=layer.slice(start+1).search(/\n(?:async )?function /);return layer.slice(start,next<0?undefined:start+1+next)}
function render({status="ready",days=0,rewardDays=30,error="",busy=false,code="0123456789abcdefabcd",stats=false}={}){
 const referralStatus={...emptyReferralProgramStatus(status),rewardDays,referralCode:code,adFreeUntil:days?new Date(Date.now()+days*86400000).toISOString():"",rewardedReferrals:stats?3:0,daysEarned:stats?90:0,pendingReferrals:stats?2:0};
 return runInNewContext(fn('referralDialogMarkup')+';referralDialogMarkup()',{
 referralStatus,referralError:error,referralBusy:busy,referralNotice:"",runtimeConfig:{},runtimePublicOrigin:()=>"https://example.invalid",buildReferralInviteUrl:(_,c)=>c?'https://example.invalid/r/'+c:'',isAdFreeActive,referralAnnualProgress,
 renderReferralInvitationDialogView,giftIcon:()=>'<svg data-existing-gift="true"></svg>',escapeAttribute:value=>String(value??" ").replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;").replaceAll(">","&gt;"),closeIcon:()=>'<svg data-close="true"></svg>',shareIcon:()=>'<svg data-share="true"></svg>',copyIcon:()=>'<svg data-copy="true"></svg>',referralQrMarkup:()=>'<figure data-existing-qr="true"></figure>',referralLoadingMarkup:()=>'<div data-loading="true"></div>',formatDate:()=>"7 בנובמבר 2026"});
}
test('invitation gives sharing a single practical heading and literal actions',()=>{const html=render();assert.match(html,/>הזמנת חברים<\/h2>/);assert.doesNotMatch(html,/המתנה שלך|referral-dialog-mark|referral-dialog-lead|referral-section-heading/);assert.match(html,/>שיתוף קישור<\/span>/);assert.match(html,/>העתקת קישור<\/span>/);assert.match(html,/<strong>פרטי ההטבה<\/strong>/)});
for(const[rewardDays,title]of [[30,'חודש ללא פרסומות'],[14,'14 ימים ללא פרסומות'],[1,'יום אחד ללא פרסומות']])test(`invitation displays actual reward duration ${rewardDays}`,()=>{assert.ok(render({rewardDays}).includes('>'+title+'<'))});
test('active invitation retains exact expiry without changing the offered benefit',()=>{const html=render({days:12});assert.match(html,/ההטבה שלך פעילה עד 7 בנובמבר 2026/);assert.match(html,/חודש ללא פרסומות/)});
test('loading hides link actions and QR until status resolves',()=>{const html=render({status:'loading'});assert.match(html,/data-loading/);assert.doesNotMatch(html,/data-referral-action="(?:copy|share)"|data-existing-qr/)});
test('program-unavailable state keeps the existing profile action and no invitation',()=>{const html=render({status:'signed-out'});assert.match(html,/data-referral-action="profile"/);assert.doesNotMatch(html,/data-referral-action="(?:copy|share)"|data-existing-qr/)});
test('blocking error offers retry without a link',()=>{const html=render({status:'error',error:'הבדיקה נכשלה',code:''});assert.match(html,/is-error/);assert.match(html,/data-referral-action="retry"/);assert.doesNotMatch(html,/data-referral-action="(?:copy|share)"|data-existing-qr/)});
test('cached active status preserves invitation and offers refresh',()=>{const html=render({status:'error',days:12,error:'הבדיקה נכשלה'});assert.match(html,/is-stale/);assert.match(html,/data-referral-action="retry"/);assert.match(html,/data-referral-action="share"/);assert.match(html,/data-existing-qr/)});
test('busy and unavailable URL retain disabled-action semantics',()=>{for(const args of [{busy:true},{code:''}]){const html=render(args);assert.match(html,/data-referral-action="share"[^>]*disabled/);assert.match(html,/data-referral-action="copy"[^>]*disabled/)}});
test('existing QR figure preserves trusted generator markup with one useful caption',()=>{const html=renderReferralInvitationQrView('<svg data-canonical="yes"></svg>');assert.match(html,/<div class="referral-qr-code"><svg data-canonical="yes"><\/svg><\/div>/);assert.match(html,/אפשר גם לסרוק את הקוד/);assert.equal((html.match(/<figcaption>/g)||[]).length,1)});
test('shared invitation view remains in both offline inventories',()=>{const sw=readFileSync('sw.js','utf8');assert.equal((sw.match(/"\/src\/ui\/referralInvitationPresentation\.mjs"/g)||[]).length,2)});
