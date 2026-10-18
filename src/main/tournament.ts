import type { AppDatabase } from './database';
import {v4 as uuid} from 'uuid';
import {addDays} from '../game/career-rules';
import {OpenStages} from './tournament-open-stages';
import {seededGroupDraw} from '../game/official-competition-rules';
const parse=(s:string|null)=>{try{return s?JSON.parse(s):{};}catch{return {};}};
const names=['A','B','C','D'];
export const groupSeedBands=[[0,7,8,15],[1,6,9,14],[2,5,10,13],[3,4,11,12]];
export function playoffSeeds(groups:any[],advance:number,kind:string){
  const second=advance===2?['C','D','A','B']:kind==='WORLDS'?['D','C','B','A']:['B','C','A','D'];
  const third=kind==='WORLDS'?['A','B','C','D']:['C','B','D','A'];
  const at=(name:string,position:number)=>groups.find(g=>g.name===name)?.standings[position]?.teamId;
  return [...names.map(n=>at(n,0)),...second.map(n=>at(n,1)),...(advance===3?third.map(n=>at(n,2)):[])].filter(Boolean);
}

export class Tournament {
  constructor(private db:AppDatabase){}
  has(id:string){return !!this.db.prepare('SELECT competitionId FROM tournament_state WHERE competitionId=?').get(id);}
  private drawCalendar(id:string,date:string){
    const owner=this.db.prepare('SELECT careerId FROM career_competitions WHERE competitionId=?').get(id),competition=this.db.prepare('SELECT name FROM competitions WHERE id=?').get(id);
    if(owner&&!this.db.prepare("SELECT id FROM calendar_events WHERE relatedId=? AND type='group_draw'").get(id))this.db.prepare('INSERT INTO calendar_events(id,careerId,date,type,title,description,relatedId) VALUES (?,?,?,?,?,?,?)').run(uuid(),owner.careerId,date,'group_draw',competition.name+' — Group draw','Four seeded groups of four. Each team faces its three group opponents once.',id);
  }
  prepare(id:string,teams:string[],start:string,config:any){
    config={...config,eventStart:config.eventStart||start};
    if(config.rulesVersion&&['QUALIFIER','REGIONAL','LCQ','INVITATIONAL','EWC_LCQ','TIEBREAKER'].includes(config.kind)){
      new OpenStages(this.db,this).prepare(id,teams,start,config);return;
    }
    if(config.kind==='KICKOFF'&&teams.length===8){
      this.db.prepare('INSERT OR REPLACE INTO tournament_state(competitionId,phase,drawDate,startDate,config) VALUES (?,?,?,?,?)').run(id,'playoffs',start,start,JSON.stringify(config));
      const t=(i:number)=>'team:'+teams[i-1];
      this.node(id,'K1','Opening round',1,'Opening round 1',t(7),t(6));
      this.node(id,'K2','Opening round',1,'Opening round 2',t(8),t(5));
      this.node(id,'Q1','Quarterfinals',2,'Quarterfinal 1',t(3),'win:K1');
      this.node(id,'Q2','Quarterfinals',2,'Quarterfinal 2',t(4),'win:K2');
      this.node(id,'S1','Final Four',3,'Semifinal 1',t(2),'win:Q1');
      this.node(id,'S2','Final Four',3,'Semifinal 2',t(1),'win:Q2');
      this.node(id,'F','Grand Final',4,'Grand Final','win:S1','win:S2');
      if(config.rulesVersion){config.nodeDates={};for(const key of ['K1','K2','Q1','Q2','S1','S2','F'])config.nodeDates[key]=start;
        this.db.prepare('UPDATE tournament_state SET config=? WHERE competitionId=?').run(JSON.stringify(config),id);}
      this.materialize(id,start);return;
    }
    if(teams.length!==16&&!(config.kind==='WORLDS'&&teams.length===20))throw new Error('This tournament requires 16 group entrants (20 with Worlds play-ins).');
    this.db.prepare('INSERT OR REPLACE INTO tournament_state(competitionId,phase,drawDate,startDate,config) VALUES (?,?,?,?,?)')
      .run(id,teams.length===20?'play_in':'awaiting_draw',addDays(start,-2),start,JSON.stringify(config));
    if(teams.length===16)this.drawCalendar(id,addDays(start,-2));
    if(teams.length===20)this.playIn(id,teams,start);
  }
  fixture(id:string,home:string,away:string,date:string,round:number,format:string,stage:string,group:string|null=null,node:string|null=null){
    const fixture=uuid();
    this.db.prepare('INSERT INTO fixtures(id,competitionId,round,homeTeamId,awayTeamId,scheduledDate,status,seriesFormat) VALUES (?,?,?,?,?,?,?,?)').run(fixture,id,round,home,away,date,'scheduled',format);
    this.db.prepare('INSERT INTO fixture_stages VALUES (?,?,?,?,?)').run(fixture,id,stage,group,node);return fixture;
  }
  node(id:string,key:string,lane:string,round:number,label:string,home:string,away:string){
    this.db.prepare('INSERT OR IGNORE INTO tournament_nodes(id,competitionId,lane,round,label,homeSource,awaySource) VALUES (?,?,?,?,?,?,?)').run(id+':'+key,id,lane,round,label,home,away);
  }
  private playIn(id:string,teams:string[],start:string){
    const tail=teams.slice(12),team=(i:number)=>'team:'+tail[i];
    for(const [i,seed] of [0,3,1,2].entries())this.node(id,'PI'+(i+1),'Play-ins',0,'Play-in opening '+(i+1),team(seed),team(7-seed));
    for(let i=0;i<2;i++){
      this.node(id,'PW'+(i+1),'Play-ins',1,'Play-in winners match '+(i+1),'win:PI'+(i*2+1),'win:PI'+(i*2+2));
      this.node(id,'PL'+(i+1),'Play-ins',1,'Play-in elimination '+(i+1),'lose:PI'+(i*2+1),'lose:PI'+(i*2+2));
      this.node(id,'PD'+(i+1),'Play-ins',2,'Play-in decider '+(i+1),'win:PL'+(i+1),'lose:PW'+(2-i));
    }
    const state=this.db.prepare('SELECT config FROM tournament_state WHERE competitionId=?').get(id),config=parse(state.config);
    if(config.rulesVersion){config.nodeDates={...config.nodeDates};for(const n of this.db.prepare('SELECT id FROM tournament_nodes WHERE competitionId=?').all(id))config.nodeDates[n.id.slice(id.length+1)]=start;
      this.db.prepare('UPDATE tournament_state SET config=? WHERE competitionId=?').run(JSON.stringify(config),id);}
    this.materialize(id,start,'play_in');
  }
  resolve(id:string,source:string):string|null{
    const colon=source.indexOf(':'),type=source.slice(0,colon),value=source.slice(colon+1);
    if(type==='team')return value;
    if(type==='bye')return '__bye__';
    const node=this.db.prepare('SELECT * FROM tournament_nodes WHERE id=?').get(id+':'+value);
    if(node&&!node.fixtureId&&(node.homeTeamId==='__bye__'||node.awayTeamId==='__bye__'))
      return type==='win'?(node.homeTeamId==='__bye__'?node.awayTeamId:node.homeTeamId):'__bye__';
    const row=this.db.prepare('SELECT f.* FROM tournament_nodes n JOIN fixtures f ON f.id=n.fixtureId WHERE n.id=?').get(id+':'+value);
    if(!row||row.status!=='completed'||row.homeScore===row.awayScore)return null;
    const home=row.homeScore>row.awayScore;
    return type==='win'?(home?row.homeTeamId:row.awayTeamId):(home?row.awayTeamId:row.homeTeamId);
  }
  materialize(id:string,date:string,stage='playoffs'){
    for(const node of this.db.prepare('SELECT * FROM tournament_nodes WHERE competitionId=? AND fixtureId IS NULL ORDER BY round,id').all(id)){
      const home=this.resolve(id,node.homeSource),away=this.resolve(id,node.awaySource);
      if(!home||!away)continue;
      if(home==='__bye__'||away==='__bye__'){
        this.db.prepare('UPDATE tournament_nodes SET homeTeamId=?,awayTeamId=? WHERE id=?').run(home,away,node.id);continue;
      }
      if(home===away)throw new Error('Invalid bracket: a team cannot face itself');
      const dependencies=[node.homeSource,node.awaySource].filter((s:string)=>!s.startsWith('team:')).map((s:string)=>this.db.prepare('SELECT f.scheduledDate FROM tournament_nodes n JOIN fixtures f ON f.id=n.fixtureId WHERE n.id=?').get(id+':'+s.slice(s.indexOf(':')+1))?.scheduledDate).filter(Boolean);
      const scheduled=dependencies.length?addDays([date,...dependencies].sort().pop()!,1):date;
      const config=parse(this.db.prepare('SELECT config FROM tournament_state WHERE competitionId=?').get(id)?.config);
      const key=node.id.slice(id.length+1),nodeStage=config.nodeStages?.[key]||stage;
      const target=config.nodeDates?.[key]?[config.nodeDates[key],...dependencies].sort().pop()!:scheduled;
      const fixture=this.fixture(id,home,away,target,node.round,config.nodeFormats?.[key]||(stage==='play_in'||config.kind==='KICKOFF'&&node.round<3?'BO5':'BO7'),nodeStage,config.nodeGroups?.[key]||null,node.id);
      this.db.prepare('UPDATE tournament_nodes SET homeTeamId=?,awayTeamId=?,fixtureId=? WHERE id=?').run(home,away,fixture,node.id);
    }
  }
  private draw(id:string,teams:string[],date:string,state:any){
    if(teams.length!==16)throw new Error('Four groups need exactly sixteen teams');
    const entrants=teams.map((id,i)=>({id,seed:i+1,region:this.db.prepare('SELECT region FROM teams WHERE id=?').get(id)?.region||''}));
    const groups=parse(state.config).rulesVersion?seededGroupDraw(entrants):groupSeedBands.map(b=>b.map(i=>entrants[i]));
    // Keep top seeds fixed. Try swaps within a seed band to reduce regional
    // collisions; regional Opens intentionally have teams from one region.
    const distinct=new Set(groups.flat().map(t=>t.region));
    if(distinct.size>1&&!parse(state.config).rulesVersion){
      const cost=(gs:any[][])=>gs.reduce((sum,g)=>sum+[...new Set(g.map(t=>t.region))].reduce((s,r)=>s+Math.max(0,g.filter(t=>t.region===r).length-1),0),0);
      for(let pass=0;pass<12;pass++){
        let changed=false;
        for(const band of [3,2,1])for(let a=0;a<4;a++)for(let b=a+1;b<4;b++){
          const before=cost(groups);[groups[a][band],groups[b][band]]=[groups[b][band],groups[a][band]];
          if(cost(groups)<before)changed=true;else [groups[a][band],groups[b][band]]=[groups[b][band],groups[a][band]];
        }
        if(!changed)break;
      }
    }
    const pairings=[[[0,3],[1,2]],[[0,2],[3,1]],[[0,1],[2,3]]];
    groups.forEach((group,i)=>{
      group.forEach(t=>{this.db.prepare('INSERT INTO tournament_groups VALUES (?,?,?,?)').run(id,t.id,names[i],t.seed);this.db.prepare('UPDATE competition_entries SET groupName=? WHERE competitionId=? AND teamId=?').run(names[i],id,t.id);});
      const config=parse(state.config),start=state.startDate>date?state.startDate:date;
      pairings.forEach((pairs,round)=>pairs.forEach(([a,b])=>this.fixture(id,group[a].id,group[b].id,addDays(start,config.rulesVersion&&config.kind==='MAJOR'?(i<2?0:1):round),round+1,'BO5','groups',names[i])));
    });
    this.db.prepare("UPDATE tournament_state SET phase='groups',drawnAt=? WHERE competitionId=?").run(date,id);
  }
  groups(id:string){
    const state=this.db.prepare('SELECT * FROM tournament_state WHERE competitionId=?').get(id),config=parse(state?.config);
    const fixtures=this.db.prepare("SELECT f.* FROM fixtures f JOIN fixture_stages s ON s.fixtureId=f.id WHERE s.competitionId=? AND s.stage='groups' AND f.status='completed'").all(id);
    return names.map(name=>{
      const teams=this.db.prepare('SELECT g.*,t.name AS teamName FROM tournament_groups g JOIN teams t ON t.id=g.teamId WHERE g.competitionId=? AND groupName=? ORDER BY seed').all(id,name);
      const rows=teams.map(t=>({...t,played:0,wins:0,losses:0,gamesWon:0,gamesLost:0,gameDiff:0,points:0,goalDiff:0}));
      for(const f of fixtures)for(const home of [true,false]){
        const row=rows.find(r=>r.teamId===(home?f.homeTeamId:f.awayTeamId));if(!row)continue;
        const a=home?f.homeScore:f.awayScore,b=home?f.awayScore:f.homeScore;
        row.played++;row.gamesWon+=a;row.gamesLost+=b;row.gameDiff=row.gamesWon-row.gamesLost;if(a>b){row.wins++;row.points+=3;}else row.losses++;
        for(const g of this.db.prepare('SELECT * FROM game_results WHERE fixtureId=?').all(f.id))row.goalDiff+=(g.blueTeamId===row.teamId?g.blueScore-g.orangeScore:g.orangeScore-g.blueScore);
      }
      const tie=(r:any)=>{
        const tied=rows.filter(p=>p.wins===r.wins).map(p=>p.teamId);
        let wins=0,diff=0,goals=0;
        for(const f of fixtures){if(![f.homeTeamId,f.awayTeamId].includes(r.teamId)||!tied.includes(f.homeTeamId)||!tied.includes(f.awayTeamId))continue;
          const home=f.homeTeamId===r.teamId,a=home?f.homeScore:f.awayScore,b=home?f.awayScore:f.homeScore;
          wins+=Number(a>b);diff+=a-b;
          for(const g of this.db.prepare('SELECT * FROM game_results WHERE fixtureId=?').all(f.id))goals+=g.blueTeamId===r.teamId?g.blueScore-g.orangeScore:g.orangeScore-g.blueScore;
        }return [wins,diff,r.gameDiff,goals,r.goalDiff,-r.seed];
      };
      rows.sort((a,b)=>{if(a.wins!==b.wins)return b.wins-a.wins;const x=tie(a),y=tie(b);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return y[i]-x[i];return 0;});
      return {name,standings:rows.map((r,i)=>({...r,position:i+1,qualification:i===0?'Upper bracket · two lives':i<config.advance?'Lower bracket · one life':'Eliminated',advances:i<config.advance}))};
    }).filter(g=>g.standings.length);
  }
  playoffs(id:string,date:string,state:any){
    const config=parse(state.config),groups=this.groups(id),seeds=config.playoffSeeds||playoffSeeds(groups,config.advance,config.kind);
    const team=(i:number)=>'team:'+seeds[i-1];
    this.node(id,'U1','Upper bracket',4,'Upper semifinal 1',team(1),team(4));
    this.node(id,'U2','Upper bracket',4,'Upper semifinal 2',team(2),team(3));
    if(seeds.length===8){
      this.node(id,'L1','Lower bracket',4,'Lower round 1 · match 1',team(5),team(8));
      this.node(id,'L2','Lower bracket',4,'Lower round 1 · match 2',team(6),team(7));
      this.node(id,'Q1','Lower bracket',5,'Lower quarterfinal 1','win:L1','lose:U1');
      this.node(id,'Q2','Lower bracket',5,'Lower quarterfinal 2','win:L2','lose:U2');
    }else{
      const pairings=[[5,11],[6,12],[7,9],[8,10]];
      pairings.forEach(([a,b],i)=>this.node(id,'L'+(i+1),'Lower bracket',4,'Lower round 1 · match '+(i+1),team(a),team(b)));
      this.node(id,'R1','Lower bracket',5,'Lower round 2 · match 1','win:L1','win:L4');
      this.node(id,'R2','Lower bracket',5,'Lower round 2 · match 2','win:L2','win:L3');
      this.node(id,'Q1','Lower bracket',6,'Lower quarterfinal 1','win:R1','lose:U1');
      this.node(id,'Q2','Lower bracket',6,'Lower quarterfinal 2','win:R2','lose:U2');
    }
    const round=seeds.length===8?6:7;
    this.node(id,'S1','Final Four',round,'Semifinal 1 · single elimination','win:U1','win:Q2');
    this.node(id,'S2','Final Four',round,'Semifinal 2 · single elimination','win:U2','win:Q1');
    this.node(id,'F','Grand Final',round+1,'Grand Final','win:S1','win:S2');
    if(config.rulesVersion){
      config.nodeDates={...config.nodeDates};
      for(const n of this.db.prepare("SELECT id FROM tournament_nodes WHERE competitionId=? AND lane<>'Play-ins'").all(id)){
        const key=n.id.slice(id.length+1);if(!/^[ULRQSF]\d*$/.test(key))continue;
        const final=key.startsWith('S')||key==='F';
        config.nodeDates[key]=config.kind==='REGIONAL'||config.kind==='LCQ'?(final?config.schedule?.finals||addDays(date,1):config.schedule?.playoffs||date):
          config.kind==='WORLDS'?addDays(config.eventStart,final?5:4):addDays(config.eventStart,config.advance===2?(final?3:2):final?4:key.startsWith('Q')||key.startsWith('R')?3:2);
      }
      this.db.prepare('UPDATE tournament_state SET config=? WHERE competitionId=?').run(JSON.stringify(config),id);
    }
    this.db.prepare("UPDATE tournament_state SET phase='playoffs' WHERE competitionId=?").run(id);
    this.materialize(id,addDays(date,1));
  }
  progress(id:string,date:string){
    const state=this.db.prepare('SELECT * FROM tournament_state WHERE competitionId=?').get(id);if(!state)return;
    if(parse(state.config).rulesVersion&&new OpenStages(this.db,this).progress(id,date,state))return;
    if(state.phase==='play_in'){
      this.materialize(id,date,'play_in');
      const winners=['PW1','PW2','PD1','PD2'].map(n=>this.resolve(id,'win:'+n));
      if(winners.every(Boolean)){
        const direct=this.db.prepare('SELECT teamId FROM competition_entries WHERE competitionId=? ORDER BY seed LIMIT 12').all(id).map(t=>t.teamId);
        const config=parse(state.config),seed=(team:string)=>this.db.prepare('SELECT seed FROM competition_entries WHERE competitionId=? AND teamId=?').get(id,team)?.seed||999;
        const ranked=[...winners.slice(0,2).sort((a,b)=>seed(a!)-seed(b!)),...winners.slice(2).sort((a,b)=>seed(a!)-seed(b!))];
        this.db.prepare("UPDATE tournament_state SET phase='awaiting_draw',drawDate=?,startDate=?,config=? WHERE competitionId=?").run(addDays(date,config.rulesVersion?0:1),addDays(date,config.rulesVersion?1:2),JSON.stringify({...config,groupTeams:[...direct,...ranked]}),id);
        this.drawCalendar(id,addDays(date,config.rulesVersion?0:1));
      }return;
    }
    if(state.phase==='awaiting_draw'&&date>=state.drawDate){
      const teams=parse(state.config).groupTeams||this.db.prepare('SELECT teamId FROM competition_entries WHERE competitionId=? ORDER BY seed').all(id).map(t=>t.teamId);
      this.draw(id,teams,date,state);return;
    }
    if(state.phase==='groups'){
      const pending=this.db.prepare("SELECT f.id FROM fixtures f JOIN fixture_stages s ON s.fixtureId=f.id WHERE s.competitionId=? AND s.stage='groups' AND f.status<>'completed' LIMIT 1").get(id);
      if(!pending)this.playoffs(id,date,state);
    }else if(state.phase==='playoffs'){
      this.materialize(id,date);
      const winner=this.resolve(id,'win:F');if(winner){
        this.db.prepare("UPDATE tournament_state SET phase='completed',championId=? WHERE competitionId=?").run(winner,id);
        this.db.prepare('INSERT OR REPLACE INTO qualification_results VALUES (?,?)').run(id,JSON.stringify([winner]));
      }
    }
  }
  details(id:string){
    const state=this.db.prepare('SELECT * FROM tournament_state WHERE competitionId=?').get(id);if(!state)return null;
    return {...state,config:parse(state.config),groups:this.groups(id),stageStandings:new OpenStages(this.db,this).standings(id),nodes:this.db.prepare(`SELECT n.*,ht.name AS homeTeamName,at.name AS awayTeamName,f.status,f.homeScore,f.awayScore,f.scheduledDate,f.seriesFormat FROM tournament_nodes n LEFT JOIN teams ht ON ht.id=n.homeTeamId LEFT JOIN teams at ON at.id=n.awayTeamId LEFT JOIN fixtures f ON f.id=n.fixtureId WHERE n.competitionId=? ORDER BY n.round,n.lane,n.id`).all(id)};
  }
  placements(id:string){
    const details=this.details(id);if(!details)return null;
    const config=details.config,positions=new Map<string,number>(Object.entries(config.placements||{}).map(([id,p])=>[id,Number(p)]));
    const nodes:any[]=details.nodes,final=nodes.find(n=>n.id===id+':F')||nodes.find(n=>n.id===id+':GF');
    const loser=(n:any)=>n.homeScore>n.awayScore?n.awayTeamId:n.homeTeamId;
    if(final?.status==='completed'){positions.set(loser(final),2);positions.set(final.homeScore>final.awayScore?final.homeTeamId:final.awayTeamId,1);}
    for(const node of nodes)if(node.status==='completed'){
      const key=node.id.slice(id.length+1),out=loser(node);
      // An upper-bracket loss is not elimination; do not award it a finish.
      if(node.lane==='Upper bracket')continue;
      if(node.lane==='Final Four'&&!positions.has(out))positions.set(out,3);
      else if(node.lane==='Quarterfinals')positions.set(out,config.kind==='KICKOFF'?5:5);
      else if(node.lane==='Opening round')positions.set(out,7);
      else if(node.lane==='Lower bracket'&&!positions.has(out))positions.set(out,key.startsWith('Q')?5:key.startsWith('R')?7:(config.playoffSeeds?.length||config.advance*4)===8?7:9);
      else if(node.lane==='Play-ins'&&key.startsWith('PL'))positions.set(out,19);
      else if(node.lane==='Play-ins'&&key.startsWith('PD'))positions.set(out,17);
    }
    for(const g of details.groups)for(const row of g.standings)if(!positions.has(row.teamId)&&!row.advances)positions.set(row.teamId,row.position===4?13:9);
    if(config.kind==='QUALIFIER'){
      let remaining=(config.entrants||[]).length;
      const eliminated=nodes.filter(n=>n.lane==='Qualifier lower'&&n.status==='completed');
      for(const round of [...new Set(eliminated.map(n=>n.round))].sort((a,b)=>a-b)){
        const cohort=eliminated.filter(n=>n.round===round),place=remaining-cohort.length+1;
        cohort.forEach(n=>positions.set(loser(n),place));remaining-=cohort.length;
      }
    }
    return positions;
  }
}
