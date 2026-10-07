(() => {
  const auth = 'https://native-auth-roundtrip.supabase.co';
  const user = {id:'native-roundtrip-user',email:'native-roundtrip@example.test',app_metadata:{provider:'apple'},user_metadata:{full_name:'בדיקת התחברות',username:'native_roundtrip',account_space_id:'native-roundtrip-space',account_space_key:'abcdefghijklmnopqrstuvwxyz_123456'}};
  const participantId = 'account-'+user.id;
  const state = {currentParticipantId:participantId,participants:[{id:participantId,displayName:'בדיקת התחברות',kind:'user',accountLinked:true}],friendContacts:[],groups:[],deletedEvents:[],deletedParticipants:[],events:[{id:'native-roundtrip-event',name:'אירוע החשבון המחובר',currency:'ILS',participantIds:[participantId],adminIds:[participantId],createdByParticipantId:participantId,createdAt:'2026-10-01T08:00:00.000Z',updatedAt:'2026-10-01T08:00:00.000Z',expenses:[],transfers:[],activityLog:[]}]};
  const config = {publicUrl:'https://sogrim-hesbon-app.vercel.app',auth:{googleClientId:'fixture-web.apps.googleusercontent.com',googleIosClientId:'fixture-ios.apps.googleusercontent.com'},launch:{googleAuthReady:true,googleIosAuthReady:true,authEmailDeliveryReady:true},storage:{mode:'supabase',url:auth,anonKey:'fixture-public-key',table:'app_snapshots'}};
  if(!localStorage.getItem('probe-fixture-initialized')){localStorage.clear();sessionStorage.clear();localStorage.setItem('probe-fixture-initialized','1');}
  sessionStorage.setItem('settle-friends-skip-next-splash','1');
  // The packaged HTML also assigns its production bootstrap later. Keep this
  // isolated external-service fixture authoritative on every WebView reload.
  Object.defineProperty(globalThis,'SogrimNativeRuntimeConfig',{configurable:false,get:()=>Object.freeze(config),set:()=>{}});
  const originalFetch=globalThis.fetch.bind(globalThis);
  const json=(data,status=200)=>Promise.resolve(new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}}));
  const increment=key=>localStorage.setItem(key,String(Number(localStorage.getItem(key)||0)+1));
  globalThis.fetch=async(input,options={})=>{
    const value=typeof input==='string'?input:input?.url??String(input);
    const url=new URL(value,location.href);
    const body=options.body?JSON.parse(options.body):null;
    if(url.pathname==='/api/config')return json(config);
    if(url.pathname==='/api/product-metrics')return json({ok:true,accepted:Array.isArray(body?.events)?body.events.length:0});
    if(url.origin!==auth){
      if(url.hostname.endsWith('.supabase.co'))throw new Error('Probe refusing an unexpected Supabase origin');
      return originalFetch(input,options);
    }
    if(url.pathname.endsWith('/auth/v1/settings'))return json({external:{google:true,apple:true,email:true}});
    if(url.pathname.endsWith('/auth/v1/token')){
      const flow=Object.keys(localStorage).filter(k=>k.startsWith('settle-friends-account-oauth-flow:')).map(k=>{try{return JSON.parse(localStorage.getItem(k));}catch{return null;}}).find(f=>f?.verifier===body?.code_verifier);
      if(url.searchParams.get('grant_type')!=='pkce'||body?.auth_code!=='fixture-system-session-code'||!flow)return json({message:'Unbound synthetic code'},400);
      increment('probe-pkce');
      localStorage.setItem('probe-pkce-bound','1');
      return json({access_token:'fixture-native-access',refresh_token:'fixture-native-refresh',expires_in:3600,user});
    }
    if(url.pathname.endsWith('/auth/v1/user'))return json(user);
    if(url.pathname.endsWith('/rpc/ensure_account_workspace'))return json({status:'existing',workspaceId:user.user_metadata.account_space_id});
    if(url.pathname.endsWith('/app_snapshots')){
      if((options.method??'GET')!=='GET'){
        increment('probe-writes');
        const row=Array.isArray(body)?body[0]:body;
        localStorage.setItem('probe-write-valid',row?.state?.currentParticipantId===participantId&&row.state.events.some(event=>event.id==='native-roundtrip-event')?'1':'0');
      }
      return json([{state,updated_at:'2026-10-01T08:00:01.000Z'}]);
    }
    return json([]);
  };
  globalThis.__nativeAuthProbeState=()=>{
    const signedIn=JSON.parse(localStorage.getItem('settle-friends-account-session')??'null')?.user?.id===user.id;
    return {signedIn,gate:!!document.getElementById('public-account-auth-gate'),eventVisible:document.body.textContent.includes('אירוע החשבון המחובר'),pkce:Number(localStorage.getItem('probe-pkce')||0),bound:localStorage.getItem('probe-pkce-bound')==='1',writes:Number(localStorage.getItem('probe-writes')||0),writeValid:localStorage.getItem('probe-write-valid')==='1'};
  };
})();
