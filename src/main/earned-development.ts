import type {AppDatabase} from './database';
import {v4 as uuid} from 'uuid';
import {addDays} from '../game/career-rules';
import {MATCH_ROLES,playerMatchRole} from '../game/tactics';
import {botDifficulty} from '../game/bot-difficulty';
import {CORE_SKILLS,coreSkills,skillCost,localSkillTier,developedOverall} from '../game/local-skill-progression';
import {careerMode,isPath} from '../game/career-mode';
import {pathPointCost} from './path-to-glory';
const clamp=(n:number,a=0,b=1)=>Math.max(a,Math.min(b,n));

/** Permanent ability needs training and distinct, credible competitive series.
 * Temporary form/confidence is updated after each game, not turned into OVR. */
export class EarnedDevelopment {
  constructor(private db:AppDatabase){}
  private path(c:any){return isPath(c)||careerMode(this.db,c.id)==='Path To Glory';}
  enabled(c:any){return this.path(c)||botDifficulty(c.difficulty)!=='Hard';}
  private hasSkillRoom(p:any){
    const skills=coreSkills(this.db.prepare('SELECT * FROM player_attributes WHERE playerId=?').get(p.id),p.overall);
    return Object.values(skills).some(v=>v+1<=Math.min(100,p.potential+3));
  }
  private state(c:any,p:any,date:string){
    if(this.path(c))this.skillState(c,p);
    this.db.prepare('INSERT OR IGNORE INTO earned_development(careerId,playerId,cycleStart,trainingCredit,trainingDays) VALUES (?,?,?,0,0)').run(c.id,p.id,date);
    return this.db.prepare('SELECT * FROM earned_development WHERE careerId=? AND playerId=?').get(c.id,p.id);
  }
  private skillState(c:any,p:any){
    const attributes=this.db.prepare('SELECT * FROM player_attributes WHERE playerId=?').get(p.id)||{};
    this.db.prepare('INSERT OR IGNORE INTO player_skill_development(careerId,playerId,baseOverall,baseSkills) VALUES (?,?,?,?)').run(c.id,p.id,p.overall,JSON.stringify(coreSkills(attributes,p.overall)));
    return this.db.prepare('SELECT * FROM player_skill_development WHERE careerId=? AND playerId=?').get(c.id,p.id);
  }
  allocate(c:any,playerId:string,skillId:string){
    if(!this.path(c))throw new Error('Allocate skill points in Path To Glory. Manager Career uses its original development system.');
    return this.db.transaction(()=>{
      const p=this.db.prepare('SELECT * FROM players WHERE id=? AND teamId=?').get(playerId,c.teamId),skill=CORE_SKILLS.find(s=>s.id===skillId);
      if(!p)throw new Error('Choose a player in your own squad.');if(!skill)throw new Error('Choose a valid core skill.');
      const state=this.skillState(c,p),attributes=this.db.prepare('SELECT * FROM player_attributes WHERE playerId=?').get(p.id)||{},skills=coreSkills(attributes,p.overall),value=skills[skill.id],cap=Math.min(100,p.potential+3),cost=skillCost(value);
      if(value+1>cap)throw new Error('This skill has reached this player’s development ceiling.');
      if(state.points<cost)throw new Error(`This upgrade needs ${cost} development points.`);
      this.db.prepare('INSERT OR IGNORE INTO player_attributes(playerId) VALUES (?)').run(p.id);
      // Initialise missing values before changing OVR, so fallback attributes
      // cannot create extra growth after the player's rating changes.
      for(const s of CORE_SKILLS)for(const key of s.attributes)this.db.prepare(`UPDATE player_attributes SET ${key}=COALESCE(${key},?) WHERE playerId=?`).run(p.overall,p.id);
      const row=this.db.prepare('SELECT * FROM player_attributes WHERE playerId=?').get(p.id),values=Object.fromEntries(skill.attributes.map(key=>[key,Number(row[key])])),before={...values};
      let remaining=skill.attributes.length;
      for(const key of skill.attributes){const gain=Math.min(1,Math.max(0,cap-values[key]));values[key]+=gain;remaining-=gain;}
      for(const key of [...skill.attributes].sort((a,b)=>values[a]-values[b])){const gain=Math.min(remaining,Math.max(0,cap-values[key]));values[key]+=gain;remaining-=gain;}
      if(remaining>1e-8)throw new Error('This skill has reached this player’s development ceiling.');
      for(const key of skill.attributes)if(values[key]>before[key])this.db.prepare(`UPDATE player_attributes SET ${key}=? WHERE playerId=?`).run(values[key],p.id);
      const updated=coreSkills(this.db.prepare('SELECT * FROM player_attributes WHERE playerId=?').get(p.id),p.overall),overall=Math.max(p.overall,developedOverall(state.baseOverall,JSON.parse(state.baseSkills),updated,p.potential));
      this.db.prepare('UPDATE player_skill_development SET points=points-?,spentPoints=spentPoints+? WHERE careerId=? AND playerId=?').run(cost,cost,c.id,p.id);
      this.db.prepare('UPDATE players SET overall=? WHERE id=?').run(overall,p.id);
      const body=`${p.gamertag}: ${skill.label} improved to ${updated[skill.id].toFixed(1)}.${overall>p.overall?` Accumulated skill development earned ${overall} OVR.`:''} Meet every squad requirement and win the promotion trial to unlock stronger bots for a new series.`;
      this.db.prepare('INSERT INTO development_logs(id,careerId,playerId,date,body) VALUES (?,?,?,?,?)').run(uuid(),c.id,p.id,c.currentDate,body);
      return {success:true,overall,points:state.points-cost};
    })();
  }
  evidence(c:any,p:any,start:string){
    const rows=this.db.prepare('SELECT * FROM development_evidence WHERE careerId=? AND playerId=? AND date>=? AND date>=?').all(c.id,p.id,start,addDays(c.currentDate,-120));
    return {series:rows.filter(r=>r.weight>=.6&&r.performance>=.55).length,
      credit:rows.reduce((n,r)=>n+.14*r.weight*r.performance,0)};
  }
  overview(c:any){
    return this.db.prepare('SELECT * FROM players WHERE teamId=? ORDER BY overall DESC,id').all(c.teamId).map(p=>{
      const path=this.path(c),wallet=path?this.skillState(c,p):{points:0,earnedPoints:0},skills=coreSkills(this.db.prepare('SELECT * FROM player_attributes WHERE playerId=?').get(p.id),p.overall);
      const state=this.db.prepare('SELECT * FROM earned_development WHERE careerId=? AND playerId=?').get(c.id,p.id);
      const evidence=this.evidence(c,p,state?.cycleStart||c.currentDate);
      return {playerId:p.id,name:p.gamertag,overall:p.overall,potential:p.potential,points:wallet.points,earnedPoints:wallet.earnedPoints,
        ...(path?{xp:this.db.prepare('SELECT xp FROM path_player_xp WHERE careerId=? AND playerId=?').get(c.id,p.id)?.xp||0,xpNeeded:pathPointCost(p.overall)}:{}),
        skills:CORE_SKILLS.map(s=>({id:s.id,label:s.label,effect:s.effect,value:skills[s.id],cost:skillCost(skills[s.id]),atCap:skills[s.id]+1>Math.min(100,p.potential+3)})),tier:path?localSkillTier('Path To Glory',p.overall,skills):null,trainingPercent:Math.round(clamp(state?.trainingCredit||0)*100),trainingDays:state?.trainingDays||0,
        provenSeries:evidence.series,matchPercent:Math.round(clamp(evidence.credit)*100),
        status:!this.hasSkillRoom(p)?'At skill ceiling':path?(wallet.points?'Development points ready':'Play matches to earn XP'):!state?'Training not started':(state.trainingDays<30||state.trainingCredit<1)?'Building training foundation':evidence.series<6||evidence.credit<1?'Needs sustained match evidence':'Awaiting development review'};
    });
  }
  train(c:any,p:any,date:string,intensity:number,team:any){
    const s=this.state(c,p,date);
    if(s.lastTrainingDate&&date<=s.lastTrainingDate)return 0;
    this.db.prepare('UPDATE earned_development SET lastTrainingDate=? WHERE careerId=? AND playerId=?').run(date,c.id,p.id);
    if((this.path(c)?!this.hasSkillRoom(p):p.overall>=p.potential)||p.fatigue>70)return 0;
    const growth=.016*intensity*(p.age==null?1:p.age<=21?1.2:p.age<=26?1:.75)
      *(.65+(p.developmentRate??50)/140)*(.8+(p.professionalism??50)/250)
      *(.8+(team.coachRating??50)/250)*(1+Math.min(5,team.facilityLevel??1)*.04)
      *(.8+(p.morale??50)/250)*(p.overall>=94?.6:p.overall>=90?.8:1);
    this.db.prepare('UPDATE earned_development SET trainingCredit=MIN(1.25,trainingCredit+?),trainingDays=trainingDays+1 WHERE careerId=? AND playerId=?').run(growth,c.id,p.id);
    this.review(c,p,date);return growth;
  }
  private review(c:any,p:any,date:string){
    if(this.path(c))return;
    const s=this.state(c,p,date),proof=this.evidence({...c,currentDate:date},p,s.cycleStart);
    if(p.overall>=p.potential||s.trainingCredit<1||s.trainingDays<30||date<addDays(s.cycleStart,35)||proof.series<6||proof.credit<1)return;
    this.db.prepare('UPDATE players SET overall=MIN(potential,overall+1) WHERE id=?').run(p.id);
    this.db.prepare('UPDATE earned_development SET trainingCredit=0,trainingDays=0,cycleStart=?,lastGainDate=? WHERE careerId=? AND playerId=?').run(addDays(date,1),date,c.id,p.id);
    const body=`${p.gamertag} earned ${p.overall+1} OVR after ${s.trainingDays} training sessions and ${proof.series} credible series performances. Temporary form remains separate.`;
    this.db.prepare('INSERT INTO development_logs(id,careerId,playerId,date,body) VALUES (?,?,?,?,?)').run(uuid(),c.id,p.id,date,body);
    this.db.prepare('INSERT INTO inbox_items(id,careerId,date,type,title,body,isRead) VALUES (?,?,?,?,?,?,0)').run(uuid(),c.id,date,'general',`${p.gamertag}: earned development`,body);
  }
  recordGame(c:any,result:any,gameId:string,plan:any){
    if(!this.enabled(c))return;
    const starters=JSON.parse(this.db.prepare('SELECT players FROM series_selections WHERE careerId=? AND fixtureId=?').get(c.id,result.fixtureId)?.players||'[]');
    for(const stat of result.playerStats||[]){
      // Never turn the human's controller skill into AI development credit.
      // Old played-result payloads without a known human identity fail closed.
      if(!this.path(c)&&result.wasPlayed&&(!(result.playerStats||[]).some((s:any)=>s.isHuman===true)||stat.isHuman===true))continue;
      const p=this.db.prepare('SELECT * FROM players WHERE id=?').get(stat.playerId);if(!p)continue;
      const role=p.teamId===c.teamId?playerMatchRole(plan,p.id,Math.max(0,starters.indexOf(p.id))):p.preferredTendency;
      const attacking=String(role).includes('First Man')||String(role).includes('STRIKER')||String(role).includes('CARRY');
      const defending=String(role).includes('Third Man')||String(role).includes('ANCHOR');
      const contribution=(attacking?stat.goals*1.3+stat.assists*.7: defending?stat.saves*.85+stat.assists*.65+stat.goals*.65:stat.assists+stat.goals+stat.saves*.5)+Math.min(2,stat.demos*.3);
      const misses=this.db.prepare("SELECT COUNT(*) AS n FROM game_incidents WHERE gameResultId=? AND playerId=? AND type='open_net_miss'").get(gameId,p.id).n;
      const performance=clamp(.25+Math.min(.5,contribution*.14)+Math.min(.2,stat.score/2500)-Math.min(.45,misses*.12));
      const won=p.teamId===result.blueTeamId?result.blueScore>result.orangeScore:result.orangeScore>result.blueScore;
      const formChange=Math.round(clamp((performance-.5)*8+(won?1:-1),-4,4)),confidenceChange=Math.round(clamp((performance-.5)*5+(won?.5:-.5),-3,3));
      this.db.prepare('UPDATE players SET form=MIN(100,MAX(0,COALESCE(form,50)+?)),fatigue=MIN(100,COALESCE(fatigue,0)+3) WHERE id=?').run(formChange,p.id);
      this.db.prepare('UPDATE player_traits SET confidence=MIN(100,MAX(0,COALESCE(confidence,50)+?)) WHERE playerId=?').run(confidenceChange,p.id);
      this.db.prepare('INSERT OR IGNORE INTO game_development(gameResultId,playerId,performance,role) VALUES (?,?,?,?)').run(gameId,p.id,performance,String(role));
    }
  }
  series(c:any,f:any,plan:any){
    if(!this.enabled(c)||this.path(c))return;
    const opponentId=f.homeTeamId===c.teamId?f.awayTeamId:f.homeTeamId;
    const opposition=this.db.prepare('SELECT overall FROM players WHERE teamId=? ORDER BY overall DESC LIMIT 3').all(opponentId);
    if(opposition.length!==3)return;
    const opponentRating=opposition.reduce((n,p)=>n+p.overall,0)/3;
    const type=this.db.prepare('SELECT type FROM competitions WHERE id=?').get(f.competitionId)?.type;
    for(const p of this.db.prepare('SELECT * FROM players WHERE teamId=?').all(c.teamId)){
      const games=this.db.prepare('SELECT d.* FROM game_development d JOIN game_results g ON g.id=d.gameResultId WHERE g.fixtureId=? AND d.playerId=?').all(f.id,p.id);
      if(!games.length)continue;
      const performance=games.reduce((n,g)=>n+g.performance,0)/games.length;
      const totalGames=this.db.prepare('SELECT COUNT(*) AS n FROM game_results WHERE fixtureId=?').get(f.id).n;
      const weight=clamp(1-Math.max(0,p.overall-opponentRating-5)/25,.1,1)*(type==='SCRIM'?.4:1)*Math.min(1,games.length/Math.max(1,totalGames));
      this.state(c,p,c.currentDate);
      this.db.prepare('INSERT OR IGNORE INTO development_evidence VALUES (?,?,?,?,?,?,?,?)').run(c.id,p.id,f.id,c.currentDate,opponentRating,performance,weight,games[0].role);
      this.review(c,p,c.currentDate);
    }
  }
}
