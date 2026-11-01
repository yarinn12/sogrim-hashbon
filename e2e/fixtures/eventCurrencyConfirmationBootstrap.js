(() => {
  if (globalThis.__friendInviteQa) return;
  const params=new URLSearchParams(location.search),actor='11111111-1111-4111-8111-111111111111',target='22222222-2222-4222-8222-222222222222',relation='33333333-3333-4333-8333-333333333333',code='abcdefabcdefabcdefab';
  const qa=globalThis.__friendInviteQa={referralReads:[],rewardWrites:[],shared:[],copied:[],profileWrites:[],phase:params.get('qa-invite-phase')||'new',reads:[],writes:[],release:null,holdRead:params.has('qa-hold-read'),holdWrite:params.has('qa-hold-write')};
  const auth='https://friend-invitation-fixture.supabase.co',space='friend-invitation-space',key='synthetic-friend-invitation-space-key-123456';
  const demoName=params.has('long-profile')?'נועם אלכסנדר לוי כהן עם שם משפחה ארוך ABCDEFGHIJKLMNOPQRSTUVWXYZ':'נועם לוי';
  const demoUsername=params.has('long-profile')?'noam_alexander_levi_1234':'noam_levi';
  const user={id:actor,email:params.has('long-email')?'noam.alexander.levi.long.account.name@example.invalid':'noam@example.invalid',app_metadata:{provider:'google'},user_metadata:{full_name:demoName,username:demoUsername,username_customized:true,account_space_id:space,account_space_key:key}};
  const owner={user_id:actor,username:demoUsername,username_customized:true,display_name:demoName,avatar_preset:'avatar-1',updated_at:'2026-10-10T10:00:00.000Z'};
  const person={user_id:target,username:'dana_levi',username_customized:true,display_name:params.has('qa-long-name')?'דנה אלכסנדרה לוי כהן עם שם משפחה ארוך ABCDEFGHIJKLMNOPQRSTUVWXYZ':'דנה לוי',avatar_preset:'avatar-2',updated_at:'2026-10-10T10:00:00.000Z'};
  const mode=params.get('requests')||'mixed';
  const itay={user_id:'44444444-4444-4444-8444-444444444444',username:'itay_cohen',username_customized:true,display_name:'איתי כהן',avatar_preset:'avatar-3',updated_at:person.updated_at};
  if(params.has('long-names')){person.display_name='דנה אלכסנדרה לוי כהן עם שם משפחה ארוך ABCDEFGHIJKLMNOPQRSTUVWXYZ';itay.display_name='איתי ליאור ישראלי כהן עם שם משפחה ארוך';}
  const relationFor=(id,from,to)=>({id,requester_id:from,addressee_id:to,status:'pending',requested_at:'2026-10-10T10:00:00.000Z',updated_at:'2026-10-10T10:00:00.000Z'});
  let requestRows=mode==='empty'?[]:mode==='incoming'?[relationFor(relation,target,actor)]:mode==='outgoing'?[relationFor('55555555-5555-4555-8555-555555555555',actor,itay.user_id)]:[relationFor(relation,target,actor),relationFor('55555555-5555-4555-8555-555555555555',actor,itay.user_id)];
  const extraPeople=[{user_id:'66666666-6666-4666-8666-666666666666',username:'noa_shahar',username_customized:true,display_name:'נועה שחר',avatar_preset:'avatar-2',updated_at:person.updated_at},{user_id:'77777777-7777-4777-8777-777777777777',username:'ron_hadar',username_customized:true,display_name:'רון הדר',avatar_preset:'avatar-3',updated_at:person.updated_at},{user_id:'88888888-8888-4888-8888-888888888888',username:'tamar_raz',username_customized:true,display_name:'תמר רז',avatar_preset:'avatar-2',updated_at:person.updated_at}];
  if(mode==='many')requestRows.push(relationFor('99999999-9999-4999-8999-999999999991',extraPeople[0].user_id,actor),relationFor('99999999-9999-4999-8999-999999999992',extraPeople[1].user_id,actor),relationFor('99999999-9999-4999-8999-999999999993',actor,extraPeople[2].user_id));
  qa.requestRows=requestRows;
  const participantId='account-'+actor,state={currentParticipantId:participantId,participants:[{id:participantId,displayName:demoName,kind:'user',accountLinked:true,authSubject:actor,avatarPreset:'avatar-1'}],friendContacts:[],groups:[],events:[],deletedEvents:[],deletedParticipants:[]};

  const friendId='account-'+target;state.participants.push({id:friendId,displayName:person.display_name,username:person.username,kind:'member',accountLinked:true,authSubject:target,avatarPreset:'avatar-2'});
  state.friendContacts=[{id:'synthetic-friend-contact',participantId:friendId,active:true,source:'friendship'}];
  requestRows.splice(0,requestRows.length,{id:relation,requester_id:actor,addressee_id:target,status:'accepted',requested_at:'2026-10-01T10:00:00.000Z',updated_at:'2026-10-01T10:00:00.000Z'});
  const expense=(id,name,total,payer,creator=actor)=>({id,name,total,payers:[{participantId:payer,amount:total}],sharedByParticipantIds:[participantId,friendId],createdByParticipantId:'account-'+creator,occurredOn:'2026-10-21',createdAt:'2026-10-21T10:00:00.000Z',updatedAt:'2026-10-21T10:00:00.000Z'});
  const event=(id,name,createdAt,expenses)=>({id,name,eventType:'standard',currency:'ILS',participantIds:[participantId,friendId],adminIds:[participantId],createdByParticipantId:participantId,createdAt,updatedAt:createdAt,expenses,transfers:[{id:'transfer-'+(id==='friend-beach'?participantId:friendId)+'-'+(id==='friend-beach'?friendId:participantId)+'-'+(id==='friend-beach'?3000:6000),fromParticipantId:id==='friend-beach'?participantId:friendId,toParticipantId:id==='friend-beach'?friendId:participantId,amount:id==='friend-beach'?3000:6000,status:'pending'}],activityLog:[],notes:[],inactiveParticipantIds:[],locked:false,closedAt:null,deletedNotes:[],participantAliases:{},distinctParticipantPairs:[],deletedExpenses:[]});
  state.events=params.has('empty-history')?[]:[event('friend-weekend','סוף השבוע בצפון','2026-10-21T10:00:00.000Z',[expense('dinner-1','ארוחת ערב',30000,participantId),expense('hotel','לינה',18000,friendId,target)]),event('friend-friday','ארוחת שישי','2026-10-16T10:00:00.000Z',[expense('dinner-2','ארוחת ערב',12000,participantId)]),event('friend-beach','טיול לים','2026-10-10T10:00:00.000Z',[expense('parking','חניה וקפה',6000,friendId,target)])];
  if(params.has('long-event-name'))state.events[0].name='סוף השבוע הארוך עם המשפחה והחברים בצפון ובגליל ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if(params.get('friends')!=='none'){state.participants.push({id:'account-'+itay.user_id,displayName:itay.display_name,username:itay.username,kind:'member',accountLinked:true,authSubject:itay.user_id,avatarPreset:'avatar-3'});state.friendContacts.push({id:'synthetic-extra-friend',participantId:'account-'+itay.user_id,active:true,source:'friendship'});requestRows.push({id:'55555555-5555-4555-8555-555555555555',requester_id:actor,addressee_id:itay.user_id,status:'accepted',requested_at:'2026-10-01T10:00:00.000Z',updated_at:'2026-10-01T10:00:00.000Z'})}

  const picker=params.get('picker')||'filled';
  if(picker==='none'){state.friendContacts=[];requestRows.splice(0,requestRows.length);state.participants=state.participants.filter(p=>state.events.some(e=>e.participantIds.includes(p.id)));}
  else {
    for(const [i,profile]of extraPeople.slice(0,2).entries()){const id='account-'+profile.user_id;state.participants.push({id,displayName:profile.display_name,username:profile.username,kind:'member',accountLinked:true,authSubject:profile.user_id,avatarPreset:profile.avatar_preset});state.friendContacts.push({id:'picker-contact-'+i,participantId:id,active:true,source:'friendship'});requestRows.push({id:'99999999-9999-4999-8999-99999999999'+i,requester_id:actor,addressee_id:profile.user_id,status:'accepted',requested_at:'2026-10-01T10:00:00.000Z',updated_at:'2026-10-01T10:00:00.000Z'});}
    if(picker!=='all'){state.participants.push({id:'saved-manual-yael',displayName:params.has('long-names')?'יעל אלכסנדרה ישראלי כהן עם שם משפחה ארוך':'יעל ישראלי',kind:'guest',avatarPreset:'avatar-2'});state.friendContacts.push({id:'picker-manual-contact',participantId:'saved-manual-yael',active:true,source:'manual'});}
    if(picker==='all')state.events[0].participantIds.push(...state.participants.filter(p=>!state.events[0].participantIds.includes(p.id)).map(p=>p.id));
  }
  if(state.events[0])Object.assign(state.events[0],{sharedSpaceId:'synthetic-share-event-space',sharedSpaceKey:'synthetic-share-event-key-abcdefghijklmnopqrstuvwxyz',openInviteToken:'synthetic_event_share_token_20261029_abcdef'});
if(params.has('settings-readonly')) { state.events[0].adminIds=[friendId];state.events[0].createdByParticipantId=friendId;state.events[0].adminsCanEditOnly=true; }
if(params.has('settings-long-title')) state.events[0].name='סוף השבוע המשפחתי בצפון עם שם אירוע ארוך במיוחד ABCDEFGHIJKLMNOPQRSTUVWXYZ';
if(params.has('settings-cover')) state.events[0].coverImage='/assets/sogrim-logo-intro-poster.jpg';


if(params.has('management-centralized')) state.events[0].adminsCanEditOnly=true;
if(params.has('management-locked')) state.events[0].locked=true;
if(params.has('management-long-admins')) {
 const friend=state.participants.find(p=>p.id===friendId);friend.displayName='דנה אלכסנדרה ישראלי כהן עם שם משפחה ארוך';state.events[0].adminIds.push(friendId);
}
if(params.has('currency-empty')){state.events[0].expenses=[];state.events[0].transfers=[];}
if(params.has('currency-converted')) state.events[0].expenses[0].fxConversion={version:1,sourceCurrency:'USD',sourceAmountMinorUnits:'10000',sourceFractionDigits:2,sourcePayers:[{participantId,amountMinorUnits:'10000'}],targetCurrency:'ILS',targetAmountMinorUnits:'30000',targetFractionDigits:2,rate:'3',rateUnits:'target major units per 1 source major unit',mode:'manual',source:'user',sourceDate:null,fetchedAt:null};
qa.currencyDenied=[];qa.canonicalWrites=[];const canonicalRow={id:'synthetic-share-event-space',state:{...structuredClone(state),events:[structuredClone(state.events[0])]},updated_at:'2026-10-10T10:00:00.000Z'};

qa.snapshotWrites=[];qa.seedFinancialEvents=structuredClone(state.events);
  const row={id:space,state,updated_at:'2026-10-10T10:00:00.000Z'};
  const session={access_token:'synthetic-invite-access',refresh_token:'synthetic-invite-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user};
  const profile={participantId,displayName:demoName,authProvider:'google',authSubject:actor,email:user.email,avatarPreset:'avatar-1'};
  localStorage.setItem('settle-friends-state:'+space,JSON.stringify(state));
  localStorage.setItem('settle-friends-cloud-space',space);localStorage.setItem('settle-friends-cloud-key:'+space,key);localStorage.setItem('settle-friends-current-participant:account:'+actor,participantId);
  localStorage.setItem('settle-friends-local-profile:account:'+actor,JSON.stringify(profile));
  localStorage.setItem('settle-friends-account-session',JSON.stringify(session));
  localStorage.setItem('qa-invite-server-row',JSON.stringify(row));
  sessionStorage.setItem('settle-friends-skip-next-splash','1');
  if(params.get('sync-scenario')==='permission'){
    const ids=params.get('pending-events')==='one'?['friend-weekend']:['friend-weekend','friend-friday'];
    const queued=structuredClone(state);
    queued.__pendingSync={version:1,selection:{eventIds:ids,deletedEventIds:[]},blocked:{version:1,accountUserId:actor,blockAll:true,failureKind:'permission',deferredFailures:ids.map(id=>({kind:'event',id,code:'SHARED_EVENT_MEMBERSHIP_REVOKED',status:403}))}};
    qa.pendingKey='settle-friends-pending-sync:'+space;qa.pendingSeed=structuredClone(queued);qa.failedPendingAttempts=[];
    localStorage.setItem(qa.pendingKey,JSON.stringify(queued));
  }
  const config={publicUrl:"http://127.0.0.1:60302",storage:{mode:'supabase',url:auth,anonKey:'synthetic-anon',table:'app_snapshots',account:{userId:actor,accessToken:session.access_token,spaceId:space,spaceKey:key}}};
  if(params.get('reward')==='signed-out')config.storage.mode='local';
  Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{qa.shared.push(data)}});
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{qa.copied.push(value)}}});
  const original=globalThis.fetch.bind(globalThis),response=(value,status=200)=>Promise.resolve(new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}}));
  const gates=[];const pause=async kind=>{if(!qa[kind])return;await new Promise(resolve=>{gates.push(resolve);qa.release=()=>{qa[kind]=false;qa.release=null;for(const done of gates.splice(0))done()}})};
  globalThis.fetch=async(input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url,location.href),method=String(options.method||input?.method||'GET').toUpperCase(),body=options.body?JSON.parse(options.body):{};
    if(url.pathname==='/api/account'&&method==='DELETE'){
      (qa.deletionRequests??=[]).push({method,body,authorization:options.headers?.authorization});
      if(params.has('deletion-hold')&&!qa.deletionReleased)await new Promise(resolve=>qa.releaseDeletion=()=>{qa.deletionReleased=true;resolve()});
      return response({error:'Synthetic deletion blocked'},503);
    }
    if(url.pathname==='/api/event-invites/open-link'){
(qa.invitePreparations??=[]).push({method,body});const mode=qa.shareMode||params.get('share-state')||'ready';
if(mode==='loading')await new Promise(done=>qa.releaseShare=()=>{qa.shareMode='ready';done()});
if(mode==='error'){if(params.has('recover-after-failure'))qa.shareMode='ready';return response({code:'SYNTHETIC_INVITE_UNAVAILABLE',message:'לא הצלחנו להכין את הקישור כרגע. אפשר לנסות שוב.'},503)}
if(mode==='auth')return response({code:'AUTH_REQUIRED',message:'החיבור לחשבון פג. התחברו מחדש ונסו שוב.'},401);
if(mode==='forbidden')return response({code:'EVENT_INVITE_NOT_ALLOWED',message:'אין לך הרשאה לשתף את האירוע הזה.'},403);
return response({eventId:body.eventId,token:'synthetic_event_share_token_20261029_abcdef'});
}
    if(url.pathname==='/api/config')return response(config);
    if(url.pathname==='/api/health')return response({ok:true});
    if(url.pathname.startsWith('/api/notifications'))return response({ok:true,notifications:[],unreadCount:0});
    if(url.pathname==='/api/admin/overview')return response({message:'not admin'},403);
    if(url.pathname==='/api/product-metrics')return response({ok:true});
    if(url.origin!==auth){if(url.origin===location.origin)return original(input,options);throw Error('External request blocked by synthetic fixture')}
    if(url.pathname.endsWith('/auth/v1/user'))return response(user);
    if(url.pathname.endsWith('/auth/v1/token'))return response({...session,expires_in:3600});
    const rpc=url.pathname.split('/rpc/')[1];
    if(rpc==='update_shared_event_snapshot'){if(params.has('currency-confirmation-denied')&&body.p_state?.events?.some(e=>e.id==='friend-weekend'&&e.currency!=='ILS')){qa.currencyDenied.push({kind:'shared',body:structuredClone(body)});return response({code:'42501',message:'Synthetic currency change denied'},403)}if(params.get('sync-scenario')==='permission'&&!qa.allowPendingAcknowledgement){qa.failedPendingAttempts.push({kind:'shared',body:structuredClone(body)});return response({code:'SHARED_EVENT_MEMBERSHIP_REVOKED',message:'Synthetic permission rejection'},403)}if(body.p_snapshot_id!==canonicalRow.id)return response({message:'Wrong synthetic shared scope'},403);qa.canonicalWrites.push(structuredClone(body.p_state));canonicalRow.state=structuredClone(body.p_state);canonicalRow.updated_at=new Date().toISOString();return response({status:'updated',updatedAt:canonicalRow.updated_at})}
    if(url.pathname.endsWith('/app_snapshots')&&method==='GET'&&url.searchParams.get('id')==='eq.'+canonicalRow.id)return response([canonicalRow]);
    if(rpc==='submit_app_feedback'){
      (qa.feedbackRequests??=[]).push({body,headers:options.headers});
      if(params.has('feedback-hold')&&!qa.feedbackReleased)await new Promise(resolve=>qa.releaseFeedback=()=>{qa.feedbackReleased=true;resolve()});
      return params.get('feedback-result')==='success'?response(null,201):response({message:'Synthetic feedback failure'},503);
    }
    if(rpc==='ensure_account_workspace')return response({status:'existing',workspaceId:space});
    if(rpc==='get_referral_program_status'){
      qa.referralReads.push(body);
      const mode=qa.rewardMode||params.get('reward')||'inactive';
      if(mode==='loading')await new Promise(done=>{qa.releaseReward=done});
      if(mode==='error')return response({message:'Synthetic status unavailable'},503);
      return response({rewarded_referrals:params.has('stats')?3:0,days_earned:params.has('stats')?90:0,pending_referrals:params.has('stats')?2:0,annual_reward_limit:12,referral_code:'0123456789abcdefabcd',ad_free_active:mode==='active'||mode==='lastday',ad_free_until:mode==='active'||mode==='lastday'?new Date(Date.now()+(mode==='lastday'?.5:12)*86400000).toISOString():null,reward_days:Number(params.get('reward-days')||30),active_entitlement_sources:mode==='active'?['referral']:[]});
    }
    if(rpc==='claim_referral'||rpc==='qualify_referral'){qa.rewardWrites.push({rpc,body});return response({message:'Reward mutations disabled in local sketch'},501)}
    if(rpc==='resolve_friend_invitation'){
      qa.reads.push(body);await pause('holdRead');
      if(qa.phase==='error')return response({message:'Temporarily unavailable'},503);
      if(body.p_friend_code!==code||['unavailable','self'].includes(qa.phase))return response({status:qa.phase==='self'?'self':'unavailable'});
      return response({status:'ready',relationship:qa.phase,friendship_id:qa.phase==='new'?null:relation,profile:person});
    }
    if(rpc==='manage_friendship'){
      qa.writes.push({rpc,body});await pause('holdWrite');
      if(qa.failNextWrite){qa.failNextWrite=false;return response({message:'Synthetic rejected action'},503)}
      const row=requestRows.find(row=>row.id===body.p_friendship_id);if(!row)return response({message:'Unknown synthetic request'},404);
      if(row.status!=='pending')return response({message:'Only pending requests can be managed'},403);
      if(body.p_action==='accept'&&row.addressee_id===actor)row.status='accepted';
      else if(body.p_action==='decline'&&row.addressee_id===actor)row.status='declined';
      else if(body.p_action==='cancel'&&row.requester_id===actor){requestRows.splice(requestRows.indexOf(row),1);return response({id:row.id,status:'cancelled'})}
      else return response({message:'Synthetic permission denied'},403);
      return response({id:row.id,status:row.status});
    }
    if(rpc==='request_friendship'||rpc==='manage_friendship'){
      qa.writes.push({rpc,body});await pause('holdWrite');
      if(qa.phase==='write-error')return response({message:'Synthetic write rejected'},503);
      if(rpc==='request_friendship'&&body.p_friend_code===code){qa.phase=qa.phase==='incoming'?'accepted':'outgoing';return response({id:relation,status:qa.phase==='accepted'?'accepted':'pending'})}
      if(rpc==='manage_friendship'&&body.p_friendship_id===relation&&body.p_action==='accept'&&qa.phase==='incoming'){qa.phase='accepted';return response({id:relation,status:'accepted'})}
      return response({message:'Invalid synthetic action'},403);
    }
    if(url.pathname.endsWith('/app_snapshots')){
      let saved=JSON.parse(localStorage.getItem('qa-invite-server-row'));
      if(method==='GET')return response(url.searchParams.has('snapshot_kind')?[]:[saved]);
      if(params.get('sync-scenario')==='permission'&&!qa.allowPendingAcknowledgement){qa.failedPendingAttempts.push({kind:'personal',body:structuredClone(body)});return response({code:'42501',message:'Synthetic permission rejection'},403)}
      if(params.has('currency-confirmation-denied')&&(Array.isArray(body)?body[0]:body)?.state?.events?.some(e=>e.id==='friend-weekend'&&e.currency!=='ILS')){qa.currencyDenied.push({kind:'personal',body:structuredClone(body)});return response({code:'42501',message:'Synthetic currency change denied'},403)}qa.snapshotWrites.push({method,body});const next=Array.isArray(body)?body[0]:body;if(next.state){saved={...saved,state:next.state,updated_at:next.updated_at||saved.updated_at};localStorage.setItem('qa-invite-server-row',JSON.stringify(saved))}return response([saved]);
    }
    if(url.pathname.endsWith('/friendships'))return response(requestRows);
    if(url.pathname.endsWith('/user_profiles')){if(method==='PATCH')qa.profileWrites.push(body);return response([owner,person,itay,...extraPeople])}
    if(url.pathname.endsWith('/friend_invite_codes'))return response([{code:'0123456789abcdefabcd'}]);
    if(method==='GET')return response([]);
    return response({message:'Unhandled synthetic endpoint'},501);
  };
})();

(()=>{const qa=globalThis.__friendInviteQa;qa.shareWindows=[];window.open=()=>({closed:false,opener:null,document:{title:''},location:{replace:url=>qa.shareWindows.push(url)},close(){this.closed=true}})})();
