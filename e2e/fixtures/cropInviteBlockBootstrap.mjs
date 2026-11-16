import {profileFriendsCardsBootstrap} from './profileFriendsCardsBootstrap.mjs';

const seed='qa.blockedRows=[];';
const unblock="if(rpc==='unblock_user'){qa.safetyRequests.push({rpc,body:structuredClone(body)});qa.blockedRows=[];return response({status:'unblocked'})}";
if(!profileFriendsCardsBootstrap.includes(seed)||!profileFriendsCardsBootstrap.includes(unblock))throw Error('Synthetic safety transport boundary changed');
export const cropInviteBlockBootstrap=profileFriendsCardsBootstrap.replace(seed,`qa.blockedRows=[
 {blocked_user_id:target,blocked_display_name:'דנה לוי',blocked_username:'dana_levi'},
 {blocked_user_id:'44444444-4444-4444-8444-444444444444',blocked_display_name:'אלכסנדרה ישראלי כהן',blocked_username:'alexandra_israeli_cohen'}];
 qa.unblockMode=params.get('unblock-mode')||'ready';qa.unblockReleased=false;`)
.replace(unblock,`if(rpc==='unblock_user'){
 qa.safetyRequests.push({rpc,body:structuredClone(body)});
 if(qa.unblockMode==='hold'&&!qa.unblockReleased)await new Promise(resolve=>qa.releaseUnblock=()=>{qa.unblockReleased=true;resolve()});
 if(qa.unblockMode==='error')return response({message:'Synthetic connection failure'},503);
 qa.blockedRows=qa.blockedRows.filter(row=>row.blocked_user_id!==body.p_target_user_id);return response({status:'unblocked'});
}`)+`
(()=>{
 const params=new URLSearchParams(location.search);if(!params.has('crop-invite-block-qa'))return;
 const qa=globalThis.__friendInviteQa,original=globalThis.fetch;qa.invitePhase=params.get('invite-mode')||'unavailable';qa.inviteWrites=[];
 globalThis.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  if(url.pathname.endsWith('/rpc/resolve_friend_invitation')){
   qa.reads.push(options.body?JSON.parse(options.body):{});
   if(qa.invitePhase==='loading')await new Promise(resolve=>qa.releaseInvite=()=>{qa.invitePhase='unavailable';resolve()});
   return new Response(JSON.stringify(qa.invitePhase==='error'?{message:'Synthetic connection failure'}:{status:'unavailable'}),{status:qa.invitePhase==='error'?503:200,headers:{'content-type':'application/json'}});
  }
  if(url.pathname.endsWith('/rpc/request_friendship')||url.pathname.endsWith('/rpc/manage_friendship'))qa.inviteWrites.push({url:url.pathname,body:options.body});
  return original(input,options);
 };
})();`;
