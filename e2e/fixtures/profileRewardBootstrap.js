(() => {
  if (globalThis.__friendInviteQa) return;
  const params=new URLSearchParams(location.search),actor='11111111-1111-4111-8111-111111111111',target='22222222-2222-4222-8222-222222222222',relation='33333333-3333-4333-8333-333333333333',code='abcdefabcdefabcdefab';
  const qa=globalThis.__friendInviteQa={referralReads:[],rewardWrites:[],shared:[],copied:[],profileWrites:[],phase:params.get('qa-invite-phase')||'new',reads:[],writes:[],release:null,holdRead:params.has('qa-hold-read'),holdWrite:params.has('qa-hold-write')};
  const auth='https://friend-invitation-fixture.supabase.co',space='friend-invitation-space',key='synthetic-friend-invitation-space-key-123456';
  const demoName=params.has('long-profile')?'נועם אלכסנדר לוי כהן עם שם משפחה ארוך ABCDEFGHIJKLMNOPQRSTUVWXYZ':'נועם לוי';
  const demoUsername=params.has('long-profile')?'noam_alexander_levi_1234':'noam_levi';
  const user={id:actor,email:'noam@example.invalid',app_metadata:{provider:'google'},user_metadata:{full_name:demoName,username:demoUsername,username_customized:true,account_space_id:space,account_space_key:key}};
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
  const row={id:space,state,updated_at:'2026-10-10T10:00:00.000Z'};
  const session={access_token:'synthetic-invite-access',refresh_token:'synthetic-invite-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user};
  const profile={participantId,displayName:demoName,authProvider:'google',authSubject:actor,email:user.email,avatarPreset:'avatar-1'};
  localStorage.setItem('settle-friends-state:'+space,JSON.stringify(state));
  localStorage.setItem('settle-friends-cloud-space',space);localStorage.setItem('settle-friends-cloud-key:'+space,key);localStorage.setItem('settle-friends-current-participant:account:'+actor,participantId);
  localStorage.setItem('settle-friends-local-profile:account:'+actor,JSON.stringify(profile));
  localStorage.setItem('settle-friends-account-session',JSON.stringify(session));
  localStorage.setItem('qa-invite-server-row',JSON.stringify(row));
  sessionStorage.setItem('settle-friends-skip-next-splash','1');
  const config={publicUrl:location.origin,storage:{mode:'supabase',url:auth,anonKey:'synthetic-anon',table:'app_snapshots',account:{userId:actor,accessToken:session.access_token,spaceId:space,spaceKey:key}}};
  if(params.get('reward')==='signed-out')config.storage.mode='local';
  Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{qa.shared.push(data)}});
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{qa.copied.push(value)}}});
  const original=globalThis.fetch.bind(globalThis),response=(value,status=200)=>Promise.resolve(new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}}));
  const gates=[];const pause=async kind=>{if(!qa[kind])return;await new Promise(resolve=>{gates.push(resolve);qa.release=()=>{qa[kind]=false;qa.release=null;for(const done of gates.splice(0))done()}})};
  globalThis.fetch=async(input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url,location.href),method=String(options.method||input?.method||'GET').toUpperCase(),body=options.body?JSON.parse(options.body):{};
    if(url.pathname==='/api/config')return response(config);
    if(url.pathname==='/api/health')return response({ok:true});
    if(url.pathname.startsWith('/api/notifications'))return response({ok:true,notifications:[],unreadCount:0});
    if(url.pathname==='/api/admin/overview')return response({message:'not admin'},403);
    if(url.pathname==='/api/product-metrics')return response({ok:true});
    if(url.origin!==auth){if(url.origin===location.origin)return original(input,options);throw Error('External request blocked by synthetic fixture')}
    if(url.pathname.endsWith('/auth/v1/user'))return response(user);
    if(url.pathname.endsWith('/auth/v1/token'))return response({...session,expires_in:3600});
    const rpc=url.pathname.split('/rpc/')[1];
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
      const next=Array.isArray(body)?body[0]:body;if(next.state){saved={...saved,state:next.state,updated_at:next.updated_at||saved.updated_at};localStorage.setItem('qa-invite-server-row',JSON.stringify(saved))}return response([saved]);
    }
    if(url.pathname.endsWith('/friendships'))return response(requestRows);
    if(url.pathname.endsWith('/user_profiles')){if(method==='PATCH')qa.profileWrites.push(body);return response([owner,person,itay,...extraPeople])}
    if(url.pathname.endsWith('/friend_invite_codes'))return response([{code:'0123456789abcdefabcd'}]);
    if(method==='GET')return response([]);
    return response({message:'Unhandled synthetic endpoint'},501);
  };
})();

