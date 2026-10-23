import type {AppDatabase} from './database';
import {v4 as uuid} from 'uuid';
import {addDays} from '../game/career-rules';
import {simulateGame,simulateSeries} from '../game/match-simulation';
import {TrophyCeremonies} from './trophy-ceremonies';
import {nationalIdentity,eligibleForCountry} from '../game/national-eligibility';

export const FIFAE_RULES='https://www.fifa.gg/rocket-league/c/fifae-world-cup-25-ft-rocket-league/about';
export const FIFAE_2026='https://www.fifa.gg/rocket-league/c/fifae-world-cup-2026-ft-rocket-league/competition-format';
export type Nation={id:string;name:string;code?:string;seed:number;group:string;players:any[]};
export type NationalMatch={id:string;homeTeamId:string;awayTeamId:string;scheduledDate:string;stage:string;groupName?:string;seriesFormat:string;status:string;homeScore?:number;awayScore?:number;games?:any[]};
type Match=NationalMatch;
export type NationalState={phase:string;entrants:Nation[];matches:Match[];championId?:string;completedDate?:string};
const parse=(s:string)=>JSON.parse(s||'{}');
export class FifaWorldCup {
  constructor(private db:AppDatabase){}
  ensure(career:any){
    const season=this.db.prepare('SELECT * FROM seasons WHERE careerId=? AND isActive=1').get(career.id);
    if(!season||this.db.prepare("SELECT c.id FROM competitions c JOIN career_competitions cc ON cc.competitionId=c.id WHERE cc.careerId=? AND c.seasonId=? AND c.type='FIFAE'").get(career.id,season.id))return;
    const planned=addDays(season.startDate,300),start=planned>career.currentDate?planned:addDays(career.currentDate,14),id=uuid();
    const config={kind:'FIFAE',seriesFormat:'BO2',playoffFormat:'BO7',source:FIFAE_RULES,sourceVersion:'2025 finals format · career edition',
      qualificationRule:'National teams, separate from clubs. Two groups of eight play a double round robin: two games per matchup, with draws allowed. Win 3 points, draw 1, loss 0. Top four in each group advance to BO7 single-elimination quarterfinals, semifinals and final.',
      careerSelectionRule:'Career selection: Saudi Arabia receives the host berth; the fifteen strongest other eligible national squads are invited. Three starters are selected by current ability at roster lock. This is a career invitation system, not a recreation of the FIFAe Nations League or Continental Championships. Club contracts remain unchanged.',
      formatNote:'This career edition uses the published 2025 finals rules. FIFAe 2026 introduced Nations League and Continental qualifying; its finals have been postponed. Career dates and selections are simulated. An exact tie after all published goal tiebreakers is resolved by initial seed in this career edition.',
      currentRulesSource:FIFAE_2026,national:{phase:'selection',entrants:[],matches:[]} satisfies NationalState};
    this.db.prepare('INSERT INTO competitions(id,name,region,type,format,prizePool,seasonId,status,config) VALUES (?,?,?,?,?,?,?,?,?)').run(id,'FIFAe World Cup','GLOBAL','FIFAE','national_double_round_robin',250000,season.id,'scheduled',JSON.stringify(config));
    this.db.prepare('INSERT INTO career_competitions(competitionId,careerId,stage,cycle,startDate,sources) VALUES (?,?,?,?,?,?)').run(id,career.id,'FIFAE',9,start,'[]');
    this.db.prepare('INSERT INTO calendar_events(id,careerId,date,type,title,description,relatedId) VALUES (?,?,?,?,?,?,?)').run(uuid(),career.id,start,'tournament_start','FIFAe World Cup — national selections',config.qualificationRule,id);
    for(const [days,title] of [[1,'Group stage — second round robin'],[2,'Quarterfinals'],[3,'Semifinals and final']] as const)
      this.db.prepare('INSERT INTO calendar_events(id,careerId,date,type,title,description,relatedId) VALUES (?,?,?,?,?,?,?)').run(uuid(),career.id,addDays(start,days),'tournament_start','FIFAe World Cup — '+title,'National-team results update as the career calendar advances.',id);
  }
  projected():Nation[]{return this.select();}
  private select(careerId?:string):Nation[]{
    const grouped=new Map<string,any[]>();
    for(const p of this.db.prepare('SELECT * FROM players ORDER BY overall DESC,id').all()){
      const identity=nationalIdentity(p.nationality);if(!identity)continue;
      const name=identity.name;
      grouped.set(name,[...(grouped.get(name)||[]),p]);
    }
    const ranked=[...grouped].filter(([,p])=>p.length>=3).map(([name,players])=>({name,players:players.slice(0,3),ability:players.slice(0,3).reduce((n,p)=>n+p.overall,0)}))
      .sort((a,b)=>b.ability-a.ability||a.name.localeCompare(b.name));
    const host=ranked.find(n=>n.name==='Saudi Arabia'),field=[...(host?[host]:[]),...ranked.filter(n=>n!==host).slice(0,host?15:16)].sort((a,b)=>b.ability-a.ability||a.name.localeCompare(b.name));
    if(field.length<16)return [];
    const job=careerId?this.db.prepare('SELECT * FROM national_management WHERE careerId=?').get(careerId):null;
    return field.map((n,i)=>{
      let players=n.players;const code=nationalIdentity(players[0]?.nationality)!.code;
      if(job?.countryCode===code){const ids:string[]=parse(job.callups);players=ids.map(id=>this.db.prepare('SELECT * FROM players WHERE id=?').get(id));
        if(ids.length!==3||new Set(ids).size!==3||players.some(p=>!p||!eligibleForCountry(p,code)))throw Error('Your national call-ups must contain three different players from '+n.name+'. Review your national squad.');}
      return {id:'nation:'+n.name,name:n.name,code,players:players.map(p=>({id:p.id,gamertag:p.gamertag,nationality:p.nationality})),seed:i+1,group:Math.floor(i/2)%2===0?(i%2===0?'A':'B'):(i%2===0?'B':'A')};
    });
  }
  private match(home:string,away:string,date:string,stage:string,groupName?:string):Match{
    return {id:uuid(),homeTeamId:home,awayTeamId:away,scheduledDate:date,stage,groupName,seriesFormat:stage==='groups'?'BO2':'BO7',status:'scheduled'};
  }
  private schedule(state:NationalState,start:string){
    for(const name of ['A','B']){
      let ids=state.entrants.filter(n=>n.group===name).map(n=>n.id);
      for(let round=0;round<7;round++){
        for(let i=0;i<4;i++){
          state.matches.push(this.match(ids[i],ids[7-i],start,'groups',name));
          state.matches.push(this.match(ids[7-i],ids[i],addDays(start,1),'groups',name));
        }
        ids=[ids[0],ids[7],...ids.slice(1,7)];
      }
    }
  }
  standings(state:NationalState){
    return ['A','B'].map(name=>{
      const matches=state.matches.filter(m=>m.stage==='groups'&&m.groupName===name&&m.status==='completed');
      const rows=state.entrants.filter(n=>n.group===name).map(n=>({...n,teamId:n.id,teamName:n.name,played:0,wins:0,draws:0,losses:0,points:0,goalsFor:0,goalDiff:0}));
      for(const m of matches)for(const r of rows){
        if(r.id!==m.homeTeamId&&r.id!==m.awayTeamId)continue;
        const home=r.id===m.homeTeamId,a=home?m.homeScore!:m.awayScore!,b=home?m.awayScore!:m.homeScore!;
        r.played++;r.wins+=Number(a>b);r.draws+=Number(a===b);r.losses+=Number(a<b);r.points+=a>b?3:a===b?1:0;
        for(const g of m.games||[]){const blue=r.id===(g.blueTeamId||m.homeTeamId),own=blue?g.blueScore:g.orangeScore,against=blue?g.orangeScore:g.blueScore;r.goalsFor+=own;r.goalDiff+=own-against;}
      }
      const tie=(r:typeof rows[number])=>{
        const tied=rows.filter(t=>t.points===r.points).map(t=>t.id);let diff=0,goals=0;
        for(const m of matches)if(tied.includes(m.homeTeamId)&&tied.includes(m.awayTeamId)&&[m.homeTeamId,m.awayTeamId].includes(r.id))
          for(const g of m.games||[]){const blue=r.id===(g.blueTeamId||m.homeTeamId),a=blue?g.blueScore:g.orangeScore,b=blue?g.orangeScore:g.blueScore;diff+=a-b;goals+=a;}
        return [diff,goals,r.goalDiff,r.goalsFor,-r.seed];
      };
      rows.sort((a,b)=>{if(a.points!==b.points)return b.points-a.points;const x=tie(a),y=tie(b);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return y[i]-x[i];return 0;});
      return {name,standings:rows};
    });
  }
  progress(careerId:string,date:string,random:()=>number=Math.random){
    for(const comp of this.db.prepare("SELECT c.*,cc.startDate FROM competitions c JOIN career_competitions cc ON cc.competitionId=c.id WHERE cc.careerId=? AND c.type='FIFAE' AND c.status NOT IN ('completed','cancelled') AND cc.startDate<=?").all(careerId,date)){
      const config=parse(comp.config),state:NationalState=config.national;
      if(state.phase==='selection'){
        state.entrants=this.select(careerId);
        if(state.entrants.length!==16){config.fieldPendingReason='Sixteen national squads with three players of known, unambiguous nationality are required. No nationality or player will be invented.';this.save(comp.id,config);continue;}
        delete config.fieldPendingReason;this.schedule(state,comp.startDate);state.phase='groups';
        const job=this.db.prepare('SELECT nationId FROM national_management WHERE careerId=?').get(careerId);if(job)config.managedNationId=job.nationId;
      }
      for(let wave=0;wave<4;wave++){
        for(const m of state.matches.filter(m=>m.status==='scheduled'&&m.scheduledDate<=date)){
          const managed=this.db.prepare('SELECT nationId FROM national_management WHERE careerId=?').get(careerId)?.nationId;
          if(managed&&[m.homeTeamId,m.awayTeamId].includes(managed))continue;
          const side=(id:string)=>{const nation=state.entrants.find(n=>n.id===id)!;return {...nation,players:nation.players.map(p=>this.db.prepare('SELECT * FROM players WHERE id=?').get(p.id))};};
          const home=side(m.homeTeamId),away=side(m.awayTeamId);
          if(m.seriesFormat==='BO2'){
            const games=[simulateGame(home,away,{}, {},random),simulateGame(home,away,{}, {},random)];
            m.homeScore=games.filter(g=>g.blueScore>g.orangeScore).length;m.awayScore=2-m.homeScore;m.games=games;
          }else{const result=simulateSeries(home,away,'BO7',{},random);m.homeScore=result.homeWins;m.awayScore=result.awayWins;m.games=result.games;}
          m.status='completed';
        }
        if(state.matches.some(m=>m.status!=='completed'))break;
        const winners=(stage:string)=>state.matches.filter(m=>m.stage===stage).map(m=>m.homeScore!>m.awayScore!?m.homeTeamId:m.awayTeamId);
        if(state.phase==='groups'){
          const [a,b]=this.standings(state).map(g=>g.standings.slice(0,4));
          // Opposite groups; A1/B2 and B1/A2 remain in opposite halves.
          [[a[0],b[3]],[b[1],a[2]],[b[0],a[3]],[a[1],b[2]]].forEach(([h,a])=>state.matches.push(this.match(h.id,a.id,addDays(comp.startDate,2),'quarterfinals')));state.phase='quarterfinals';
        }else if(state.phase==='quarterfinals'){
          const w=winners('quarterfinals');for(let i=0;i<4;i+=2)state.matches.push(this.match(w[i],w[i+1],addDays(comp.startDate,3),'semifinals'));state.phase='semifinals';
        }else if(state.phase==='semifinals'){
          const w=winners('semifinals');state.matches.push(this.match(w[0],w[1],addDays(comp.startDate,3),'final'));state.phase='final';
        }else if(state.phase==='final'){
          state.championId=winners('final')[0];state.completedDate=state.matches.find(m=>m.stage==='final')!.scheduledDate;state.phase='completed';
          const nation=state.entrants.find(n=>n.id===state.championId)!;
          for(const p of nation.players)this.db.prepare('INSERT OR IGNORE INTO career_player_awards(careerId,competitionId,playerId,teamId,title,earnedDate,year,source) VALUES (?,?,?,?,?,?,?,?)').run(careerId,comp.id,p.id,nation.id,null,state.completedDate,Number(state.completedDate.slice(0,4)),FIFAE_RULES);
          this.db.prepare("UPDATE competitions SET status='completed' WHERE id=?").run(comp.id);
          new TrophyCeremonies(this.db).record(careerId,comp,nation.id,state.completedDate,nation.name);break;
        }
      }
      this.save(comp.id,config);
    }
  }
  private save(id:string,config:any){this.db.prepare('UPDATE competitions SET config=? WHERE id=?').run(JSON.stringify(config),id);}
  fixtures(careerId:string){
    return this.db.prepare("SELECT c.*,cc.startDate FROM competitions c JOIN career_competitions cc ON cc.competitionId=c.id WHERE cc.careerId=? AND c.type='FIFAE' AND cc.stage<>'ARCHIVED' AND c.status<>'cancelled'").all(careerId).flatMap(comp=>{
      const state:NationalState=parse(comp.config).national;return state.matches.map(m=>({...m,competitionId:comp.id,competitionName:comp.name,homeTeamName:state.entrants.find(n=>n.id===m.homeTeamId)?.name,awayTeamName:state.entrants.find(n=>n.id===m.awayTeamId)?.name,isNational:true}));
    });
  }
  due(careerId:string,date:string){const job=this.db.prepare('SELECT nationId FROM national_management WHERE careerId=?').get(careerId);return job?this.fixtures(careerId).filter(m=>[m.homeTeamId,m.awayTeamId].includes(job.nationId)&&m.status!=='completed'&&m.scheduledDate<=date).sort((a,b)=>a.scheduledDate.localeCompare(b.scheduledDate))[0]||null:null;}
  details(comp:any,careerId?:string){const config=parse(comp.config),national:NationalState=config.national,managed=careerId?this.db.prepare('SELECT nationId FROM national_management WHERE careerId=?').get(careerId)?.nationId:null;return {...comp,config,national:{...national,managedNationId:managed,groups:this.standings(national)},entries:national.entrants.map(n=>({teamId:n.id,teamName:n.name,seed:n.seed})),fixtures:national.matches.map(m=>({...m,homeTeamName:national.entrants.find(n=>n.id===m.homeTeamId)?.name,awayTeamName:national.entrants.find(n=>n.id===m.awayTeamId)?.name})),entered:!!managed&&national.entrants.some(n=>n.id===managed)};}
}
