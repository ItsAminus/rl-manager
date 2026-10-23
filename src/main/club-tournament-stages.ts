import type {AppDatabase} from './database';
import type {Tournament} from './tournament';
import {addDays} from '../game/career-rules';
const parse=(s:string)=>JSON.parse(s||'{}');
const seedOrder=(n:number):number[]=>n===1?[1]:seedOrder(n/2).flatMap(s=>[s,n+1-s]);

/** Club-specific LAN brackets. Every progression edge resolves a saved fixture. */
export class ClubTournamentStages {
  constructor(private db:AppDatabase,private tournament:Tournament){}
  private save(id:string,c:any,phase:string){this.db.prepare('UPDATE tournament_state SET config=?,phase=? WHERE competitionId=?').run(JSON.stringify(c),phase,id);}
  private node(id:string,key:string,lane:string,round:number,home:string,away:string,c:any,stage:string,format:string,date:string){
    this.tournament.node(id,key,lane,round,key==='F'?'Grand Final':key==='RESET'?'Grand Final reset':lane+' · '+key,home,away);
    c.nodeStages[key]=stage;c.nodeFormats[key]=format;c.nodeDates[key]=date;
  }
  prepareKickoff(id:string,teams:string[],start:string,config:any){
    if(teams.length!==24)throw Error('The Club Kick-Off requires exactly 24 entrants.');
    const c={...config,entrants:teams,nodeDates:{},nodeStages:{},nodeFormats:{},placements:{},eliminationNodes:[] as string[]};
    this.db.prepare('INSERT OR REPLACE INTO tournament_state(competitionId,phase,startDate,config) VALUES (?,?,?,?)').run(id,'club_double_elimination',start,JSON.stringify(c));
    let upper=seedOrder(32).map(s=>teams[s-1]?'team:'+teams[s-1]:'bye:'),lower:string[]=[],ur=0,lr=0;
    const round=(sources:string[],up:boolean,n:number)=>{
      const wins:string[]=[],losses:string[]=[];
      for(let i=0;i<sources.length;i+=2){
        const key=(up?'U':'L')+n+'_'+(i/2+1);
        // The book fixes BO5 for upper rounds 1–2; other match lengths are
        // an explicit saved organiser choice until a fuller schedule exists.
        const format=up&&n<=2?'BO5':c.kickoffLaterFormat;
        const day=up?Math.min(3,Math.max(0,n-2)):Math.min(4,Math.floor(n/2));
        this.node(id,key,up?'Upper bracket':'Lower bracket',up?n*2:n+2,sources[i],sources[i+1],c,'club_double_elimination',format,addDays(start,day));
        wins.push('win:'+key);losses.push('lose:'+key);if(!up)c.eliminationNodes.push(key);
      }return {wins,losses};
    };
    while(upper.length>1){
      const r=round(upper,true,++ur);upper=r.wins;
      if(!lower.length)lower=r.losses.length===1?r.losses:round(r.losses,false,++lr).wins;
      else{if(lower.length>r.losses.length)lower=round(lower,false,++lr).wins;lower=round(lower.flatMap((s,i)=>[s,r.losses[r.losses.length-1-i]]),false,++lr).wins;}
    }
    while(lower.length>1)lower=round(lower,false,++lr).wins;
    this.node(id,'F','Grand Final',20,upper[0],lower[0],c,'club_double_elimination',c.kickoffLaterFormat,addDays(start,4));
    this.save(id,c,'club_double_elimination');this.tournament.materialize(id,start,'club_double_elimination');
  }
  hybrid(id:string,teams:string[],date:string,c:any,spots=1){
    if(teams.length!==8||spots<1||spots>8)throw Error('Club hybrid playoffs require eight teams and 1–8 advancing places.');
    const at=(n:number)=>'team:'+teams[n-1];c.playoffSeeds=teams;c.clubAdvanceSpots=spots;
    const node=(key:string,lane:string,round:number,h:string,a:string)=>this.node(id,key,lane,round,h,a,c,'club_hybrid','BO7',c.kind==='CLUB_OPEN'?(round<=2?c.schedule.playoffs:c.schedule.finals):addDays(date,round-1));
    if(spots===8){c.clubEndpoints=teams.map(t=>'team:'+t);this.save(id,c,'club_hybrid');return;}
    node('L1','Lower bracket',1,at(5),at(8));node('L2','Lower bracket',1,at(6),at(7));
    if(spots>=6){c.clubEndpoints=[...teams.slice(0,4).map(t=>'team:'+t),'win:L1','win:L2'];
      if(spots===7){node('T','Qualification tiebreaker',2,'lose:L1','lose:L2');c.clubEndpoints.push('win:T');}
    }else{
      node('U1','Upper bracket',1,at(1),at(4));node('U2','Upper bracket',1,at(2),at(3));
      node('Q1','Lower bracket',2,'win:L1','lose:U1');node('Q2','Lower bracket',2,'win:L2','lose:U2');
      if(spots>=4){c.clubEndpoints=['win:U1','win:U2','win:Q1','win:Q2'];if(spots===5){node('T','Qualification tiebreaker',3,'lose:Q1','lose:Q2');c.clubEndpoints.push('win:T');}}
      else{
        node('S1','Final Four',3,'win:U1','win:Q2');node('S2','Final Four',3,'win:U2','win:Q1');
        c.clubEndpoints=['win:S1','win:S2'];
        if(spots===3){node('T','Qualification tiebreaker',4,'lose:S1','lose:S2');c.clubEndpoints.push('win:T');}
        else if(spots===1){node('F','Grand Final',3,'win:S1','win:S2');c.clubEndpoints=['win:F'];}
      }
    }
    this.save(id,c,'club_hybrid');this.tournament.materialize(id,date,'club_hybrid');
  }
  progress(id:string,date:string,state:any){
    const c=parse(state.config);
    if(state.phase==='club_double_elimination'){
      this.tournament.materialize(id,date,'club_double_elimination');
      const final=this.db.prepare('SELECT f.* FROM tournament_nodes n JOIN fixtures f ON f.id=n.fixtureId WHERE n.id=?').get(id+':F');
      if(!final||final.status!=='completed')return true;
      if(final.homeScore<final.awayScore&&!c.reset){
        this.node(id,'RESET','Grand Final',21,'win:F','lose:F',c,'club_double_elimination',c.kickoffLaterFormat,final.scheduledDate);
        c.reset=true;this.save(id,c,state.phase);this.tournament.materialize(id,date,'club_double_elimination');return true;
      }
      const key=c.reset?'RESET':'F',winner=this.tournament.resolve(id,'win:'+key);if(!winner)return true;
      c.placements[winner]=1;c.placements[this.tournament.resolve(id,'lose:'+key)!]=2;
      // Each second-loss wave is a placement band; byes never eliminate a club.
      const nodes=this.db.prepare(`SELECT n.*,f.status,f.homeScore,f.awayScore FROM tournament_nodes n LEFT JOIN fixtures f ON f.id=n.fixtureId WHERE n.competitionId=? AND n.lane='Lower bracket' ORDER BY n.round,n.id`).all(id);
      const eliminated=nodes.filter(n=>n.status==='completed'),waves=[...new Set(eliminated.map(n=>n.round))].sort((a,b)=>b-a);let next=3;
      for(const r of waves){const cohort=eliminated.filter(n=>n.round===r);for(const n of cohort)c.placements[n.homeScore>n.awayScore?n.awayTeamId:n.homeTeamId]=next;next+=cohort.length;}
      this.finish(id,c,[winner]);return true;
    }
    if(state.phase==='club_hybrid'){
      this.tournament.materialize(id,date,'club_hybrid');
      const qualified=(c.clubEndpoints||[]).map((s:string)=>this.tournament.resolve(id,s));if(qualified.some((s:string|null)=>!s))return true;
      const place=(source:string,n:number)=>{const team=this.tournament.resolve(id,source);if(team)c.placements[team]=n;};
      if(c.clubAdvanceSpots>=6){c.playoffSeeds.slice(0,4).forEach((team:string)=>c.placements[team]=1);place('win:L1',5);place('win:L2',5);}
      else if(c.clubAdvanceSpots>=4){place('win:U1',1);place('win:U2',1);place('win:Q1',3);place('win:Q2',3);}
      else if(c.clubAdvanceSpots>=2){place('win:S1',1);place('win:S2',1);}
      if(c.clubAdvanceSpots===8)c.playoffSeeds.slice(4).forEach((team:string)=>c.placements[team]=5);
      for(const key of ['L1','L2','Q1','Q2','S1','S2']){const loser=this.tournament.resolve(id,'lose:'+key);if(loser)c.placements[loser]=key.startsWith('L')?7:key.startsWith('Q')?5:3;}
      if(c.clubAdvanceSpots===1){c.placements[qualified[0]]=1;c.placements[this.tournament.resolve(id,'lose:F')!]=2;}
      if(c.clubAdvanceSpots%2===1&&c.clubAdvanceSpots>1){const winner=this.tournament.resolve(id,'win:T'),loser=this.tournament.resolve(id,'lose:T');c.placements[winner!]=c.clubAdvanceSpots;c.placements[loser!]=c.clubAdvanceSpots+1;}
      this.finish(id,c,qualified);return true;
    }
    return false;
  }
  private finish(id:string,c:any,qualified:string[]){
    this.save(id,c,'completed');this.db.prepare('INSERT OR REPLACE INTO qualification_results VALUES (?,?)').run(id,JSON.stringify(qualified));
    if(qualified.length===1)this.db.prepare('UPDATE tournament_state SET championId=? WHERE competitionId=?').run(qualified[0],id);
  }
}
