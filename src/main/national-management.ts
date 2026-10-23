import type {AppDatabase} from './database';
import {v4 as uuid} from 'uuid';
import {nationalIdentity,eligibleForCountry} from '../game/national-eligibility';
import {FifaWorldCup,type NationalState,type Nation,type NationalMatch} from './fifae-world-cup';
import {DEFAULT_TACTICS,TACTIC_CHOICES,MATCH_ROLES,bindTactics} from '../game/tactics';
import {buildSeriesContext} from '../services/series-context';
import {isPath,careerMode} from '../game/career-mode';
import {RecruitmentNetwork} from './recruitment-network';
const parse=(s:string)=>JSON.parse(s||'{}');

/** International employment and call-ups never change a player's club teamId. */
export class NationalManagement {
  constructor(private db:AppDatabase){}
  private career(id:string){const c=this.db.prepare('SELECT * FROM careers WHERE id=?').get(id);if(!c)throw Error('Career not found.');return {...c,mode:careerMode(this.db,id)};}
  job(id:string){return this.db.prepare('SELECT * FROM national_management WHERE careerId=?').get(id)||null;}
  private events(id:string){return this.db.prepare("SELECT c.*,cc.startDate FROM competitions c JOIN career_competitions cc ON cc.competitionId=c.id WHERE cc.careerId=? AND c.type='FIFAE' AND cc.stage<>'ARCHIVED' AND c.status<>'cancelled' ORDER BY cc.startDate").all(id);}
  private locked(id:string,nationId?:string){return this.events(id).some(c=>{const state:NationalState=parse(c.config).national;return state.phase!=='selection'&&state.phase!=='completed'&&(!nationId||state.entrants.some(n=>n.id===nationId));});}
  countries(){
    const groups=new Map<string,{code:string;name:string;id:string;players:any[]}>();
    for(const p of this.db.prepare('SELECT * FROM players ORDER BY overall DESC,id').all()){
      const identity=nationalIdentity(p.nationality);if(!identity)continue;
      const row=groups.get(identity.code)||{...identity,players:[]};row.players.push(p);groups.set(identity.code,row);
    }return [...groups.values()].filter(n=>n.players.length>=3).sort((a,b)=>a.name.localeCompare(b.name));
  }
  appoint(careerId:string,code:string){
    const career=this.career(careerId);if(isPath(career))throw Error('National management is available in Manager Career. Path To Glory keeps its fixed player squad.');
    if(this.locked(careerId))throw Error('Finish the active FIFAe tournament before changing national jobs.');
    const country=this.countries().find(n=>n.code===code);if(!country)throw Error('This country needs at least three players with recorded nationality before it can appoint you.');
    const callups=country.players.slice(0,3).map(p=>p.id),tactics=bindTactics(DEFAULT_TACTICS,country.players.slice(0,3));
    this.db.prepare('INSERT OR REPLACE INTO national_management VALUES (?,?,?,?,?,?,?)').run(careerId,country.code,country.id,country.name,career.currentDate,JSON.stringify(callups),JSON.stringify(tactics));
    this.db.prepare('INSERT INTO inbox_items(id,careerId,date,type,title,body,isRead,actions) VALUES(?,?,?,?,?,?,0,?)').run(uuid(),careerId,career.currentDate,'general',country.name+' appoint you as national manager','You now hold the national job alongside your club role. Three provisional call-ups have been selected. Review them before the next FIFAe roster lock. Club contracts and squads are unchanged.',JSON.stringify([{label:'National team',action:'navigate',data:{href:'/national-team'}}]));
    return {success:true};
  }
  resign(careerId:string){const job=this.job(careerId);if(job&&this.locked(careerId,job.nationId))throw Error('Finish the active FIFAe tournament before resigning from this national job.');this.db.prepare('DELETE FROM national_management WHERE careerId=?').run(careerId);return {success:true};}
  callUp(careerId:string,ids:string[]){
    const job=this.job(careerId);if(!job)throw Error('Accept a national job first.');if(this.locked(careerId,job.nationId))throw Error('Your three-player FIFAe squad is locked for this tournament.');
    if(!Array.isArray(ids)||ids.length!==3||new Set(ids).size!==3)throw Error('Select exactly three different national players.');
    const players=ids.map(id=>this.db.prepare('SELECT * FROM players WHERE id=?').get(id));
    if(players.some(p=>!p||!eligibleForCountry(p,job.countryCode)))throw Error('Every call-up must have recorded nationality for '+job.nationName+'. Club location and residence do not establish eligibility.');
    this.db.prepare('UPDATE national_management SET callups=?,tactics=? WHERE careerId=?').run(JSON.stringify(ids),JSON.stringify(bindTactics(parse(job.tactics),players)),careerId);return {success:true};
  }
  saveTactics(careerId:string,plan:any){
    const job=this.job(careerId);if(!job)throw Error('Accept a national job first.');
    const inProgress=new FifaWorldCup(this.db).fixtures(careerId).some(m=>m.status==='in_progress'&&[m.homeTeamId,m.awayTeamId].includes(job.nationId));
    if(inProgress)throw Error('Finish this national series before changing the tactical plan.');
    if(!plan||Object.entries(TACTIC_CHOICES).some(([key,choices])=>!choices.includes(plan[key]))||[0,1,2].some(i=>!MATCH_ROLES.includes(plan.roles?.[i])))throw Error('Choose valid national tactics and three roles.');
    const players=parse(job.callups).map((id:string)=>this.db.prepare('SELECT * FROM players WHERE id=?').get(id));
    if(players.some((p:any)=>!p||!eligibleForCountry(p,job.countryCode)))throw Error('Review national eligibility before saving tactics.');
    this.db.prepare('UPDATE national_management SET tactics=? WHERE careerId=?').run(JSON.stringify(bindTactics({...plan,rolesByPlayer:Object.fromEntries(players.map((p:any,i:number)=>[p.id,plan.roles[i]]))},players)),careerId);return {success:true};
  }
  status(careerId:string){
    const career=this.career(careerId),job=this.job(careerId),worldCup=new FifaWorldCup(this.db),projected=new Set(worldCup.projected().map(n=>n.id)),countries=this.countries();
    const ids:string[]=job?parse(job.callups):[],knowledge=new RecruitmentNetwork(this.db);
    const pool=job?(countries.find(n=>n.code===job.countryCode)?.players||[]).map(p=>{
      const visible=knowledge.visible(career,p);return {id:p.id,gamertag:p.gamertag,nationality:p.nationality,clubName:this.db.prepare('SELECT name FROM teams WHERE id=?').get(p.teamId)?.name||'Free agent',overall:ids.includes(p.id)?p.overall:visible.overall,estimatedOverall:visible.estimatedOverall,age:visible.age};
    }):[];
    const fixtures=job?worldCup.fixtures(careerId).filter(m=>[m.homeTeamId,m.awayTeamId].includes(job.nationId)).sort((a,b)=>a.scheduledDate.localeCompare(b.scheduledDate)):[];
    return {available:!isPath(career),job:job?{...job,callups:ids,tactics:parse(job.tactics)}:null,locked:!!job&&this.locked(careerId,job.nationId),countries:countries.map(n=>({code:n.code,name:n.name,id:n.id,eligiblePlayers:n.players.length,projected:projected.has(n.id)})),pool,fixtures,nextFixture:fixtures.find(m=>m.status!=='completed')||null,competitions:this.events(careerId).map(c=>({id:c.id,name:c.name,startDate:c.startDate,phase:parse(c.config).national.phase,selected:!!job&&parse(c.config).national.entrants.some((n:Nation)=>n.id===job.nationId)}))};
  }
  context(careerId:string,matchId:string,gameNumber?:number,ready=true){
    const career=this.career(careerId),job=this.job(careerId);if(!job||isPath(career))throw Error('This career has no national manager job.');
    const competition=this.events(careerId).find(c=>parse(c.config).national.matches.some((m:NationalMatch)=>m.id===matchId));if(!competition)throw Error('National match not found in this save.');
    const config=parse(competition.config),state:NationalState=config.national,m=state.matches.find(m=>m.id===matchId)!;
    if(![m.homeTeamId,m.awayTeamId].includes(job.nationId)||config.managedNationId!==job.nationId)throw Error('You can only control the country you were appointed to manage for this tournament.');
    if(ready&&(m.status==='completed'||m.scheduledDate>career.currentDate))throw Error(m.status==='completed'?'This national matchup is complete.':'Advance to the national match date first.');
    const blue=state.entrants.find(n=>n.id===job.nationId)!,orange=state.entrants.find(n=>n.id===(m.homeTeamId===job.nationId?m.awayTeamId:m.homeTeamId))!;
    const roster=(nation:Nation)=>{
      const country=nation.code||nationalIdentity(nation.players[0]?.nationality)?.code;
      const players=nation.players.map(p=>this.db.prepare('SELECT * FROM players WHERE id=?').get(p.id));
      if(!country||players.length!==3||new Set(players.map(p=>p?.id)).size!==3||players.some(p=>!p||!eligibleForCountry(p,country)))throw Error(nation.name+' cannot field three eligible national players. Review recorded nationalities.');
      return players;
    };
    const bluePlayers=roster(blue),orangePlayers=roster(orange),games=(m.games||[]);
    if(new Set([...bluePlayers,...orangePlayers].map(p=>p.id)).size!==6)throw Error('National teams must field six different eligible players.');
    if(ready&&gameNumber!==undefined&&gameNumber!==games.length+1)throw Error('Launch the next unsaved national game. Completed games cannot be replayed.');
    const series=ready?buildSeriesContext(m.seriesFormat,games,gameNumber??games.length+1):null;
    return {career,job,competition,config,state,match:m,blue,orange,bluePlayers,orangePlayers,games,series,tactics:bindTactics(parse(job.tactics),bluePlayers)};
  }
  match(careerId:string,id:string){const c=this.context(careerId,id,undefined,false);return {fixture:{...c.match,competitionId:c.competition.id,competitionName:c.competition.name,homeTeamName:c.state.entrants.find(n=>n.id===c.match.homeTeamId)?.name,awayTeamName:c.state.entrants.find(n=>n.id===c.match.awayTeamId)?.name},blueTeam:{id:c.blue.id,name:c.blue.name},orangeTeam:{id:c.orange.id,name:c.orange.name},bluePlayers:c.bluePlayers.map(p=>({id:p.id,gamertag:p.gamertag,overall:p.overall,nationality:p.nationality})),orangePlayers:c.orangePlayers.map(p=>({id:p.id,gamertag:p.gamertag,nationality:p.nationality})),games:c.games,gameNumber:c.games.length+1,tactics:c.tactics};}
  recordPlayedGame(careerId:string,result:any){
    return this.db.transaction(()=>{
      const c=this.context(careerId,result.fixtureId,undefined,false),existing=c.games.find(g=>g.gameNumber===result.gameNumber);
      if(existing){if(existing.blueScore!==result.blueScore||existing.orangeScore!==result.orangeScore||existing.blueTeamId!==result.blueTeamId||existing.orangeTeamId!==result.orangeTeamId)throw Error('A different national result is already saved. Recover the original result.');return {success:true,id:existing.id,seriesComplete:c.match.status==='completed'};}
      if(c.match.status==='completed'||c.match.scheduledDate>c.career.currentDate)throw Error('This national game is not ready to record.');
      buildSeriesContext(c.match.seriesFormat,c.games,result.gameNumber);
      if(!result.wasPlayed||result.blueTeamId!==c.blue.id||result.orangeTeamId!==c.orange.id||![result.blueScore,result.orangeScore].every(n=>Number.isInteger(n)&&n>=0)||result.blueScore===result.orangeScore)throw Error('A valid played national result is required.');
      const ids=[...c.bluePlayers,...c.orangePlayers].map(p=>p.id),stats=result.playerStats;
      if(!Array.isArray(stats)||stats.length!==6||new Set(stats.map(p=>p.playerId)).size!==6||stats.some(p=>!ids.includes(p.playerId)||['goals','assists','saves','shots','demos','score'].some(k=>!Number.isInteger(p[k])||p[k]<0)))throw Error('The played national statistics must match the six eligible launch players.');
      const game={id:uuid(),gameNumber:result.gameNumber,blueTeamId:result.blueTeamId,orangeTeamId:result.orangeTeamId,blueScore:result.blueScore,orangeScore:result.orangeScore,playerStats:stats,wasPlayed:true};
      c.match.games=[...c.games,game];const home=c.match.games.filter(g=>g.blueTeamId===c.match.homeTeamId?g.blueScore>g.orangeScore:g.orangeScore>g.blueScore).length;
      c.match.homeScore=home;c.match.awayScore=c.match.games.length-home;
      const required=c.match.seriesFormat==='BO2'?2:4,complete=c.match.seriesFormat==='BO2'?c.match.games.length===2:Math.max(c.match.homeScore,c.match.awayScore)>=required;
      c.match.status=complete?'completed':'in_progress';this.db.prepare('UPDATE competitions SET config=? WHERE id=?').run(JSON.stringify(c.config),c.competition.id);
      if(complete)new FifaWorldCup(this.db).progress(careerId,c.career.currentDate);
      return {success:true,id:game.id,seriesComplete:complete};
    })();
  }
}
