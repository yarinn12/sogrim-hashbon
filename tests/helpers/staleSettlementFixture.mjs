// Synthetic four-person direct-settlement example: one replica predates the
// newest expense and carries obsolete pending transfer IDs after an account link.
export function staleSettlementFixture(ids) {
  const {owner, peer, third, fourth} = ids;
  const expense = (id, total, payer, shared) => ({id, name:id, total,
    payers:[{participantId:payer,amount:total}], sharedByParticipantIds:shared,
    createdByParticipantId:owner});
  const transfer = (id, from, to, amount) => ({id,fromParticipantId:from,toParticipantId:to,amount,status:'pending'});
  const expenses = [
    expense('room',403600,owner,[owner,fourth,peer,third]),
    expense('flight-shared',128500,peer,[owner,fourth,peer]),
    expense('flight-owner',233600,peer,[owner]),
    expense('new-day-trip',63500,owner,[owner,fourth,peer,third])
  ];
  const canonical = {currentParticipantId:'',groups:[],participants:[owner,third,peer,fourth].map(id=>({id,displayName:id,kind:'user',accountLinked:true})),
    events:[{id:'stable-settlement',name:'Synthetic trip',currency:'ILS',participantIds:[owner,third,peer,fourth],
      adminIds:[owner],createdByParticipantId:owner,roundSettlementTransfers:true,directSettlementTransfers:true,
      expenses,notes:[],deletedNotes:[],transferStatusUpdates:[],transfers:[
        transfer('current-owner-peer',owner,peer,159600),
        transfer('current-third-owner',third,owner,116800),
        transfer('current-fourth-owner',fourth,owner,116700),
        transfer('current-fourth-peer',fourth,peer,42900)
      ]}]};
  const stale=structuredClone(canonical);
  stale.currentParticipantId=fourth;
  stale.participants=[owner,fourth,peer,third].map(id=>canonical.participants.find(p=>p.id===id));
  stale.events[0].participantIds=[owner,fourth,peer,third];
  stale.events[0].expenses=stale.events[0].expenses.slice(0,3);
  stale.events[0].transfers=[
    transfer('old-owner-peer',owner,peer,175600),
    transfer('opaque-linked-guest-owner',fourth,owner,100900),
    transfer('old-third-owner',third,owner,100900),
    transfer('old-fourth-peer',fourth,peer,42800)
  ];
  return {canonical,stale};
}
