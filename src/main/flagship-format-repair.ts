import type {AppDatabase} from './database';
import {v4 as uuid} from 'uuid';
import {Tournament} from './tournament';
import {officialRules,circuitPoints} from '../game/official-competition-rules';
import {addDays} from '../game/career-rules';
import {CareerHonours} from './career-honours';
const parse=(s:string,fallback:any={})=>{try{return JSON.parse(s||'')||fallback;}catch{return fallback;}};
const eventTables=['fixture_stages','tournament_nodes','tournament_groups','tournament_stage_teams','tournament_state','competition_byes','qualification_results'];

/** Repairs the old all-against-all flagship schedule without deleting played games.
 * Started events require the explicit in-game repair action; unplayed ones can
 * be upgraded automatically. A short field is filled only from saved qualifiers.
 */
export class FlagshipFormatRepair {
 constructor(private db:AppDatabase,private ranking:(id:string)=>any[]){}
 preview(careerId:string,id:string){
  const career=this.db.prepare('SELECT * FROM careers WHERE id=?').get(careerId);
  const event=this.db.prepare('SELECT c.*,cc.stage,cc.cycle,cc.startDate,cc.sources FROM competitions c JOIN career_competitions cc ON cc.competitionId=c.id WHERE cc.careerId=? AND c.id=?').get(careerId,id);
  if(!career||!event)throw Error('This event does not belong to your career.');
  const config=parse(event.config),legacy=!config.rulesVersion||config.legacyRules||config.legacyLeague;
  const required=['MAJOR','WORLDS'].includes(event.stage)&&legacy&&!['completed','cancelled'].includes(event.status)&&!new Tournament(this.db).has(id)&&!!this.db.prepare('SELECT teamId FROM competition_entries WHERE competitionId=? LIMIT 1').get(id);
  if(!required)return {required:false,canRepair:false,completedSeries:0,entrants:[] as any[],missing:0,reason:''};
  const inProgress=!!this.db.prepare("SELECT f.id FROM fixtures f WHERE f.competitionId=? AND (f.status='in_progress' OR (f.status<>'completed' AND EXISTS(SELECT 1 FROM game_results g WHERE g.fixtureId=f.id))) LIMIT 1").get(id);
  const completedSeries=this.db.prepare("SELECT COUNT(*) AS n FROM fixtures WHERE competitionId=? AND status='completed'").get(id).n;
  // The old migration could leave a third legacy Major beside the two correct
  // RLCS Majors. Continue the already-qualified official event rather than
  // adding another international competition or changing its qualified field.
  const successor=this.db.prepare("SELECT c.*,cc.startDate,ts.drawDate,ts.phase FROM competitions c JOIN career_competitions cc ON cc.competitionId=c.id JOIN tournament_state ts ON ts.competitionId=c.id WHERE cc.careerId=? AND cc.stage=? AND cc.cycle=? AND c.id<>? AND c.seasonId IS ? AND c.status NOT IN ('completed','cancelled') ORDER BY cc.startDate,c.id").all(careerId,event.stage,event.stage==='MAJOR'?(event.cycle<=3?1:2):event.cycle,id,event.seasonId).find(c=>{const rules=parse(c.config);return rules.rulesVersion&&!rules.legacyRules;});
  if(successor){
   const entrants=this.db.prepare('SELECT ce.teamId,ce.seed,t.name AS teamName,t.region FROM competition_entries ce JOIN teams t ON t.id=ce.teamId WHERE ce.competitionId=? ORDER BY ce.seed').all(successor.id).map(r=>({...r,qualification:'Qualified for '+successor.name}));
   if([16,20].includes(entrants.length))return {required,canRepair:!inProgress,completedSeries,entrants,missing:0,target:entrants.length,inProgress,reason:inProgress?'Finish the current series before repairing this event.':'',successorId:successor.id,successorName:successor.name,drawDate:successor.drawDate,startDate:successor.startDate,fieldNote:`${successor.name} already exists in this season with its qualified field. Retire this duplicate league and continue that official event. Its entrants, draw date and results stay unchanged.`};
  }
  const existing=this.db.prepare('SELECT ce.teamId,ce.seed,t.name AS teamName,t.region FROM competition_entries ce JOIN teams t ON t.id=ce.teamId WHERE ce.competitionId=? ORDER BY ce.seed,ce.teamId').all(id);
  const eligible=(teamId:string)=>!!this.db.prepare("SELECT t.id FROM teams t WHERE t.id=? AND NOT EXISTS(SELECT 1 FROM generated_entities g WHERE g.id=t.id) AND NOT EXISTS(SELECT 1 FROM team_roster_sources s WHERE s.teamId=t.id AND s.status IN ('inactive','incomplete','disbanded')) AND (SELECT COUNT(*) FROM players p WHERE p.teamId=t.id)>=3").get(teamId);
  const target=event.stage==='WORLDS'&&existing.length===20?20:16;
  const entrants=existing.filter(r=>eligible(r.teamId)).slice(0,target).map(r=>({...r,qualification:'Confirmed place in this event'}));
  const candidates=new Map<string,any>();
  for(const sourceId of parse(event.sources,[]) as string[]){
   const source=this.db.prepare("SELECT c.id,c.name,c.status,cc.stage,cc.cycle FROM competitions c JOIN career_competitions cc ON cc.competitionId=c.id WHERE c.id=? AND cc.careerId=?").get(sourceId,careerId);
   if(!source||source.status!=='completed'||!['REGIONAL','MAJOR','LCQ'].includes(source.stage))continue;
   for(const [i,row] of this.ranking(sourceId).entries()){
    if(!eligible(row.teamId))continue;
    const place=row.placement||i+1,score=circuitPoints(source.stage,source.cycle,place),old=candidates.get(row.teamId);
    candidates.set(row.teamId,{teamId:row.teamId,points:(old?.points||0)+score,bestPlace:Math.min(old?.bestPlace||999,place),qualification:`Saved qualification results: ${source.name} · place ${place}`});
   }
  }
  for(const candidate of [...candidates.values()].sort((a,b)=>b.points-a.points||a.bestPlace-b.bestPlace||a.teamId.localeCompare(b.teamId))){
   if(entrants.length===target)break;if(entrants.some(r=>r.teamId===candidate.teamId))continue;
   const team=this.db.prepare('SELECT name,region FROM teams WHERE id=?').get(candidate.teamId);
   entrants.push({...candidate,seed:entrants.length+1,teamName:team.name,region:team.region});
  }
  const missing=Math.max(0,target-entrants.length);
  return {required,canRepair:!missing&&!inProgress,completedSeries,entrants,missing,target,inProgress,
   reason:inProgress?'Finish the current series before repairing this event.':missing?`${missing} more teams must earn a place through this event’s qualifying competitions. No teams will be invented or selected by reputation.`:'',
   fieldNote:entrants.some(r=>r.points!==undefined)?'Existing confirmed places are retained. Missing legacy berths are awarded to the next highest-ranked real teams from this event’s completed qualifying competitions.':'All entrants already hold confirmed places in this event.'};
 }
 apply(careerId:string,id:string){return this.db.transaction(()=>{
  const plan=this.preview(careerId,id);if(!plan.required)throw Error('This event already uses a tournament bracket.');
  if(!plan.canRepair)throw Error(plan.reason);
  const career=this.db.prepare('SELECT * FROM careers WHERE id=?').get(careerId),event=this.db.prepare('SELECT * FROM competitions WHERE id=?').get(id);
  const link=this.db.prepare('SELECT * FROM career_competitions WHERE competitionId=? AND careerId=?').get(id,careerId);
  const fixtures=this.db.prepare('SELECT * FROM fixtures WHERE competitionId=?').all(id),entries=this.db.prepare('SELECT * FROM competition_entries WHERE competitionId=?').all(id);
  const archiveId=plan.successorId?id:plan.completedSeries?uuid():null;
  const snapshot={event,link,fixtures,entries,successor:plan.successorId?this.db.prepare('SELECT * FROM competitions WHERE id=?').get(plan.successorId):null,calendar:this.db.prepare('SELECT * FROM calendar_events WHERE relatedId=? AND careerId=?').all(id,careerId),tables:Object.fromEntries(eventTables.map(table=>[table,this.db.prepare(`SELECT * FROM ${table} WHERE competitionId=?`).all(id)])),archiveId,repairedAt:career.currentDate};
  this.db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES (?,?)').run('flagship_format_backup:'+id,JSON.stringify(snapshot));
  if(plan.successorId){
   for(const table of eventTables)this.db.prepare(`DELETE FROM ${table} WHERE competitionId=?`).run(id);
   this.db.prepare("DELETE FROM calendar_events WHERE careerId=? AND (relatedId=? OR relatedId IN(SELECT id FROM fixtures WHERE competitionId=? AND status<>'completed'))").run(careerId,id,id);
   this.db.prepare("DELETE FROM fixtures WHERE competitionId=? AND status<>'completed'").run(id);
   this.db.prepare("UPDATE career_competitions SET stage='ARCHIVED' WHERE careerId=? AND competitionId=?").run(careerId,id);
   this.db.prepare("UPDATE competitions SET name=?,type='ARCHIVE',format='archived_results',status='completed',prizePool=0,config=? WHERE id=?").run(event.name+' — prior format results',JSON.stringify({archivedFormat:true,replacementId:plan.successorId,qualificationRule:'Historical results from the retired league. These series do not count towards the official group stage.'}),id);
   const next=parse(this.db.prepare('SELECT config FROM competitions WHERE id=?').get(plan.successorId).config);
   this.db.prepare('UPDATE competitions SET config=? WHERE id=?').run(JSON.stringify({...next,repairArchiveId:id,fieldAdjustment:'The duplicate legacy league was retired. Its completed series remain in linked history; this event keeps its official qualified field and schedule.'}),plan.successorId);
   return {success:true,archiveId:id,replacementId:plan.successorId,completedSeriesPreserved:plan.completedSeries};
  }
  if(archiveId){
   this.db.prepare('INSERT INTO competitions(id,name,region,type,format,prizePool,seasonId,status,config) VALUES (?,?,?,?,?,?,?,?,?)').run(archiveId,event.name+' — prior format results',event.region,'ARCHIVE','archived_results',0,event.seasonId,'completed',JSON.stringify({archivedFormat:true,originalCompetitionId:id,qualificationRule:'Historical results retained from the replaced league schedule. These series do not count towards the repaired group stage.'}));
   this.db.prepare('INSERT INTO career_competitions VALUES (?,?,?,?,?,?)').run(archiveId,careerId,'ARCHIVED',link.cycle,link.startDate,'[]');
   for(const entry of entries)this.db.prepare('INSERT INTO competition_entries(competitionId,teamId,seed) VALUES (?,?,?)').run(archiveId,entry.teamId,entry.seed);
   // Fixture IDs, game scores, player statistics, XP and incident evidence stay intact.
   this.db.prepare("UPDATE fixtures SET competitionId=? WHERE competitionId=? AND status='completed'").run(archiveId,id);
  }
  for(const table of eventTables)this.db.prepare(`DELETE FROM ${table} WHERE competitionId=?`).run(id);
  this.db.prepare('DELETE FROM fixtures WHERE competitionId=?').run(id);
  this.db.prepare('DELETE FROM competition_entries WHERE competitionId=?').run(id);
  this.db.prepare("DELETE FROM calendar_events WHERE relatedId=? AND careerId=? AND type IN ('group_draw','tournament_start')").run(id,careerId);
  const start=addDays(career.currentDate,2),rules=officialRules(link.stage,link.cycle===1?1:2);
  const config={...rules,eventStart:start,advance:link.stage==='WORLDS'||link.cycle!==1?3:2,formatRepairVersion:1,repairArchiveId:archiveId,fieldAdjustment:plan.fieldNote,
   sourceVersion:rules.sourceVersion+' · group/playoff format',qualificationRule:`${plan.target===20?'Worlds play-ins determine the sixteen group places. ':''}Four groups of four. Each team plays three BO5 series, once against every other team in its group. Top ${link.stage==='WORLDS'||link.cycle!==1?'three':'two'} advance to BO7 hybrid playoffs, then single-elimination semifinals and final.`};
  this.db.prepare("UPDATE competitions SET format='round_robin_hybrid',status='scheduled',config=? WHERE id=?").run(JSON.stringify(config),id);
  this.db.prepare('UPDATE career_competitions SET startDate=? WHERE competitionId=?').run(start,id);
  plan.entrants.forEach((entry,i)=>{this.db.prepare('INSERT INTO competition_entries(competitionId,teamId,seed) VALUES (?,?,?)').run(id,entry.teamId,i+1);new CareerHonours(this.db).register(careerId,id,entry.teamId,this.db.prepare('SELECT * FROM players WHERE teamId=? ORDER BY overall DESC,id').all(entry.teamId).slice(0,3),career.currentDate);});
  const tournament=new Tournament(this.db);tournament.prepare(id,plan.entrants.map(e=>e.teamId),start,config);tournament.progress(id,career.currentDate);
  for(const [type,date,title] of [['group_draw',career.currentDate,event.name+' — Group draw'],['tournament_start',start,event.name]])if(!this.db.prepare('SELECT id FROM calendar_events WHERE careerId=? AND relatedId=? AND type=?').get(careerId,id,type))this.db.prepare('INSERT INTO calendar_events(id,careerId,date,type,title,description,relatedId) VALUES (?,?,?,?,?,?,?)').run(uuid(),careerId,date,type,title,config.qualificationRule,id);
  return {success:true,archiveId,completedSeriesPreserved:plan.completedSeries};
 })();}
}
