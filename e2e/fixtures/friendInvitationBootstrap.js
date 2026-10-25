(() => {
  if (globalThis.__friendInviteQa) return;
  const params=new URLSearchParams(location.search),actor='11111111-1111-4111-8111-111111111111',target='22222222-2222-4222-8222-222222222222',relation='33333333-3333-4333-8333-333333333333',code='abcdefabcdefabcdefab';
  const qa=globalThis.__friendInviteQa={phase:params.get('qa-invite-phase')||'new',reads:[],writes:[],release:null,holdRead:params.has('qa-hold-read'),holdWrite:params.has('qa-hold-write')};
  const auth='https://friend-invitation-fixture.supabase.co',space='friend-invitation-space',key='synthetic-friend-invitation-space-key-123456';
  const user={id:actor,email:'noam@example.invalid',app_metadata:{provider:'google'},user_metadata:{full_name:'נועם לוי',username:'noam_levi',username_customized:true,account_space_id:space,account_space_key:key}};
  const owner={user_id:actor,username:'noam_levi',username_customized:true,display_name:'נועם לוי',avatar_preset:'avatar-1',updated_at:'2026-10-10T10:00:00.000Z'};
  const person={user_id:target,username:'dana_levi',username_customized:true,display_name:params.has('qa-long-name')?'דנה אלכסנדרה לוי כהן עם שם משפחה ארוך ABCDEFGHIJKLMNOPQRSTUVWXYZ':'דנה לוי',avatar_preset:'avatar-2',updated_at:'2026-10-10T10:00:00.000Z'};
  const participantId='account-'+actor,state={currentParticipantId:participantId,participants:[{id:participantId,displayName:'נועם לוי',kind:'user',accountLinked:true,authSubject:actor,avatarPreset:'avatar-1'}],friendContacts:[],groups:[],events:[],deletedEvents:[],deletedParticipants:[]};
  const row={id:space,state,updated_at:'2026-10-10T10:00:00.000Z'};
  const session={access_token:'synthetic-invite-access',refresh_token:'synthetic-invite-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user};
  const profile={participantId,displayName:'נועם לוי',authProvider:'google',authSubject:actor,email:user.email,avatarPreset:'avatar-1'};
  localStorage.setItem('settle-friends-state:'+space,JSON.stringify(state));
  localStorage.setItem('settle-friends-cloud-space',space);localStorage.setItem('settle-friends-cloud-key:'+space,key);localStorage.setItem('settle-friends-current-participant:account:'+actor,participantId);
  localStorage.setItem('settle-friends-local-profile:account:'+actor,JSON.stringify(profile));
  localStorage.setItem('settle-friends-account-session',JSON.stringify(session));
  localStorage.setItem('qa-invite-server-row',JSON.stringify(row));
  sessionStorage.setItem('settle-friends-skip-next-splash','1');
  const config={publicUrl:location.origin,storage:{mode:'supabase',url:auth,anonKey:'synthetic-anon',table:'app_snapshots',account:{userId:actor,accessToken:session.access_token,spaceId:space,spaceKey:key}}};
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
    if(rpc==='get_referral_program_status')return response({referral_code:'',ad_free_active:false,reward_days:30});
    if(rpc==='resolve_friend_invitation'){
      qa.reads.push(body);await pause('holdRead');
      if(qa.phase==='error')return response({message:'Temporarily unavailable'},503);
      if(body.p_friend_code!==code||['unavailable','self'].includes(qa.phase))return response({status:qa.phase==='self'?'self':'unavailable'});
      return response({status:'ready',relationship:qa.phase,friendship_id:qa.phase==='new'?null:relation,profile:person});
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
    if(url.pathname.endsWith('/friendships'))return response(['incoming','outgoing','accepted'].includes(qa.phase)?[{id:relation,requester_id:qa.phase==='incoming'?target:actor,addressee_id:qa.phase==='incoming'?actor:target,status:qa.phase==='accepted'?'accepted':'pending',requested_at:'2026-10-10T10:00:00.000Z',updated_at:'2026-10-10T10:00:00.000Z'}]:[]);
    if(url.pathname.endsWith('/user_profiles'))return response([owner,person]);
    if(url.pathname.endsWith('/friend_invite_codes'))return response([{code:'0123456789abcdefabcd'}]);
    if(method==='GET')return response([]);
    return response({message:'Unhandled synthetic endpoint'},501);
  };
})();
