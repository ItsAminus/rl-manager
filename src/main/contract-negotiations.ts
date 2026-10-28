import type {AppDatabase} from './database';
import {addDays,contractOfferScore} from '../game/career-rules';
export function playerRepresentative(db:AppDatabase,c:any,playerId:string){
 const seed=[...playerId].reduce((n,ch)=>(Math.imul(n,31)+ch.charCodeAt(0))>>>0,19),index=seed%8;
 const name=['Northstar','Summit','Apex','Horizon','Vertex','Orbit','Momentum','Frontier'][index]+' Player Representation';
 const agencyId='career_agency_'+index,trust=db.prepare('SELECT trust FROM agency_relationships WHERE careerId=? AND agencyId=?').get(c.id,agencyId)?.trust??50;
 return {agencyId,name,trust,style:index%3===0?'Firm':index%3===1?'Patient':'Pragmatic',fictional:true};
}
export function changeAgencyTrust(db:AppDatabase,c:any,playerId:string,change:number){
 const agency=playerRepresentative(db,c,playerId);
 db.prepare('INSERT OR REPLACE INTO agency_relationships VALUES(?,?,?)').run(c.id,agency.agencyId,Math.max(0,Math.min(100,agency.trust+change)));
}
export function negotiationState(db:AppDatabase,c:any,playerId:string){
 const row=db.prepare('SELECT * FROM negotiation_sessions WHERE careerId=? AND playerId=?').get(c.id,playerId);
 if(row?.blockedUntil&&row.blockedUntil<=c.currentDate)return {patience:100,rounds:0,blockedUntil:null};
 return row||{patience:100,rounds:0,blockedUntil:null};
}
export function negotiateTerms(db:AppDatabase,c:any,playerId:string,offer:any,quote:any){
 const state=negotiationState(db,c,playerId);
 if(state.blockedUntil)throw Error(`The representative will not reopen talks before ${state.blockedUntil}.`);
 if(quote.unavailableReason)throw Error(quote.unavailableReason);
 if(!offer||!Number.isSafeInteger(offer.salary)||offer.salary<=0||!Number.isSafeInteger(offer.bonus)||offer.bonus<0||offer.salary>100000000||offer.bonus>100000000)throw Error('Enter valid financial terms.');
 const score=contractOfferScore(offer,quote.demands),accepted=score>=.95;
 // Stored on the backend so reloading a page never restores negotiating patience.
 const agency=playerRepresentative(db,c,playerId),base=score>=.82?12:score>=.65?28:45;
 const penalty=accepted?0:Math.round(base*(agency.style==='Firm'?1.1:agency.style==='Patient'?.9:1)*(agency.trust<35?1.15:agency.trust>70?.9:1));
 const patience=Math.max(0,state.patience-penalty),blockedUntil=patience===0?addDays(c.currentDate,14):null;
 db.prepare('INSERT OR REPLACE INTO negotiation_sessions VALUES(?,?,?,?,?,?)').run(c.id,playerId,patience,state.rounds+1,blockedUntil,JSON.stringify(offer));
 if(blockedUntil)changeAgencyTrust(db,c,playerId,-8);
 return {success:true,accepted,patience,rounds:state.rounds+1,blockedUntil,message:accepted?'Financial terms are acceptable, subject to the sporting project, role, duration and board checks.':blockedUntil?`Talks have broken down. We will reconsider on ${blockedUntil}.`:score>=.82?'We are close. Improve the salary or signing bonus.':'These terms do not value the player sufficiently. Continued low offers risk a breakdown.'};
}
