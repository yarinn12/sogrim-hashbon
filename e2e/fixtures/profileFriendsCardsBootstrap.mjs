import {homeArchiveBootstrap} from './homeArchiveBootstrap.mjs';

const marker="  const row={id:space,state,updated_at:'2026-10-10T10:00:00.000Z'};";
const profileResponse="if(url.pathname.endsWith('/user_profiles')){if(method==='PATCH')qa.profileWrites.push(body);return response([owner,person,itay,...extraPeople])}";
if(!homeArchiveBootstrap.includes(marker)||!homeArchiveBootstrap.includes(profileResponse))throw Error('Shared synthetic profile/home fixture boundaries changed');
export const profileFriendsCardsBootstrap=homeArchiveBootstrap.replace(marker,`
  if(params.get('preview')==='friends-empty'){
    for(const [i,p] of [itay,...extraPeople].entries()){
      const id='account-'+p.user_id;
      if(!state.participants.some(x=>x.id===id))state.participants.push({id,displayName:p.display_name,username:p.username,kind:'member',accountLinked:true,authSubject:p.user_id,avatarPreset:p.avatar_preset});
      if(!state.friendContacts.some(x=>x.participantId===id))state.friendContacts.push({id:'review-contact-'+i,participantId:id,active:true,source:'friendship'});
      if(!requestRows.some(x=>x.requester_id===p.user_id||x.addressee_id===p.user_id))requestRows.push({id:'99999999-9999-4999-8999-99999999999'+i,requester_id:actor,addressee_id:p.user_id,status:'accepted',requested_at:owner.updated_at,updated_at:owner.updated_at});
    }
  }
  if(params.get('preview')==='long-cards'){
    state.events[0].name=params.has('unbroken')?'סוף השבוע בצפון ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789':'סוף שבוע עם המשפחה והחברים בצפון – חופשת סוכות';
    state.events[1].name='יום ההולדת של נועה עם החברים מהעבודה';
    canonicalRow.state.events[0].name=state.events[0].name;
    qa.seedFinancialEvents=structuredClone(state.events);
  }
  if(params.get('preview')==='short-cards'){
    for(const [i,e] of state.events.entries()){
      e.name=['קוריאה','פיליפינים','לובי מאיה'][i];
      e.participantIds=state.participants.slice(0,i===0?4:5).map(p=>p.id);
    }
    canonicalRow.state.participants=structuredClone(state.participants);
    canonicalRow.state.events[0]=structuredClone(state.events[0]);
    qa.seedFinancialEvents=structuredClone(state.events);
  }
`+marker).replace(profileResponse,"if(url.pathname.endsWith('/user_profiles')){if(method==='PATCH'){qa.profileWrites.push(body);Object.assign(owner,body)}return response([owner,person,itay,...extraPeople])}");
