import type {AppDatabase} from './database';
import {v4 as uuid} from 'uuid';
import {addDays} from '../game/career-rules';
import {recruitmentInterest} from './recruitment-interest';
import {clubMessage,ClubEconomy} from './club-economy';

export class RecruitmentNetwork{
  constructor(private db:AppDatabase){}
  depth(careerId:string,playerId:string){
    const depth=this.db.prepare("SELECT COALESCE(MAX(depth),0) n FROM scout_assignments WHERE careerId=? AND playerId=? AND status='completed'").get(careerId,playerId).n;
    const observed=this.db.prepare('SELECT observedDate FROM scout_observations WHERE careerId=? AND playerId=?').get(careerId,playerId),date=this.db.prepare('SELECT currentDate FROM careers WHERE id=?').get(careerId)?.currentDate;
    return observed&&date&&observed.observedDate<addDays(date,-120)?Math.min(2,depth):depth;
  }
  observe(c:any,playerId:string,depth:number,date=c.currentDate){
    const p=this.db.prepare('SELECT * FROM players WHERE id=?').get(playerId);if(!p)return;
    const attributes=this.db.prepare('SELECT * FROM player_attributes WHERE playerId=?').get(playerId)||{};
    if(attributes.mechanical!=null)attributes.mechanics=attributes.mechanical;
    const traits=this.db.prepare('SELECT * FROM player_traits WHERE playerId=?').get(playerId)||{};
    this.db.prepare('INSERT OR REPLACE INTO scout_observations VALUES(?,?,?,?,?,?,?,?,?,?)').run(c.id,p.id,date,depth,p.overall,p.potential,JSON.stringify(attributes),JSON.stringify(traits),p.form??50,p.preferredTendency||'Not observed');
  }
  visible(c:any,p:any){
    if(!p||p.teamId===c.teamId||c.mode==='Path To Glory')return p;
    const depth=this.depth(c.id,p.id);
    let observed=this.db.prepare('SELECT * FROM scout_observations WHERE careerId=? AND playerId=?').get(c.id,p.id);
    // Preserve completed legacy reports without treating pending observation as knowledge.
    if(depth&&(!observed||observed.depth<depth)){this.observe(c,p.id,depth);observed=this.db.prepare('SELECT * FROM scout_observations WHERE careerId=? AND playerId=?').get(c.id,p.id);}
    const range=(value:number,width:number)=>`${Math.max(1,Math.floor(value/width)*width)}–${Math.min(100,Math.floor(value/width)*width+width-1)}`;
    return {...p,scoutKnowledge:['Unknown','Basic','Good','Full'][Math.min(3,depth)],overall:depth>=3?observed.overall:null,potential:null,
      lastScouted:observed?.observedDate,estimatedOverall:depth>=3?String(observed.overall):depth?range(observed.overall,depth===2?5:15):'Unscouted',estimatedPotential:depth?range(observed.potential,depth>=2?5:15):'Unknown',
      attributes:depth>=3?JSON.parse(observed.attributes):null,traits:depth>=3?JSON.parse(observed.traits):null,form:depth>=2?observed.form:null,morale:null,fatigue:null,consistency:depth>=3?JSON.parse(observed.attributes).consistency:null,chemistry:null,
      ratingSources:null,ratingMethod:null,ratingConfidence:null,ratingReviewedAt:null,salary:depth>=2?p.salary:null,buyout:depth>=2?p.buyout:null,
      preferredTendency:depth>=1?observed.tendency:'Not observed',reputation:null};
  }
  approach(c:any,playerId:string,role='Core Starter'){
    new ClubEconomy(this.db).assertEmployed(c.id);
    if(!['Star Carry','Core Starter','Substitute'].includes(role))throw Error('Choose a valid proposed playing role.');
    const p=this.db.prepare('SELECT * FROM players WHERE id=?').get(playerId);if(!p)throw Error('Player not found.');
    const old=this.db.prepare('SELECT * FROM agent_approaches WHERE careerId=? AND playerId=?').get(c.id,p.id);
    if(old&&old.expiresDate>=c.currentDate&&old.role===role)return {...old,willing:!!old.willing,reasons:JSON.parse(old.reasons)};
    const funds=this.db.prepare('SELECT cashBalance FROM teams WHERE id=?').get(c.teamId).cashBalance;
    const contract=this.db.prepare('SELECT buyout FROM contracts WHERE playerId=? AND isActive=1').get(p.id);
    const minimum=p.teamId&&p.teamId!==c.teamId?Math.max(p.marketValue||0,contract?.buyout||0):0;
    const interest=recruitmentInterest(this.db,c.id,c.teamId,p,c.currentDate,role);
    const reasons=[...interest.reasons];if(funds<minimum)reasons.unshift(`Your club must hold at least $${minimum.toLocaleString()} to approach this transfer. Available cash: $${funds.toLocaleString()}.`);
    const result={role,date:c.currentDate,expiresDate:addDays(c.currentDate,reasons.length?14:30),willing:reasons.length===0,reasons};
    this.db.prepare('INSERT OR REPLACE INTO agent_approaches VALUES(?,?,?,?,?,?,?)').run(c.id,p.id,role,result.date,result.expiresDate,result.willing?1:0,JSON.stringify(reasons));
    clubMessage(this.db,c,`Agent response: ${p.gamertag}`,reasons.length?reasons.join(' '):`${p.gamertag} would consider your club as a ${role.toLowerCase()}. You may now discuss terms. Permission expires ${result.expiresDate}; sporting circumstances will be checked again before signing.`,`/negotiate/${p.id}`);
    return result;
  }
  regions(c:any){return {assignments:this.db.prepare('SELECT * FROM scouting_regions WHERE careerId=? ORDER BY startedDate DESC').all(c.id),regions:this.db.prepare('SELECT DISTINCT region FROM players ORDER BY region').all().map(r=>r.region),capacity:3};}
  dispatchRegion(c:any,region:string,months:number){
    if(![1,2,3].includes(months)||!this.regions(c).regions.includes(region))throw Error('Choose a region and a one-to-three month assignment.');
    const active=this.db.prepare("SELECT COUNT(*) n FROM scouting_regions WHERE careerId=? AND status='active'").get(c.id).n+this.db.prepare("SELECT COUNT(*) n FROM scout_assignments WHERE careerId=? AND status='pending'").get(c.id).n;
    if(active>=3)throw Error('All three scout slots are occupied.');
    if(this.db.prepare("SELECT id FROM scouting_regions WHERE careerId=? AND region=? AND status='active'").get(c.id,region))throw Error('A scout is already covering this region.');
    const cost=8000*months,t=this.db.prepare('SELECT cashBalance FROM teams WHERE id=?').get(c.teamId);
    if(t.cashBalance<cost)throw Error(`This assignment requires $${cost.toLocaleString()} upfront.`);
    this.db.prepare('UPDATE teams SET cashBalance=cashBalance-? WHERE id=?').run(cost,c.teamId);
    const id=uuid(),endDate=addDays(c.currentDate,months*30);
    this.db.prepare('INSERT INTO scouting_regions VALUES(?,?,?,?,?,?,?,?)').run(id,c.id,region,c.currentDate,endDate,addDays(c.currentDate,30),'active',cost);
    return {success:true,dueDate:addDays(c.currentDate,30),endDate};
  }
  tick(c:any){
    for(const a of this.db.prepare("SELECT * FROM scouting_regions WHERE careerId=? AND status='active' AND nextReport<=?").all(c.id,c.currentDate)){
      const candidates=this.db.prepare('SELECT p.id,p.gamertag FROM players p WHERE p.region=? AND (p.teamId IS NULL OR p.teamId<>?) AND NOT EXISTS(SELECT 1 FROM scout_assignments s WHERE s.careerId=? AND s.playerId=p.id AND s.status=\'pending\') ORDER BY p.id').all(a.region,c.teamId,c.id);
      const ordered=candidates.map(p=>({...p,depth:this.depth(c.id,p.id)})).filter(p=>p.depth<3).sort((x,y)=>x.depth-y.depth||this.hash(a.id+a.nextReport+x.id)-this.hash(a.id+a.nextReport+y.id)).slice(0,3);
      for(const p of ordered){this.db.prepare("INSERT INTO scout_assignments VALUES(?,?,?,?,?,?,'completed')").run(uuid(),c.id,p.id,a.startedDate,a.nextReport,p.depth+1);this.observe(c,p.id,p.depth+1,a.nextReport);}
      clubMessage(this.db,c,`${a.region}: scouting update`,ordered.length?`Your scout has filed reports on ${ordered.map(p=>p.gamertag).join(', ')}. Ratings remain estimates until sustained individual observation.`:'No further unknown players were found in this assignment.','/scouting');
      this.db.prepare('UPDATE scouting_regions SET nextReport=?,status=? WHERE id=?').run(addDays(a.nextReport,30),a.nextReport>=a.endDate?'completed':'active',a.id);
    }
  }
  private hash(s:string){let n=0;for(const c of s)n=Math.imul(n,31)+c.charCodeAt(0)|0;return n>>>0;}
}
