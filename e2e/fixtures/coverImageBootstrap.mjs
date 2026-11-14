import {profileFriendsCardsBootstrap} from './profileFriendsCardsBootstrap.mjs';

// Synthetic transport only. The actual application owns image processing,
// authorization, rollback, acknowledgement and all rendered feedback.
export const coverImageBootstrap=profileFriendsCardsBootstrap+`
(()=>{
 const qa=globalThis.__friendInviteQa,original=globalThis.fetch;
 qa.coverFailureMode=new URLSearchParams(location.search).get('image-mode')||'ready';
 qa.coverDeniedAttempts=[];qa.coverHeldAttempts=[];
 globalThis.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  let body;try{body=JSON.parse(options.body||'null')}catch{}
  const snapshot=body?.p_state||(Array.isArray(body)?body[0]?.state:body?.state);
  const changed=snapshot?.events?.some(e=>e.id==='friend-weekend'&&e.coverImage?.startsWith('data:image/'));
  if(changed&&qa.coverFailureMode==='hold'){
   qa.coverHeldAttempts.push({path:url.pathname,body:structuredClone(body)});
   await new Promise(resolve=>(qa.coverReleases??=[]).push(resolve));
  }
  if(changed&&qa.coverFailureMode==='permission'){
   qa.coverDeniedAttempts.push({path:url.pathname,body:structuredClone(body)});
   return new Response(JSON.stringify({code:'SHARED_EVENT_MEMBERSHIP_REVOKED',message:'Synthetic cover save permission rejected'}),{status:403,headers:{'content-type':'application/json'}});
  }
  return original(input,options);
 };
})();`;
