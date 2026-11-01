import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {renderProfileIdentitySummaryView} from "../src/ui/profileIdentityPresentation.mjs";
const app=readFileSync(process.env.PROFILE_IDENTITY_TEST_APP||"src/app.mjs","utf8");
const start=app.indexOf("function renderProfileSetup()");
const renderSource=app.slice(start,app.indexOf("\nfunction ",start+1));
const escapeHtml=value=>String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
function render({firstRun=false,invite=false,nameEditing=false,usernameEditing=false,name='נועם לוי',username='noam_levi',bitEnabled=false}={}){
 const context={runtimeConfig:{features:{bitQrProfile:bitEnabled}},window:{location:{href:'https://example.invalid/'}},parseInviteEventId:()=>invite?'event':null,getEvent:()=>({name:'טיול <בדיקה>'}),screen:{name:'profile'},localProfile:firstRun?null:{displayName:name},profileNameDraft:name,profileNameEditing:nameEditing,profileUsernameEditing:usernameEditing,profileError:'',adminAnalytics:{status:'idle'},escapeHtml,escapeAttribute:escapeHtml,renderAppBackButton:()=>'',renderNotice:()=>'',renderProfileAvatarPicker:()=>'',renderInviteProfilePreview:()=>'<div>invite-preview</div>',renderProfileUsernameField:()=>'<label>username editor</label>',profileUsernameEditorReady:()=>true,currentFriendUsername:()=>username,formatUsername:x=>x.replace(/^@/,''),iconSvg:name=>`<svg data-icon="${name}"></svg>`,renderProfileIdentitySummaryView};
 return runInNewContext(renderSource+';renderProfileSetup()',context);
}
test('profile overview omits redundant helper while first-run and event-invite keep instructions',()=>{assert.doesNotMatch(render(),/<p class="muted">/);assert.match(render({firstRun:true}),/<p class="muted">נשמור את השם/);assert.match(render({invite:true}),/נכניס אותך אל &quot;טיול &lt;בדיקה&gt;&quot;/);assert.match(render({invite:true}),/invite-preview/)});
test('profile overview shows short full-name caption with both original edit and arrow affordances',()=>{const html=render();assert.match(html,/<span>שם מלא<\/span>/);for(const action of ['edit-profile-name','edit-profile-username'])assert.match(html,new RegExp('data-action="'+action+'"'));assert.equal((html.match(/profile-shortcut-chevron/g)||[]).length,4);assert.equal((html.match(/data-icon="edit"/g)||[]).length,2);assert.match(html,/<bdi dir="ltr">noam_levi<\/bdi>/)});
test('edit branches retain original full-name input and save/cancel actions',()=>{const html=render({nameEditing:true,usernameEditing:true});assert.match(html,/placeholder="שם פרטי ושם משפחה"/);assert.match(html,/data-action="cancel-profile-name-edit"/);assert.match(html,/data-action="cancel-profile-username-edit"/);assert.equal((html.match(/data-action="save-profile"/g)||[]).length,2);assert.doesNotMatch(html,/data-action="edit-profile-name"|data-action="edit-profile-username"/)});
test('profile identity escapes values and preserves normalized or missing username presentation',()=>{assert.doesNotMatch(render({name:'<img src=x onerror=1>',username:'<script>'}),/<img|<script>/);assert.match(render({username:'@noam_levi'}),/<bdi dir="ltr">noam_levi<\/bdi>/);assert.match(render({username:''}),/<bdi dir="ltr">—<\/bdi>/)});
test('profile identity module stays in both offline inventories',()=>{assert.equal((readFileSync('sw.js','utf8').match(/"\/src\/ui\/profileIdentityPresentation\.mjs"/g)||[]).length,2)});

test('Bit is an optional existing-profile slot, never a signup requirement',()=>{assert.match(render({bitEnabled:true}),/data-bit-profile-host/);assert.doesNotMatch(render(),/data-bit-profile-host/);assert.doesNotMatch(render({firstRun:true,bitEnabled:true}),/data-bit-profile-host/);});
