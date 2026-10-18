import type {AppDatabase} from './database';
import {v4 as uuid} from 'uuid';
import {Tournament} from './tournament';
import {addDays} from '../game/career-rules';
import {BASE_MAJOR_QUOTAS,circuitPoints,REGION_SLOTS,REGION_NAMES,officialRules} from '../game/official-competition-rules';
const parse=(s:string,fallback:any={})=>{try{return JSON.parse(s||'')||fallback;}catch{return fallback;}};
type Score={teamId:string;region:string;points:number;seasonPoints:number;awards:number[];recent:number[]};
export class CircuitQualification {
  constructor(private db:AppDatabase,private ranking:(id:string)=>any[]){}
  scores(careerId:string,sources:string[],split=0):Score[]{
    const all=this.db.prepare("SELECT c.*,cc.stage,cc.cycle FROM competitions c JOIN career_competitions cc ON cc.competitionId=c.id WHERE cc.careerId=? AND cc.stage IN ('REGIONAL','MAJOR') AND c.status='completed' ORDER BY CASE WHEN cc.stage='MAJOR' THEN cc.cycle*3+.5 ELSE cc.cycle END").all(careerId);
    const totals=new Map<string,Score>();
    for(const c of all)for(const [i,row] of this.ranking(c.id).entries()){
      const points=circuitPoints(c.stage,c.cycle,row.placement||i+1);
      const previous:Score=totals.get(row.teamId)||{teamId:row.teamId,region:this.db.prepare('SELECT region FROM teams WHERE id=?').get(row.teamId)?.region,points:0,seasonPoints:0,awards:[],recent:[]};
      previous.seasonPoints+=points;previous.awards.push(points);previous.recent.unshift(points);
      if(sources.includes(c.id)&&(!split||c.stage==='REGIONAL'&&(split===1?c.cycle<=3:c.cycle>=4)))previous.points+=points;
      totals.set(row.teamId,previous);
    }
    return [...totals.values()].sort((a,b)=>b.points-a.points||b.seasonPoints-a.seasonPoints||this.compareList(a.awards.slice().sort((x,y)=>y-x),b.awards.slice().sort((x,y)=>y-x))||this.compareList(a.recent,b.recent)||a.teamId.localeCompare(b.teamId));
  }
  private compareList(a:number[],b:number[]){for(let i=0;i<Math.max(a.length,b.length);i++)if((a[i]||0)!==(b[i]||0))return (b[i]||0)-(a[i]||0);return 0;}
  kickoff(careerId:string){
    const c=this.db.prepare("SELECT c.id FROM competitions c JOIN career_competitions cc ON cc.competitionId=c.id WHERE cc.careerId=? AND cc.stage='KICKOFF' AND c.status='completed' LIMIT 1").get(careerId);
    const id=c&&parse(this.db.prepare('SELECT teams FROM qualification_results WHERE competitionId=?').get(c.id)?.teams,[])[0];
    return id?{teamId:id,region:this.db.prepare('SELECT region FROM teams WHERE id=?').get(id)?.region}:null;
  }
  private cutoff(career:any,target:string,region:string,rows:Score[],count:number,date:string):string[]|null{
    if(rows.length<=count)return rows.map(r=>r.teamId);
    const points=rows[count-1].points,above=rows.filter(r=>r.points>points),tied=rows.filter(r=>r.points===points),spots=count-above.length;
    if(tied.length<=spots)return rows.slice(0,count).map(r=>r.teamId);
    const key='qualification_tie:'+target+':'+region+':'+count;
    let event=this.db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value;
    if(!event){
      event=uuid();const name=this.db.prepare('SELECT name FROM competitions WHERE id=?').get(target)?.name;
      const config={...officialRules('TIEBREAKER'),spots,qualificationRule:`${tied.length} teams tied on RLCS points for ${spots} ${name} qualification place${spots===1?'':'s'}. BO7 qualification bracket.`};
      this.db.prepare("INSERT INTO competitions(id,name,region,type,format,status,config) VALUES (?,?,?,?,?,'scheduled',?)").run(event,region+' — '+name+' qualification tiebreaker',region,'TIEBREAKER','qualification_spot_bracket',JSON.stringify(config));
      this.db.prepare('INSERT INTO career_competitions VALUES (?,?,?,?,?,?)').run(event,career.id,'TIEBREAKER',9,addDays(date,1),'[]');
      tied.forEach((r,i)=>this.db.prepare('INSERT INTO competition_entries(competitionId,teamId,seed) VALUES (?,?,?)').run(event,r.teamId,i+1));
      new Tournament(this.db).prepare(event,tied.map(r=>r.teamId),addDays(date,1),config);
      this.db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(key,event);
      this.db.prepare("INSERT INTO calendar_events(id,careerId,date,type,title,description,relatedId) VALUES (?,?,?,?,?,?,?)").run(uuid(),career.id,addDays(date,1),'tournament_start',region+' qualification tiebreaker',config.qualificationRule,event);
    }
    const result=this.db.prepare('SELECT teams FROM qualification_results WHERE competitionId=?').get(event);
    return result?[...above.map(r=>r.teamId),...parse(result.teams,[])]:null;
  }
  international(career:any,target:any,sources:string[],date:string):string[]|null{
    const major=target.stage==='MAJOR',split=major?target.cycle:0,scores=this.scores(career.id,sources,split),kickoff=this.kickoff(career.id);
    const quotas={...BASE_MAJOR_QUOTAS};if(kickoff&&(!major||split===2))quotas[kickoff.region]++;
    const selected:string[]=[];
    for(const [region,count] of Object.entries(quotas)){
      const guaranteed=major&&split===1&&kickoff?.region===region?kickoff.teamId:null;
      const rows=scores.filter(r=>r.region===region&&r.teamId!==guaranteed),ids=this.cutoff(career,target.id,region,rows,count,date);if(!ids)return null;
      selected.push(...ids);
      if(guaranteed)selected.push(guaranteed);
    }
    // No cross-region fill: regional quotas and real qualification remain visible.
    return this.seedSlots(career.id,target,selected,scores,kickoff?.region||'Europe');
  }
  private seedSlots(careerId:string,target:any,teams:string[],scores:Score[],extraRegion:string){
    const slotNames=REGION_SLOTS.map(s=>s==='EU5'&&extraRegion==='North America'?'NA5':s);
    const slots=new Map<string,string>();
    for(const [short,region] of Object.entries(REGION_NAMES)){
      const own=teams.filter(t=>this.db.prepare('SELECT region FROM teams WHERE id=?').get(t)?.region===region).sort((a,b)=>scores.findIndex(r=>r.teamId===a)-scores.findIndex(r=>r.teamId===b));
      own.forEach((team,i)=>slots.set(short+(i+1),team));
    }
    let ordered=slotNames.map((slot,i)=>({slot,score:i+1,previousPlace:i+1,previousSeed:i+1}));
    const earlier=this.db.prepare("SELECT c.id,c.config FROM competitions c JOIN career_competitions cc ON cc.competitionId=c.id WHERE cc.careerId=? AND cc.stage='MAJOR' AND c.status='completed' ORDER BY cc.cycle").all(careerId);
    for(const c of earlier){
      if(c.id===target.id)continue;
      const prior=parse(c.config),rank=this.ranking(c.id),priorSeeds:Record<string,number>=prior.regionSlotSeeds||{};
      for(const [short,region] of Object.entries(REGION_NAMES)){
        const own=rank.filter(r=>this.db.prepare('SELECT region FROM teams WHERE id=?').get(r.teamId)?.region===region);
        own.forEach((r,i)=>{const key=short+(i+1),slot=ordered.find(s=>s.slot===key);if(slot){slot.previousPlace=r.placement;slot.previousSeed=priorSeeds[key]||slot.previousSeed;slot.score=(slot.score+r.placement)/2;}});
      }
      ordered.sort((a,b)=>a.score-b.score||a.previousPlace-b.previousPlace||a.previousSeed-b.previousSeed);
    }
    const config=parse(target.config),regionSlotSeeds=Object.fromEntries(ordered.map((s,i)=>[s.slot,i+1]));
    this.db.prepare('UPDATE competitions SET config=? WHERE id=?').run(JSON.stringify({...config,regionSlotSeeds,regionSlotScores:Object.fromEntries(ordered.map(s=>[s.slot,s.score]))}),target.id);
    return ordered.map(s=>slots.get(s.slot)).filter(Boolean) as string[];
  }
  lcqRegions(careerId:string){
    const majors=this.db.prepare("SELECT c.id,cc.cycle FROM competitions c JOIN career_competitions cc ON cc.competitionId=c.id WHERE cc.careerId=? AND cc.stage='MAJOR' AND c.status='completed' ORDER BY cc.cycle").all(careerId);
    const stats=new Map<string,{region:string;sum:number;count:number;bestPoints:number;lastPlace:number;seed:number}>();
    for(const m of majors){const ranking=this.ranking(m.id),perRegion=new Set<string>();for(const r of ranking){
      const region=this.db.prepare('SELECT region FROM teams WHERE id=?').get(r.teamId)?.region;
      const old=stats.get(region)||{region,sum:0,count:0,bestPoints:0,lastPlace:999,seed:999};
      old.sum+=circuitPoints('MAJOR',m.cycle,r.placement);old.count++;
      if(!perRegion.has(region)){old.bestPoints+=circuitPoints('MAJOR',m.cycle,r.placement);if(m.cycle===2)old.lastPlace=r.placement;perRegion.add(region);}
      if(m.cycle===2)old.seed=Math.min(old.seed,this.db.prepare('SELECT seed FROM competition_entries WHERE competitionId=? AND teamId=?').get(m.id,r.teamId)?.seed||999);
      stats.set(region,old);
    }}
    return [...stats.values()].sort((a,b)=>b.sum/b.count-a.sum/a.count||b.bestPoints-a.bestPoints||a.lastPlace-b.lastPlace||a.seed-b.seed).slice(0,4).map(s=>s.region);
  }
}
