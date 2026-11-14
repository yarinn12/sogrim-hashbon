const eventId="close-presentation",owner="close-owner",guest="close-guest",other="close-other";
export {eventId};
export function seed(single=false){
 const ids=single?[owner,guest]:[owner,guest,other];
 return {currentParticipantId:owner,participants:ids.map(id=>({id,displayName:id===owner?"ירין ישראלי":id===guest?"דנה לוי":"איתי כהן",kind:id===owner?"user":"guest"})),friendContacts:[],groups:[],deletedEvents:[],deletedParticipants:[],events:[{id:eventId,name:"סוף שבוע בצפון",currency:"ILS",eventType:"standard",participantIds:ids,adminIds:[owner],createdByParticipantId:owner,createdAt:"2026-10-10T10:00:00.000Z",updatedAt:"2026-10-10T10:00:00.000Z",locked:false,expenses:[{id:"dinner",name:"ארוחת ערב",total:12000,payers:[{participantId:owner,amount:7000},{participantId:guest,amount:5000}],sharedByParticipantIds:ids,createdByParticipantId:owner,occurredOn:"2026-10-20",updatedAt:"2026-10-10T10:00:00.000Z"},{id:"shopping",name:"קניות",total:12000,payers:[{participantId:owner,amount:12000}],sharedByParticipantIds:ids,createdByParticipantId:owner,occurredOn:"2026-10-20",updatedAt:"2026-10-10T10:00:00.000Z"}],transfers:[],activityLog:[]}]};
}
export function closedSummarySeed({payer=false,locked=false,readonly=false,balanced=false}={}) {
 const state=seed(),event=state.events[0];
 event.locked=locked;
 if(payer)for(const expense of event.expenses)expense.payers=[{participantId:guest,amount:expense.total}];
 if(readonly){event.adminIds=[guest];event.createdByParticipantId=guest;event.adminsCanEditOnly=true;}
 if(balanced)event.expenses=[{...event.expenses[0],total:24000,payers:[owner,guest,other].map(participantId=>({participantId,amount:8000}))}];
 return state;
}
