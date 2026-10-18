// Competition mechanics transcribed from the organiser's 2026 rules, not from
// a generic league format. Sources are displayed on the competition page.
export const RLCS_RULEBOOK='https://us-west-2-epicgames.graphassets.com/cmkr1i7c9047e07n0es5291ez/cmqfaa43w0c8v08n38hc7f316';
export const EWC_RULEBOOK='https://docs.google.com/document/d/1RxxUwiVAfNazG7VmKE3EOs7t0kCpwQCtzg2i72fJAHY/edit';
export const RULES_VERSION=3;
export const REGION_SLOTS=['NA1','MENA1','EU1','EU2','NA2','EU3','SAM1','OCE1','NA3','EU4','MENA2','SAM2','NA4','EU5','APAC1','SSA1'];
export const REGION_NAMES:Record<string,string>={EU:'Europe',NA:'North America',MENA:'MENA',SAM:'South America',OCE:'Oceania',APAC:'Asia-Pacific',SSA:'Sub-Saharan Africa'};
export const BASE_MAJOR_QUOTAS:Record<string,number>={'Europe':4,'North America':4,'MENA':2,'South America':2,'Oceania':1,'Asia-Pacific':1,'Sub-Saharan Africa':1};
export const EWC_QUOTAS:Record<string,number>={'Europe':3,'North America':3,'MENA':3,'South America':2,'Oceania':1,'Asia-Pacific':1,'Sub-Saharan Africa':1};
export function circuitPoints(kind:string,cycle:number,place:number){
  if(!['REGIONAL','MAJOR'].includes(kind)||place<1||place>16)return 0;
  const band=place===1?0:place===2?1:place<=4?2:place<=6?3:place<=8?4:place<=12?5:6;
  return (kind==='MAJOR'?(cycle===1?[30,20,14,10,6,5,3]:[36,24,16,12,8,6,4]):
    cycle<=3?[15,10,7,5,3,2,1]:[18,12,8,6,4,2,1])[band];
}
export function placementPrize(kind:string,region:string,cycle:number,place:number){
  if(place<1)return 0;
  const band=place===1?0:place===2?1:place<=4?2:place<=6?3:place<=8?4:place<=12?5:place<=16?6:place<=32?7:8;
  if(kind==='MAJOR')return ([102000,51000,36000,22500,15000,9000,4500][band]||0);
  if(kind==='WORLDS')return place<=16?([300000,153000,99000,84000,66000,37500,17250][band]||0):place<=18?9000:place<=20?6000:0;
  if(kind==='INVITATIONAL')return place===1?400000:place===2?180000:place===3?100000:place===4?60000:place<=8?35000:place<=12?20000:place<=16?10000:0;
  if(kind!=='REGIONAL')return 0;
  const reset=cycle===1||cycle===4;
  if(['Europe','North America'].includes(region))return band<8?[21000,12000,8100,4800,3600,2400,1800,1050][band]:place<=(reset?64:72)?450:place<=(reset?128:136)?300:0;
  if(['MENA','South America','Oceania'].includes(region))return band<8?[12000,8100,6000,4200,3300,2100,1200,450][band]:place<=(reset?64:72)?300:0;
  return [6600,3600,2400,1650,1200,1050,600,300][band]||0;
}
export function eventPrizePool(kind:string,region:string,cycle:number){
  const count=kind==='REGIONAL'?136:kind==='WORLDS'?20:16;
  return Array.from({length:count},(_,i)=>placementPrize(kind,region,cycle,i+1)).reduce((a,b)=>a+b,0);
}
export function lcqSchedule(rank:number,year=2026){
  const templates=[['07-03','07-10','07-11','07-12','07-25'],['07-03','07-05','07-11','07-12','07-26'],['07-03','07-05','07-11','07-12','07-24'],['07-02','07-04','07-10','07-11','07-23']];
  const dates=templates[rank];if(!dates)throw new Error('Only four regions receive an RLCS LCQ');
  return Object.fromEntries(['double_elimination','swiss','gsl','playoffs','finals'].map((stage,i)=>[stage,seasonDate('2026-'+dates[i],year)])) as Record<string,string>;
}
export function officialRules(kind:string,cycle=1){
  const regional=['QUALIFIER','REGIONAL','LCQ'].includes(kind);
  return {rulesVersion:RULES_VERSION,tournamentVersion:1,kind,cycle,
    source:kind==='INVITATIONAL'?EWC_RULEBOOK:kind==='EWC_LCQ'?'https://blast.tv/rl/tournaments/esports-world-cup-2026-last-chance-qualifier/series?view=results':RLCS_RULEBOOK,sourceVersion:kind.startsWith('EWC')||kind==='INVITATIONAL'?'EWC 2026':'RLCS 2026 v8 · 12 June 2026',
    format:regional?'double_elimination_swiss_gsl_hybrid':kind==='INVITATIONAL'?'gsl_single_elimination':kind==='KICKOFF'?'seeded_ladder':'round_robin_hybrid',
    advance:kind==='WORLDS'||kind==='MAJOR'&&cycle===2?3:2,
    qualifierPlaces:kind==='QUALIFIER'&&![1,4].includes(cycle)?24:32,
    directSwiss:kind==='QUALIFIER'&&![1,4].includes(cycle)?8:0,
    seriesFormat:kind==='SCRIM'?'BO3':'BO5',groupFormat:'BO5',playoffFormat:'BO7',
    qualificationRule:kind==='QUALIFIER'?'Two losses eliminate a team. BO3 before the top 192; BO5 from there. Qualifiers advance to the two-group Swiss stage.':
      kind==='REGIONAL'?'Two Swiss groups: three wins advance, three losses eliminate. Two eight-team GSL groups: two wins advance, two losses eliminate. Eight teams contest BO7 hybrid playoffs.':
      kind==='LCQ'?'Open double elimination → two Swiss groups → two GSL groups → BO7 hybrid playoffs. The champion qualifies for Worlds. Direct Worlds qualifiers are ineligible.':
      kind==='MAJOR'?`Sixteen point-qualified teams. Four BO5 round-robin groups of four; top ${cycle===1?'two':'three'} advance. Group winners have two lives until the single-elimination Final Four. BO7 playoffs.`:
      kind==='WORLDS'?'Sixteen point qualifiers and four regional LCQ champions. Seeds 13–20 contest BO5 GSL play-ins for four group spots. Four BO5 round-robin groups; top three advance to BO7 hybrid playoffs.':
      kind==='KICKOFF'?'Top four teams from EU and NA Open 1. BO5 opening rounds and quarterfinals; BO7 semifinals and final. Champion qualifies for Major 1 and earns its region an additional international slot.':
      kind==='INVITATIONAL'?'Sixteen teams: regional RLCS qualifiers, the title defender and the global LCQ winner. Two eight-team GSL groups; BO5 non-elimination and BO7 elimination matches. Eight-team BO7 single-elimination playoffs; BO5 third-place match.':
      kind==='EWC_LCQ'?'Four double-elimination pools qualify sixteen teams. BO5 double-elimination playoffs; BO7 Grand Final with a reset if the lower-bracket winner wins the first final. One team qualifies for EWC.':'Practice series; no RLCS points or qualification.'};
}
const openStarts:Record<string,string[]>={
  'Europe':['2025-11-14','2026-01-09','2026-01-23','2026-03-20','2026-04-03','2026-04-17'],
  'North America':['2025-11-14','2026-01-16','2026-01-30','2026-03-13','2026-03-27','2026-04-10'],
  'MENA':['2025-11-20','2026-01-08','2026-01-22','2026-03-12','2026-03-26','2026-04-09'],
  'South America':['2025-11-14','2026-01-09','2026-01-23','2026-03-20','2026-04-03','2026-04-17'],
  'Oceania':['2025-11-22','2026-01-09','2026-01-23','2026-03-13','2026-03-27','2026-04-10'],
  'Asia-Pacific':['2025-11-15','2026-01-10','2026-01-24','2026-03-21','2026-04-04','2026-04-18'],
  'Sub-Saharan Africa':['2025-11-22','2026-01-10','2026-01-24','2026-03-14','2026-03-28','2026-04-11'],
};
export function seasonDate(date:string,seasonYear:number){return `${Number(date.slice(0,4))+seasonYear-2026}${date.slice(4)}`;}
export function openSchedule(region:string,cycle:number,year=2026){
  const start=openStarts[region]?.[cycle-1];if(!start)throw new Error('Unsupported RLCS region or Open');
  const add=(date:string,n:number)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return seasonDate(d.toISOString().slice(0,10),year);};
  const oneDay=['Asia-Pacific','Sub-Saharan Africa'].includes(region)||region==='Oceania'&&cycle===1;
  const swiss=add(start,oneDay?1:2),gsl=region==='MENA'&&cycle===4?seasonDate('2026-03-21',year):add(start,oneDay?6:7),playoffs=region==='MENA'&&cycle===4?gsl:add(start,oneDay?7:8);
  return {double_elimination:seasonDate(start,year),swiss,gsl,playoffs,
    finals:region==='Europe'&&cycle===1?seasonDate('2025-12-05',year):region==='North America'&&cycle===1?seasonDate('2025-12-06',year):region==='MENA'&&cycle===4?seasonDate('2026-03-22',year):add(start,oneDay?8:9)};
}
// Swiss opponents are picked by matching record, then live Buchholz/seed.
// A complete matching is searched so a greedy first pairing cannot force a rematch.
export function swissPairings(rows:{teamId:string;wins:number;losses:number;buchholz:number;seed:number;opponents:string[]}[]){
  const eligible=rows.filter(r=>r.wins<3&&r.losses<3).sort((a,b)=>b.wins-a.wins||a.losses-b.losses||b.buchholz-a.buchholz||a.seed-b.seed);
  const pairs:[string,string][]=[];
  const groups=new Map<string,typeof eligible>();for(const r of eligible){const k=r.wins+'-'+r.losses;groups.set(k,[...(groups.get(k)||[]),r]);}
  const match=(pool:typeof eligible):[string,string][]|null=>{
    if(!pool.length)return [];const a=pool[0];
    // Top half versus bottom half, with deterministic adjacent alternatives.
    const candidates=pool.slice(1).sort((x,y)=>Math.abs(pool.indexOf(x)-Math.ceil(pool.length/2))-Math.abs(pool.indexOf(y)-Math.ceil(pool.length/2)));
    for(const b of candidates)if(!a.opponents.includes(b.teamId)){
      const tail=match(pool.filter(r=>r!==a&&r!==b));if(tail)return [[a.teamId,b.teamId],...tail];
    }return null;
  };
  for(const pool of groups.values()){if(pool.length%2)throw new Error('Swiss record bucket is incomplete');const matched=match(pool);if(!matched)throw new Error('Swiss pairing cannot avoid a rematch');pairs.push(...matched);}
  return pairs;
}
export function seededGroupDraw<T extends {region:string}>(teams:T[]):T[][]{
  if(teams.length!==16)throw new Error('Official round-robin draw requires sixteen entrants');
  const bands=[[0,7,8,15],[1,6,9,14],[2,5,10,13],[3,4,11,12]],base=bands.map(b=>b.map(i=>teams[i]));
  const permutations=(a:number[]):number[][]=>a.length?a.flatMap((v,i)=>permutations(a.filter((_,j)=>j!==i)).map(p=>[v,...p])):[[]];
  const options=permutations([0,1,2,3]),counts=new Map<string,number>();teams.forEach(t=>counts.set(t.region,(counts.get(t.region)||0)+1));
  let best=base,bestScore=Infinity;
  // Exhaustive seed-band swaps avoid a local greedy minimum. Seeds 1–4 remain
  // locked; higher bands move only when lower bands cannot resolve a collision.
  for(const p1 of options)for(const p2 of options)for(const p3 of options){
    const groups=base.map((g,i)=>[g[0],base[p1[i]][1],base[p2[i]][2],base[p3[i]][3]]);
    let violation=0;for(const g of groups)for(const [region,n] of counts){const own=g.filter(t=>t.region===region).length;violation+=Math.max(0,Math.floor(n/4)-own)+Math.max(0,own-Math.ceil(n/4));}
    const movement=(p:number[])=>p.reduce((s,v,i)=>s+Number(v!==i)*10+Math.abs(v-i),0);
    const score=violation*10000000+movement(p1)*10000+movement(p2)*100+movement(p3);
    if(score<bestScore){bestScore=score;best=groups;}
  }return best;
}
