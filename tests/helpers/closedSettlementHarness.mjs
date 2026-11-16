import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";
import * as closed from "../../src/ui/closedSettlementPresentation.mjs";
import * as interim from "../../src/ui/eventSettlementOptions.mjs";
import {formatSettlementSummary} from "../../src/domain/settlementSummary.mjs";

const source = await readFile(new URL("../../src/app.mjs",import.meta.url),"utf8");
const escape = value => String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
export function renderClosedFixture({
 appSource=source, transfers=[
  {id:"a",fromParticipantId:"guest-a",toParticipantId:"owner",amount:8000,status:"pending"},
  {id:"b",fromParticipantId:"guest-b",toParticipantId:"owner",amount:3000,status:"pending"}
 ],closedEvent=true,reliable=true,manage=true,empty=false,review=false,currency="ILS",direct=false,
 aliases={},names=["ירין ישראלי","דנה לוי","איתי כהן"]
}={}) {
 const event={id:"event",name:"סוף שבוע בצפון",expenses:empty?[]:[{id:"expense",total:24000}],locked:closedEvent,currency,participantAliases:aliases};
 const participants=["owner","guest-a","guest-b"].map((id,i)=>({id,displayName:names[i]}));
 const total=transfers.filter(t=>t.status!=="paid").reduce((n,t)=>n+t.amount,0),calls=[];
 const before=JSON.stringify({event,transfers,participants}),extract=name=>{
  const start=appSource.indexOf("function "+name+"("),rest=appSource.slice(start),next=/\n(?:async )?function /.exec(rest);
  if(start<0)throw Error("Missing adapter "+name);return next?rest.slice(0,next.index):rest;
 };
 const context={event,transfers,pendingTotal:total,issues:review?["invalid"]:[],state:{currentParticipantId:"owner"},
  hasReliableSettlementIdentity:()=>reliable,isEventClosed:()=>closedEvent,canCurrentParticipantManage:()=>manage,
  sumMoneyAmounts:values=>values.reduce((n,x)=>n+x,0),
  formatEventMoney:(_e,n)=>{calls.push(n);return "₪"+(n/100).toFixed(2)},
  formatCount:(n,one,many)=>n+" "+(n===1?one:many),
  participantName:id=>participants.find(p=>p.id===id)?.displayName,escapeHtml:escape,escapeAttribute:escape,
  renderEventEmptyExpenseState:()=>"<div>empty</div>",eventParticipants:()=>participants,eventSettlementTransfers:()=>transfers,
  usesDirectSettlementTransfers:()=>direct,formatSettlementSummary,...interim,...closed,
  iconSvg:()=>"<svg></svg>"};
 const html=runInNewContext(extract("renderSettlementHero")+"\n"+extract("renderFeaturedSettlementHero")+"\nrenderSettlementHero(event,transfers,pendingTotal,issues)",context);
 const footer=runInNewContext(extract("renderSettlementListActions")+"\nrenderSettlementListActions(event)",context);
 if(JSON.stringify({event,transfers,participants})!==before)throw Error("Rendering mutated financial inputs");
 return {html,footer,calls,event,transfers,participants,total};
}
