import {readFileSync} from 'node:fs';

// Reuse the shared synthetic HTTP/ACK model; only seed the home-specific scenes.
const base=readFileSync(new URL('./eventNotesBatchBootstrap.js',import.meta.url),'utf8');
const marker="  const row={id:space,state,updated_at:'2026-10-10T10:00:00.000Z'};";
if(!base.includes(marker))throw Error('The shared fixture no longer exposes its pre-storage seed boundary');
export const homeArchiveBootstrap=base.replace(marker,`
  const homeScene=params.get('preview');
  if(homeScene==='home-empty'){state.events=[];canonicalRow.state.events=[];qa.seedFinancialEvents=[];}
  if(params.has('menu-member'))for(const e of [state.events[0],canonicalRow.state.events[0]])Object.assign(e,{createdByParticipantId:friendId,adminIds:[friendId],adminsCanEditOnly:true});
  localStorage.removeItem('settle-friends-personal-event-archive-v1:'+participantId);
  if(homeScene==='archive-menu')localStorage.setItem('settle-friends-personal-event-archive-v1:'+participantId,JSON.stringify(['friend-weekend']));
`+marker);
