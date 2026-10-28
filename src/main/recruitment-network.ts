import type {AppDatabase} from './database';
import {agreedTransfer,paymentPlan} from './transfer-agreements';
import {v4 as uuid} from 'uuid';
import {addDays} from '../game/career-rules';
import {recruitmentInterest} from './recruitment-interest';
import {clubMessage,ClubEconomy} from './club-economy';
import {scoutBrief,knownProspect,potentialAssessment} from './talent-pool';
import {staffDepartment} from './club-structure';

export class RecruitmentNetwork{
  constructor(private db:AppDatabase){}
  occupied(careerId:string){
    return this.db.prepare("SELECT COUNT(*) n FROM scout_assignments WHERE careerId=? AND status='pending'").get(careerId).n
      +this.db.prepare("SELECT COUNT(*) n FROM scouting_regions WHERE careerId=? AND status='active'").get(careerId).n
      +this.db.prepare("SELECT COUNT(*) n FROM scouting_teams WHERE careerId=? AND status='pending'").get(careerId).n;
  }
  cancel(c:any,kind:string,id:string){
    const table=kind==='player'?'scout_assignments':kind==='region'?'scouting_regions':kind==='team'?'scouting_teams':null;
    if(!table)throw Error('Unknown assignment type.');
    const a=this.db.prepare(`SELECT * FROM ${table} WHERE id=? AND careerId=?`).get(id,c.id);
    if(!a||!['pending','active'].includes(a.status))throw Error('This assignment is no longer active.');
    this.db.prepare(`UPDATE ${table} SET status='cancelled' WHERE id=? AND careerId=?`).run(id,c.id);
    return {success:true};
  }
  teamReport(c:any,teamId:string){
    const team=this.db.prepare('SELECT id,name,region FROM teams WHERE id=?').get(teamId);
    if(!team)throw Error('Team not found.');
    const players=this.db.prepare('SELECT id,gamertag,teamId,age,region,overall,potential,preferredTendency FROM players WHERE teamId=? ORDER BY gamertag').all(teamId)
      .map(p=>this.visible(c,p));
    return {team,players,known:players.filter(p=>p.lastScouted).length,
      assignments:this.db.prepare('SELECT * FROM scouting_teams WHERE careerId=? AND teamId=? ORDER BY startedDate DESC,rowid DESC').all(c.id,teamId)};
  }
  dispatchTeam(c:any,teamId:string){
    if(teamId===c.teamId)throw Error('Your own squad is already known.');
    if(this.occupied(c.id)>=3)throw Error('All three scout slots are occupied.');
    const report=this.teamReport(c,teamId);
    if(!report.players.length)throw Error('This club has no confirmed squad to observe.');
    if(report.assignments.some(a=>a.status==='pending'))throw Error('A scout is already observing this team.');
    if(this.db.prepare('SELECT cashBalance FROM teams WHERE id=?').get(c.teamId).cashBalance<7500)throw Error('Team scouting requires $7,500 upfront.');
    this.db.prepare('UPDATE teams SET cashBalance=cashBalance-7500 WHERE id=?').run(c.teamId);
    const dueDate=addDays(c.currentDate,7);
    this.db.prepare("INSERT INTO scouting_teams VALUES(?,?,?,?,?,'pending',?)").run(uuid(),c.id,teamId,c.currentDate,dueDate,JSON.stringify(report.players.map(p=>p.id)));
    return {success:true,dueDate};
  }
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
    if(p&&!knownProspect(this.db,c,p.id))return null;
    if(!p||p.teamId===c.teamId||c.mode==='Path To Glory')return p;
    const depth=this.depth(c.id,p.id);
    let observed=this.db.prepare('SELECT * FROM scout_observations WHERE careerId=? AND playerId=?').get(c.id,p.id);
    // Preserve completed legacy reports without treating pending observation as knowledge.
    if(depth&&(!observed||observed.depth<depth)){this.observe(c,p.id,depth);observed=this.db.prepare('SELECT * FROM scout_observations WHERE careerId=? AND playerId=?').get(c.id,p.id);}
    const range=(value:number,width:number)=>`${Math.max(1,Math.floor(value/width)*width)}–${Math.min(100,Math.floor(value/width)*width+width-1)}`;
    const coverage=this.db.prepare("SELECT COUNT(*) n FROM scouting_regions WHERE careerId=? AND region=? AND status='completed'").get(c.id,p.region||null)?.n||0;
    return {...p,scoutKnowledge:['Unknown','Basic','Good','Full'][Math.min(3,depth)],overall:depth>=3?observed.overall:null,potential:null,
      lastScouted:observed?.observedDate,estimatedOverall:depth>=3?String(observed.overall):depth?range(observed.overall,depth===2?5:15):'Unscouted',estimatedPotential:depth?potentialAssessment(c.id,{...p,overall:observed.overall,potential:observed.potential},depth,coverage*4+staffDepartment(this.db,c,'Recruitment').level*8):'Unknown',
      attributes:depth>=3?JSON.parse(observed.attributes):null,traits:depth>=3?JSON.parse(observed.traits):null,form:depth>=2?observed.form:null,morale:null,fatigue:null,consistency:depth>=3?JSON.parse(observed.attributes).consistency:null,chemistry:null,
      ratingSources:null,ratingMethod:null,ratingConfidence:null,ratingReviewedAt:null,salary:depth>=2?p.salary:null,buyout:depth>=2?p.buyout:null,
      preferredTendency:depth>=1?observed.tendency:'Not observed',reputation:null};
  }
  approach(c:any,playerId:string,role='Core Starter'){
    if(!knownProspect(this.db,c,playerId))throw Error('Your scouts have not discovered this player.');
    new ClubEconomy(this.db).assertEmployed(c.id);
    if(!['Star Carry','Core Starter','Substitute'].includes(role))throw Error('Choose a valid proposed playing role.');
    const p=this.db.prepare('SELECT * FROM players WHERE id=?').get(playerId);if(!p)throw Error('Player not found.');
    const old=this.db.prepare('SELECT * FROM agent_approaches WHERE careerId=? AND playerId=?').get(c.id,p.id);
    if(old&&old.expiresDate>=c.currentDate&&old.role===role)return {...old,willing:!!old.willing,reasons:JSON.parse(old.reasons)};
    const funds=this.db.prepare('SELECT cashBalance FROM teams WHERE id=?').get(c.teamId).cashBalance;
    const contract=this.db.prepare('SELECT buyout FROM contracts WHERE playerId=? AND isActive=1').get(p.id);
    const clubAgreement=agreedTransfer(this.db,c,p.id);
    const minimum=clubAgreement?paymentPlan(clubAgreement.terms.fee,clubAgreement.terms.upfrontPercent,clubAgreement.terms.months,c.currentDate).upfront:p.teamId&&p.teamId!==c.teamId?Math.max(p.marketValue||0,contract?.buyout||0):0;
    const interest=recruitmentInterest(this.db,c.id,c.teamId,p,c.currentDate,role);
    const reasons=[...interest.reasons];if(funds<minimum)reasons.unshift(`Your club must hold at least $${minimum.toLocaleString()} to approach this transfer. Available cash: $${funds.toLocaleString()}.`);
    const result={role,date:c.currentDate,expiresDate:addDays(c.currentDate,reasons.length?14:30),willing:reasons.length===0,reasons};
    this.db.prepare('INSERT OR REPLACE INTO agent_approaches VALUES(?,?,?,?,?,?,?)').run(c.id,p.id,role,result.date,result.expiresDate,result.willing?1:0,JSON.stringify(reasons));
    clubMessage(this.db,c,`Agent response: ${p.gamertag}`,reasons.length?reasons.join(' '):`${p.gamertag} would consider your club as a ${role.toLowerCase()}. You may now discuss terms. Permission expires ${result.expiresDate}; sporting circumstances will be checked again before signing.`,`/negotiate/${p.id}`);
    return result;
  }
  regions(c:any){return {assignments:this.db.prepare('SELECT * FROM scouting_regions WHERE careerId=? ORDER BY startedDate DESC').all(c.id).map(a=>{const players=this.db.prepare('SELECT playerId FROM scouting_region_discoveries WHERE assignmentId=?').all(a.id);const depths=players.map(p=>this.depth(c.id,p.playerId));return {...a,playersObserved:players.length,fullReports:depths.filter(d=>d>=3).length,goodReports:depths.filter(d=>d===2).length};}),teamAssignments:this.db.prepare('SELECT s.*,t.name teamName FROM scouting_teams s JOIN teams t ON t.id=s.teamId WHERE s.careerId=? ORDER BY s.startedDate DESC,s.rowid DESC').all(c.id),regions:this.db.prepare('SELECT DISTINCT region FROM players ORDER BY region').all().map(r=>r.region),capacity:3,occupied:this.occupied(c.id)};}
  dispatchRegion(c:any,region:string,months:number,criteria:any={}){
    const brief=scoutBrief(criteria);
    if(![1,2,3].includes(months)||!this.regions(c).regions.includes(region))throw Error('Choose a region and a one-to-three month assignment.');
    const active=this.occupied(c.id);
    if(active>=3)throw Error('All three scout slots are occupied.');
    if(this.db.prepare("SELECT id FROM scouting_regions WHERE careerId=? AND region=? AND status='active'").get(c.id,region))throw Error('A scout is already covering this region.');
    const cost=8000*months,t=this.db.prepare('SELECT cashBalance FROM teams WHERE id=?').get(c.teamId);
    if(t.cashBalance<cost)throw Error(`This assignment requires $${cost.toLocaleString()} upfront.`);
    this.db.prepare('UPDATE teams SET cashBalance=cashBalance-? WHERE id=?').run(cost,c.teamId);
    const id=uuid(),endDate=addDays(c.currentDate,months*30);
    this.db.prepare('INSERT INTO scouting_regions VALUES(?,?,?,?,?,?,?,?)').run(id,c.id,region,c.currentDate,endDate,addDays(c.currentDate,30),'active',cost);
    this.db.prepare('INSERT INTO scouting_briefs VALUES(?,?)').run(id,JSON.stringify(brief));
    return {success:true,dueDate:addDays(c.currentDate,30),endDate};
  }
  tick(c:any){
    for(const a of this.db.prepare("SELECT * FROM scouting_teams WHERE careerId=? AND status='pending' AND dueDate<=?").all(c.id,c.currentDate)){
      for(const playerId of JSON.parse(a.playerIds)){
        if(this.db.prepare('SELECT teamId FROM players WHERE id=?').get(playerId)?.teamId!==a.teamId)continue;
        const depth=Math.min(3,this.depth(c.id,playerId)+1);
        this.db.prepare("INSERT INTO scout_assignments VALUES(?,?,?,?,?,?,'completed')").run(uuid(),c.id,playerId,a.startedDate,a.dueDate,depth);
        this.observe(c,playerId,depth,a.dueDate);
      }
      this.db.prepare("UPDATE scouting_teams SET status='completed' WHERE id=?").run(a.id);
      const name=this.db.prepare('SELECT name FROM teams WHERE id=?').get(a.teamId)?.name||'Opponent';
      clubMessage(this.db,c,`Team report: ${name}`,'Your scout has observed the squad. Open the club page for dated player observations. New signings need separate observation.',`/team/${a.teamId}`);
    }
    for(const a of this.db.prepare("SELECT * FROM scouting_regions WHERE careerId=? AND status='active' AND nextReport<=?").all(c.id,c.currentDate)){
      const month=Math.max(1,Math.min(3,Math.round((Date.parse(a.nextReport)-Date.parse(a.startedDate))/86400000/30)));
      const previous=this.db.prepare('SELECT p.id,p.gamertag FROM scouting_region_discoveries d JOIN players p ON p.id=d.playerId WHERE d.assignmentId=? AND p.region=? AND (p.teamId IS NULL OR p.teamId<>?)').all(a.id,a.region,c.teamId);
      const previousIds=new Set(previous.map(p=>p.id));
      const followups=previous.map(p=>({...p,depth:this.depth(c.id,p.id)})).filter(p=>p.depth<3);
      const brief=scoutBrief(JSON.parse(this.db.prepare('SELECT criteria FROM scouting_briefs WHERE assignmentId=?').get(a.id)?.criteria||'{}'));
      const candidates=this.db.prepare('SELECT p.*,pa.* FROM players p LEFT JOIN player_attributes pa ON pa.playerId=p.id WHERE p.region=? AND (p.teamId IS NULL OR p.teamId<>?) AND NOT EXISTS(SELECT 1 FROM scout_assignments s WHERE s.careerId=? AND s.playerId=p.id AND s.status=\'pending\') ORDER BY p.id').all(a.region,c.teamId,c.id).filter(p=>
        (p.age==null?brief.minAge===15&&brief.maxAge===45:p.age>=brief.minAge&&p.age<=brief.maxAge)&&Object.entries(brief.skills).every(([key,n])=>p[key]>=Number(n))&&
        (!this.db.prepare('SELECT 1 FROM hidden_prospects WHERE playerId=?').get(p.id)||this.hash(c.id+a.region+a.nextReport+p.id)%100<18+staffDepartment(this.db,c,'Recruitment').level*4));
      const ordered=candidates.map(p=>({...p,depth:this.depth(c.id,p.id)})).filter(p=>!previousIds.has(p.id)&&p.depth<3).sort((x,y)=>x.depth-y.depth||this.hash(a.id+a.nextReport+x.id)-this.hash(a.id+a.nextReport+y.id)).slice(0,6+(month-1)*4);
      for(const p of ordered)this.db.prepare('INSERT OR IGNORE INTO scouting_region_discoveries VALUES(?,?,?)').run(a.id,p.id,a.nextReport);
      for(const p of [...followups,...ordered]){this.db.prepare("INSERT INTO scout_assignments VALUES(?,?,?,?,?,?,'completed')").run(uuid(),c.id,p.id,a.startedDate,a.nextReport,p.depth+1);this.observe(c,p.id,p.depth+1,a.nextReport);}
      clubMessage(this.db,c,`${a.region}: month ${month} scouting update`,`${ordered.length} additional players observed${ordered.length?`: ${ordered.map(p=>p.gamertag).join(', ')}`:'.'} ${followups.length} earlier reports deepened. ${previous.length+ordered.length} players covered during this assignment. Continued observation reveals narrower rating estimates, form and eventually detailed attributes. Available discoveries depend on the region's player pool.`,'/scouting');
      this.db.prepare('UPDATE scouting_regions SET nextReport=?,status=? WHERE id=?').run(addDays(a.nextReport,30),a.nextReport>=a.endDate?'completed':'active',a.id);
    }
  }
  private hash(s:string){let n=0;for(const c of s)n=Math.imul(n,31)+c.charCodeAt(0)|0;return n>>>0;}
}
