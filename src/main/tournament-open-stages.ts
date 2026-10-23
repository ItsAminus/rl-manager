import type {AppDatabase} from './database';
import type {Tournament} from './tournament';
import {addDays} from '../game/career-rules';
import {swissPairings} from '../game/official-competition-rules';
import {ClubTournamentStages} from './club-tournament-stages';
const parse=(s:string)=>{try{return JSON.parse(s||'{}');}catch{return {};}};
const unique=(a:string[])=>[...new Set(a)].filter(x=>x&&x!=='__bye__');
const orderedSeeds=(size:number):number[]=>size===1?[1]:orderedSeeds(size/2).flatMap(s=>[s,size+1-s]);

// Saved stage state, native fixture results and explicit bracket dependencies.
// Advancing never fabricates a result or silently simulates the manager's match.
export class OpenStages {
  constructor(private db:AppDatabase,private tournament:Tournament){}
  private save(id:string,config:any,phase?:string){
    this.db.prepare('UPDATE tournament_state SET config=? WHERE competitionId=?').run(JSON.stringify(config),id);
    if(phase)this.db.prepare('UPDATE tournament_state SET phase=? WHERE competitionId=?').run(phase,id);
  }
  prepare(id:string,teams:string[],start:string,config:any){
    if(new Set(teams).size!==teams.length)throw new Error('Duplicate tournament entrant');
    config={...config,entrants:teams,nodeFormats:{},nodeStages:{},nodeGroups:{},nodeDates:{},placements:{}};
    this.db.prepare('INSERT OR REPLACE INTO tournament_state(competitionId,phase,drawDate,startDate,config) VALUES (?,?,?,?,?)')
      .run(id,'registration',addDays(start,-2),start,JSON.stringify(config));
    if(config.kind==='REGIONAL')this.swiss(id,teams,start,config);
    else if(config.kind==='CLUB_FINALE')this.swiss(id,teams,start,config);
    else if(config.kind==='INVITATIONAL')this.ewc(id,teams,start,config);
    else if(config.kind==='TIEBREAKER')this.tie(id,teams,start,config);
  }
  private node(id:string,key:string,lane:string,round:number,label:string,home:string,away:string,config:any,stage:string,format:string,date:string,group?:string){
    this.tournament.node(id,key,lane,round,label,home,away);
    config.nodeStages[key]=stage;config.nodeFormats[key]=format;config.nodeDates[key]=date;if(group)config.nodeGroups[key]=group;
  }
  private finish(id:string,teams:string[],config:any){
    this.save(id,config,'completed');
    this.db.prepare('INSERT OR REPLACE INTO qualification_results VALUES (?,?)').run(id,JSON.stringify(unique(teams)));
    if(teams.length===1)this.db.prepare('UPDATE tournament_state SET championId=? WHERE competitionId=?').run(teams[0],id);
  }
  private doubleElimination(id:string,teams:string[],date:string,config:any,target:number,prefix='DE'){
    if(teams.length<=target){config.endpoints=teams.map(t=>'team:'+t);this.save(id,config,'double_elimination');return;}
    let size=1;while(size<teams.length)size*=2;
    let upper=orderedSeeds(size).map(s=>teams[s-1]?'team:'+teams[s-1]:'bye:'),lower:string[]=[],round=0,lowerRound=0;
    const upperTarget=target===1?1:2**Math.ceil(Math.log2(target/2));
    const lowerTarget=target===1?1:target-upperTarget;
    const addRound=(sources:string[],lane:string,r:number,losses=0)=>{
      const next:string[]=[],lost:string[]=[];
      for(let i=0;i<sources.length;i+=2){
        const key=prefix+(lane==='Upper'?'U':'L')+r+'_'+(i/2+1);
      const activeEstimate=Math.min(teams.length,lane==='Upper'?sources.length+lower.length:sources.length+upper.length);
        const format=config.kind==='EWC_LCQ'?'BO5':activeEstimate>192?'BO3':'BO5';
        this.node(id,key,(config.poolPhase?'Pool '+prefix.slice(1)+' ':'Qualifier ')+lane.toLowerCase(),r,`${lane} round ${r} · match ${i/2+1}`,sources[i],sources[i+1],config,config.poolPhase?'ewc_pools':'double_elimination',format,date);
        next.push('win:'+key);lost.push('lose:'+key);
        if(losses)config.eliminationNodes=[...(config.eliminationNodes||[]),key];
      }return {next,lost};
    };
    while(upper.length>upperTarget){
      const result=addRound(upper,'Upper',++round);upper=result.next;
      if(!lower.length){lower=result.lost.length===1?result.lost:addRound(result.lost,'Lower',++lowerRound,1).next;}
      else{
        if(lower.length>result.lost.length)lower=addRound(lower,'Lower',++lowerRound,1).next;
        const injected=lower.flatMap((s,i)=>[s,result.lost[result.lost.length-1-i]]);
        lower=addRound(injected,'Lower',++lowerRound,1).next;
      }
    }
    while(lower.length>lowerTarget)lower=addRound(lower,'Lower',++lowerRound,1).next;
    config.endpoints=[...upper,...lower];config.upperEndpoints=upper;config.lowerEndpoints=lower;
    this.save(id,config,'double_elimination');this.tournament.materialize(id,date,'double_elimination');
  }
  private stageTeams(id:string,stage:string,groups:string[][]){
    groups.forEach((teams,i)=>teams.forEach((teamId,seed)=>this.db.prepare('INSERT OR REPLACE INTO tournament_stage_teams VALUES (?,?,?,?,?)')
      .run(id,stage,teamId,String.fromCharCode(65+i),seed+1)));
  }
  standings(id:string,stage?:string){
    const teams=this.db.prepare('SELECT st.*,t.name AS teamName FROM tournament_stage_teams st JOIN teams t ON t.id=st.teamId WHERE competitionId=? ORDER BY stage,groupName,seed').all(id).filter(t=>!stage||t.stage===stage);
    const fixtures=this.db.prepare("SELECT f.*,s.stage,s.groupName FROM fixtures f JOIN fixture_stages s ON s.fixtureId=f.id WHERE s.competitionId=? AND f.status='completed'").all(id);
    const rows=teams.map(t=>({...t,wins:0,losses:0,gamesWon:0,gamesLost:0,opponents:[] as string[],buchholz:0}));
    for(const r of rows)for(const f of fixtures)if(f.stage===r.stage&&[f.homeTeamId,f.awayTeamId].includes(r.teamId)){
      const home=f.homeTeamId===r.teamId,a=home?f.homeScore:f.awayScore,b=home?f.awayScore:f.homeScore;
      r.wins+=Number(a>b);r.losses+=Number(a<b);r.gamesWon+=a;r.gamesLost+=b;r.opponents.push(home?f.awayTeamId:f.homeTeamId);
    }
    for(const r of rows){r.buchholz=r.opponents.reduce((sum:number,id:string)=>sum+(rows.find(p=>p.stage===r.stage&&p.teamId===id)?.wins||0),0);}
    const club=parse(this.db.prepare('SELECT config FROM tournament_state WHERE competitionId=?').get(id)?.config).clubRules;
    return rows.sort((a,b)=>a.stage.localeCompare(b.stage)||a.groupName.localeCompare(b.groupName)||b.wins-a.wins||a.losses-b.losses||(club?(b.gamesWon-b.gamesLost)-(a.gamesWon-a.gamesLost):0)||b.buchholz-a.buchholz||a.seed-b.seed);
  }
  private swiss(id:string,teams:string[],date:string,config:any){
    if(config.clubRules)config.swissSeeds=[...teams];
    if(config.kind==='CLUB_FINALE'){
      if(teams.length!==16)throw Error('The Club Finale requires exactly sixteen qualified teams.');
      this.stageTeams(id,'swiss',[teams]);config.swissRound=0;this.save(id,config,'swiss');this.swissRound(id,date,config);return;
    }
    if(teams.length<32){
      // Real-only worlds may not contain 32 eligible squads in every region.
      // Keep the short field visible; do not create fictional entrants.
      config.fieldAdjustment=`Only ${teams.length} confirmed entrants; Swiss field is below the official 32-team capacity.`;
      if(teams.length>16)this.doubleElimination(id,teams,date,config,16,'SF');
      else if(teams.length===16)this.gsl(id,teams,date,config);
      else this.reducedFinal(id,teams,date,config);
      return;
    }
    const groups=[[],[]] as string[][];
    teams.slice(0,32).forEach((t,i)=>groups[Math.floor(i/2)%2===0?i%2:1-i%2].push(t));
    this.stageTeams(id,'swiss',groups);config.swissRound=0;this.save(id,config,'swiss');this.swissRound(id,date,config);
  }
  private reducedFinal(id:string,teams:string[],date:string,config:any){
    if(teams.length<2){this.finish(id,teams,config);return;}
    config.fieldAdjustment=`Only ${teams.length} confirmed entrants. This reduced field uses a seeded BO7 knockout; it cannot reproduce the official full-field format.`;
    let size=1;while(size<teams.length)size*=2;
    let sources=orderedSeeds(size).map(s=>teams[s-1]?'team:'+teams[s-1]:'bye:'),round=0;
    while(sources.length>1){
      const next:string[]=[];round++;
      for(let i=0;i<sources.length;i+=2){const key=sources.length===2?'F':'RF'+round+'_'+i;
        this.node(id,key,sources.length===2?'Grand Final':'Reduced field',round,sources.length===2?'Grand Final':'Reduced-field knockout',sources[i],sources[i+1],config,'playoffs','BO7',date);
        next.push('win:'+key);
      }sources=next;
    }this.save(id,config,'playoffs');this.tournament.materialize(id,date);
  }
  private swissRound(id:string,date:string,config:any){
    const round=++config.swissRound;
    if(config.kind==='CLUB_FINALE'){const scheduled=addDays(config.eventStart,Math.floor((round-1)/2));if(scheduled>date)date=scheduled;}
    for(const group of ['A','B']){
      const rows=this.standings(id,'swiss').filter(r=>r.groupName===group);
      for(const [a,b] of swissPairings(rows))this.tournament.fixture(id,a,b,date,round,'BO5','swiss',group);
    }this.save(id,config,'swiss');
  }
  private gslBracket(id:string,teams:string[],date:string,config:any,prefix:string,stage:string,group:string){
    const at=(n:number)=>teams[n]?'team:'+teams[n]:'bye:';
    const elimination=config.kind==='INVITATIONAL'?'BO7':'BO5';
    const later=(days:number)=>config.kind==='INVITATIONAL'?addDays(date,days):date;
    for(const [i,a] of [0,3,1,2].entries())this.node(id,prefix+'O'+(i+1),'GSL '+group+' upper',10,'Group '+group+' opening '+(i+1),at(a),at(7-a),config,stage,'BO5',date,group);
    for(let i=0;i<2;i++){
      this.node(id,prefix+'W'+(i+1),'GSL '+group+' upper',11,'Group '+group+' winners '+(i+1),'win:'+prefix+'O'+(2*i+1),'win:'+prefix+'O'+(2*i+2),config,stage,'BO5',later(1),group);
      this.node(id,prefix+'L'+(i+1),'GSL '+group+' lower',11,'Group '+group+' elimination '+(i+1),'lose:'+prefix+'O'+(2*i+1),'lose:'+prefix+'O'+(2*i+2),config,stage,elimination,later(1),group);
      this.node(id,prefix+'D'+(i+1),'GSL '+group+' lower',12,'Group '+group+' decider '+(i+1),'win:'+prefix+'L'+(i+1),'lose:'+prefix+'W'+(2-i),config,stage,elimination,later(2),group);
    }
    return [prefix+'W1',prefix+'W2',prefix+'D1',prefix+'D2'];
  }
  private gsl(id:string,teams:string[],date:string,config:any){
    const groups=[[],[]] as string[][];
    teams.forEach((t,i)=>groups[config.swissRound?(Math.floor(i/2)%2===0?i%2:1-i%2):i%2].push(t));this.stageTeams(id,'gsl',groups);
    config.gslEndpoints=groups.map((g,i)=>this.gslBracket(id,g,date,config,'G'+String.fromCharCode(65+i),'gsl',String.fromCharCode(65+i)));
    this.save(id,config,'gsl');this.tournament.materialize(id,date,'gsl');
  }
  private ewc(id:string,teams:string[],date:string,config:any){
    if(teams.length!==16)throw new Error('EWC needs 16 qualified teams');
    const pools=config.drawPools||[teams.slice(0,2),teams.slice(2,4),teams.slice(4,12),teams.slice(12,16)];
    let groups=[[],[]] as string[][],valid=false;
    const region=(t:string)=>this.db.prepare('SELECT region FROM teams WHERE id=?').get(t)?.region;
    for(let attempt=0;attempt<1000&&!valid;attempt++){
      groups=[[],[]];for(const pool of pools){const shuffled=[...pool];for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}shuffled.forEach((t:string,i:number)=>groups[i%2].push(t));}
      valid=groups.every(g=>g.every(t=>g.filter(p=>region(p)===region(t)).length<=4));
    }
    if(!valid)throw new Error('EWC draw cannot satisfy its regional limit');
    this.stageTeams(id,'gsl',groups);config.gslEndpoints=groups.map((g,i)=>this.gslBracket(id,g,date,config,'G'+String.fromCharCode(65+i),'gsl',String.fromCharCode(65+i)));
    this.save(id,config,'gsl');this.tournament.materialize(id,date,'gsl');
  }
  private ewcPools(id:string,teams:string[],date:string,config:any){
    const groups=[[],[],[],[]] as string[][];
    teams.slice(0,32).forEach((t,i)=>groups[Math.floor(i/4)%2?3-i%4:i%4].push(t));
    this.stageTeams(id,'ewc_pools',groups);config.poolPhase=true;
    config.poolEndpoints=groups.map((g,i)=>{this.doubleElimination(id,g,date,config,4,'P'+String.fromCharCode(65+i));return [...config.endpoints];});
    this.save(id,config,'ewc_pools');
  }
  private tie(id:string,teams:string[],date:string,config:any){
    const n=teams.length,k=config.spots,at=(i:number)=>'team:'+teams[i-1];
    if(k<1||k>=n)throw new Error('Invalid qualification tiebreaker');
    const definitions:Record<string,[string,string][]>={
      '2:1':[[at(1),at(2)]], '3:1':[[at(2),at(3)],[at(1),'win:T1']],
      '3:2':[[at(1),at(2)],[at(3),'lose:T1']],
      '4:1':[[at(1),at(4)],[at(2),at(3)],['win:T1','win:T2']],
      '4:2':[[at(1),at(4)],[at(2),at(3)]], '4:3':[[at(1),at(4)],[at(2),at(3)],['lose:T1','lose:T2']],
      '5:1':[[at(4),at(5)],[at(2),at(3)],[at(1),'win:T1'],['win:T2','win:T3']],
      '5:2':[[at(4),at(5)],[at(2),at(3)],[at(1),'win:T1']],
      '5:3':[[at(4),at(5)],[at(2),at(3)],[at(1),'win:T1'],['lose:T2','lose:T3']],
      '5:4':[[at(1),at(2)],[at(3),'lose:T1'],[at(4),'lose:T2'],[at(5),'lose:T3']],
      '6:1':[[at(4),at(5)],[at(3),at(6)],[at(1),'win:T1'],[at(2),'win:T2'],['win:T3','win:T4']],
      '6:2':[[at(4),at(5)],[at(3),at(6)],[at(1),'win:T1'],[at(2),'win:T2']],
      '6:3':[[at(4),at(5)],[at(3),at(6)],[at(1),'win:T1'],[at(2),'win:T2'],['lose:T3','lose:T4']],
      '6:4':[[at(1),at(4)],[at(2),at(3)],[at(6),'lose:T1'],[at(5),'lose:T2']],
      '6:5':[[at(1),at(4)],[at(2),at(3)],[at(6),'lose:T1'],[at(5),'lose:T2'],['lose:T3','lose:T4']],
    };
    const sources:Record<string,string[]>={'2:1':['T1'],'3:1':['T2'],'3:2':['T1','T2'],'4:1':['T3'],'4:2':['T1','T2'],'4:3':['T1','T2','T3'],
      '5:1':['T4'],'5:2':['T2','T3'],'5:3':['T2','T3','T4'],'5:4':['T1','T2','T3','T4'],'6:1':['T5'],'6:2':['T3','T4'],'6:3':['T3','T4','T5'],'6:4':['T1','T2','T3','T4'],'6:5':['T1','T2','T3','T4','T5']};
    const key=n+':'+k;
    if(!definitions[key]){
      // Attachment E expressly delegates unlisted ties to the administrator.
      // Keep the choice saved and visible, with higher-seed byes and BO7 games.
      config.adminFormat='This tie is outside the published 2–6-team table. The career organiser uses seeded single elimination with higher-seed byes.';
      let remaining=teams.map(t=>'team:'+t),round=0,index=0;
      while(remaining.length>k){
        const target=Math.max(k,2**Math.floor(Math.log2(remaining.length-1))),byes=2*target-remaining.length;
        const next=remaining.slice(0,byes),playing=remaining.slice(byes);round++;
        for(let i=0;i<playing.length/2;i++){
          const name='TA'+(++index);this.node(id,name,'Qualification tiebreaker',round,'Qualification match '+index,playing[i],playing[playing.length-1-i],config,'tiebreaker','BO7',date);next.push('win:'+name);
        }remaining=next;
      }config.endpoints=remaining;this.save(id,config,'tiebreaker');this.tournament.materialize(id,date,'tiebreaker');return;
    }
    definitions[key].forEach(([a,b],i)=>this.node(id,'T'+(i+1),'Qualification tiebreaker',i+1,'Qualification match '+(i+1),a,b,config,'tiebreaker','BO7',date));
    config.endpoints=sources[key].map(s=>'win:'+s);this.save(id,config,'tiebreaker');this.tournament.materialize(id,date,'tiebreaker');
  }
  progress(id:string,date:string,state:any):boolean{
    const config=parse(state.config);
    if(state.phase==='registration'){
      if(date<state.startDate)return true;
      const teams=this.db.prepare('SELECT teamId FROM competition_entries WHERE competitionId=? ORDER BY seed').all(id).map(t=>t.teamId);
      config.directTeams=teams.slice(0,config.directSwiss||0);
      if(config.kind==='EWC_LCQ'){this.ewcPools(id,teams,date,config);return true;}
      this.doubleElimination(id,teams.slice(config.directSwiss||0),date,config,config.kind==='EWC_LCQ'?1:config.qualifierPlaces||32);return true;
    }
    if(state.phase==='ewc_pools'){
      this.tournament.materialize(id,date,'ewc_pools');
      const outcomes=config.poolEndpoints.map((g:string[])=>g.map(s=>this.tournament.resolve(id,s)));
      if(outcomes.flat().some((s:string|null)=>s===null))return true;
      const teams=unique(outcomes.flat());config.poolPhase=false;
      this.doubleElimination(id,teams,addDays(date,1),config,1,'EP');return true;
    }
    if(state.phase==='double_elimination'||state.phase==='tiebreaker'){
      this.tournament.materialize(id,date,state.phase);
      const resolved=(config.endpoints||[]).map((s:string)=>this.tournament.resolve(id,s));
      if(resolved.some((s:string|null)=>s===null))return true;
      const teams=unique(resolved),seeds:string[]=config.entrants||[];
      const upper=config.clubRules?(config.upperEndpoints||[]).map((s:string)=>this.tournament.resolve(id,s)):[];
      teams.sort((a,b)=>(config.clubRules?Number(!upper.includes(a))-Number(!upper.includes(b)):0)||seeds.indexOf(a)-seeds.indexOf(b));
      if(state.phase==='tiebreaker'||config.kind==='QUALIFIER'){this.finish(id,[...(config.directTeams||[]),...teams],config);return true;}
      if(config.kind==='EWC_LCQ'){
        if(!config.grandFinal){
          this.node(id,'GF','Grand Final',90,'Grand Final',config.upperEndpoints[0],config.lowerEndpoints[0],config,'double_elimination','BO7',date);
          config.grandFinal=true;config.endpoints=['win:GF'];this.save(id,config);this.tournament.materialize(id,date);return true;
        }
        const gf=this.db.prepare('SELECT f.* FROM tournament_nodes n JOIN fixtures f ON f.id=n.fixtureId WHERE n.id=?').get(id+':GF');
        if(gf.homeScore<gf.awayScore&&!config.reset){
          this.node(id,'F','Grand Final',91,'Grand Final reset','win:GF','lose:GF',config,'double_elimination','BO7',date);
          config.reset=true;config.endpoints=['win:F'];this.save(id,config);this.tournament.materialize(id,date);return true;
        }this.finish(id,teams,config);return true;
      }
      this.swiss(id,teams,config.schedule?.swiss>date?config.schedule.swiss:date,config);return true;
    }
    if(state.phase==='swiss'){
      const pending=this.db.prepare("SELECT f.id FROM fixtures f JOIN fixture_stages s ON s.fixtureId=f.id WHERE s.competitionId=? AND s.stage='swiss' AND f.status<>'completed' LIMIT 1").get(id);if(pending)return true;
      const rows=this.standings(id,'swiss');
      if(rows.some(r=>r.wins<3&&r.losses<3)){this.swissRound(id,date,config);return true;}
      if(config.kind==='CLUB_FINALE'){
        rows.filter(r=>r.losses===3).forEach(r=>config.placements[r.teamId]=r.wins===2?9:r.wins===1?12:15);
        new ClubTournamentStages(this.db,this.tournament).hybrid(id,rows.filter(r=>r.wins===3).map(r=>r.teamId),config.eventStart>date?addDays(config.eventStart,3):[addDays(config.eventStart,3),date].sort().pop()!,config);return true;
      }
      const a=rows.filter(r=>r.groupName==='A'&&r.wins===3),b=rows.filter(r=>r.groupName==='B'&&r.wins===3),teams:string[]=[];
      for(let i=0;i<8;i++){if(a[i])teams.push(a[i].teamId);if(b[i])teams.push(b[i].teamId);}
      rows.filter(r=>r.losses===3).forEach(r=>config.placements[r.teamId]=config.clubRules?(r.wins===2?17:r.wins===1?23:29):17);
      this.gsl(id,teams,config.schedule?.gsl>date?config.schedule.gsl:date,config);return true;
    }
    if(state.phase==='gsl'){
      this.tournament.materialize(id,date,'gsl');
      const outcomes=config.gslEndpoints.map((group:string[])=>group.map(s=>this.tournament.resolve(id,'win:'+s)));
      if(outcomes.flat().some((s:string|null)=>s===null))return true;
      const records=this.standings(id,'gsl');
      for(const group of outcomes){group.splice(0,2,...group.slice(0,2).sort((a:string,b:string)=>(records.find(r=>r.teamId===a)?.seed||99)-(records.find(r=>r.teamId===b)?.seed||99)));
        group.splice(2,2,...group.slice(2).sort((a:string,b:string)=>(records.find(r=>r.teamId===a)?.seed||99)-(records.find(r=>r.teamId===b)?.seed||99)));}
      for(const r of records)if(r.losses===2)config.placements[r.teamId]=r.wins?9:13;
      if(config.kind==='CLUB_OPEN'){
        new ClubTournamentStages(this.db,this.tournament).hybrid(id,unique([0,1,2,3].flatMap(i=>outcomes.map((g:string[])=>g[i]))),config.schedule?.playoffs>date?config.schedule.playoffs:date,config,config.clubAdvanceSpots||1);return true;
      }
      if(config.kind==='INVITATIONAL'){
        const [a,b]=outcomes;
        const lowerA=[...a.slice(2)].sort(()=>Math.random()-.5),lowerB=[...b.slice(2)].sort(()=>Math.random()-.5);
        [[a[0],lowerB[0]],[b[0],lowerA[0]],[a[1],lowerB[1]],[b[1],lowerA[1]]].forEach(([h,v],i)=>this.node(id,'Q'+(i+1),'Quarterfinals',20,'Quarterfinal '+(i+1),'team:'+h,'team:'+v,config,'playoffs','BO7',addDays(date,1)));
        this.node(id,'S1','Final Four',21,'Semifinal 1','win:Q1','win:Q2',config,'playoffs','BO7',addDays(date,2));
        this.node(id,'S2','Final Four',21,'Semifinal 2','win:Q3','win:Q4',config,'playoffs','BO7',addDays(date,2));
        this.node(id,'P3','Third place',22,'Third-place match','lose:S1','lose:S2',config,'playoffs','BO5',addDays(date,2));
        this.node(id,'F','Grand Final',22,'Grand Final','win:S1','win:S2',config,'playoffs','BO7',addDays(date,2));
        this.save(id,config,'playoffs');this.tournament.materialize(id,date);
      }else{
        config.playoffSeeds=unique([0,1,2,3].flatMap(i=>outcomes.map((g:string[])=>g[i])));
        this.save(id,config);this.tournament.playoffs(id,date,{...state,config:JSON.stringify(config)});
      }return true;
    }
    if(state.phase==='playoffs'&&config.kind==='INVITATIONAL'){
      this.tournament.materialize(id,date);const winner=this.tournament.resolve(id,'win:F'),third=this.tournament.resolve(id,'win:P3');
      if(winner&&third){config.placements[third]=3;config.placements[this.tournament.resolve(id,'lose:P3')!]=4;this.finish(id,[winner],config);}return true;
    }
    return false;
  }
}
