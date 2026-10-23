// Psyonix Club Championship rules, 16 October 2026, sections 2.2–2.6
// and attachments A, C, D. Unknown administrative inputs stay explicit.
export const CLUB_RULEBOOK='https://us-west-2-epicgames.graphassets.com/cmkr1i7c9047e07n0es5291ez/cmvi6nrbcrrrp07oe1yeaz00t';
export const CLUB_RULES_VERSION='16 October 2026';
export const CLUB_REGIONS=['Europe','North America','MENA','South America','Oceania','Asia-Pacific','Sub-Saharan Africa'];
export const CLUB_CAPACITY:Record<string,number>={'Europe':12,'North America':12,'MENA':8,'South America':8,'Oceania':8,'Asia-Pacific':8,'Sub-Saharan Africa':8};
export const CLUB_FINALE_SLOTS:Record<string,number>={'Europe':4,'North America':4,'MENA':2,'South America':2,'Oceania':1,'Asia-Pacific':1,'Sub-Saharan Africa':1};
export const CLUB_KICKOFF_REGIONS=CLUB_REGIONS.slice(0,4);
export function clubOpenSchedule(region:string){
  const start=region==='Europe'?'2026-11-13':region==='MENA'?'2026-11-05':'2026-11-06';
  const add=(n:number)=>{const d=new Date(start+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
  return {double_elimination:start,swiss:add(2),gsl:add(7),playoffs:add(8),finals:add(9)};
}
export function clubPoints(kind:string,region:string,p:number){
  if(p<1)return 0;
  if(kind==='CLUB_KICKOFF')return p===1?80:p===2?60:p===3?50:p===4?40:p<=6?30:p<=8?20:p<=12?15:p<=16?10:p<=24?5:0;
  if(kind==='CLUB_FINALE')return p===1?120:p===2?90:p<=4?60:p<=6?45:p<=8?30:p<=11?24:p<=14?18:p<=16?12:0;
  if(kind!=='CLUB_LEAGUE')return 0;
  if(['Europe','North America'].includes(region))return p===1?25:p===2?20:p<=4?16:p<=6?10:p<=8?6:p<=10?4:p<=12?2:0;
  if(['MENA','South America'].includes(region))return p===1?22:p===2?16:p<=4?10:p<=6?6:p<=8?4:0;
  return p===1?18:p===2?10:p<=4?6:p<=6?4:p<=8?2:0;
}
export function clubPlayerPrize(kind:string,region:string,p:number){
  if(p<1)return 0;
  if(kind==='CLUB_KICKOFF')return p===1?39000:p===2?30000:p===3?24000:p===4?21000:p<=6?18000:p<=8?15000:p<=12?10500:p<=16?7500:p<=24?6000:0;
  if(kind==='CLUB_FINALE')return p===1?130000:p===2?90000:p<=4?48000:p<=6?27000:p<=8?16500:p<=11?13500:p<=14?12000:p<=16?10500:0;
  if(kind!=='CLUB_LEAGUE')return 0;
  const amounts=['Europe','North America'].includes(region)?[6000,4800,4200,4200,3600,3600,3000,3000,2400,2400,1800,1800]:
    ['Asia-Pacific','Sub-Saharan Africa'].includes(region)?[3000,2700,2400,2400,2100,2100,1800,1800]:[5100,4200,3600,3600,3000,3000,2400,2400];
  return amounts[p-1]||0;
}
export function clubOwnerPrize(p:number){return p<1?0:p===1?150000:p===2?115000:p===3?95000:p===4?80000:p<=8?60000:p<=12?55000:p<=24?50000:0;}
export function clubProfile(kind:string){
  return {clubRules:true,rulesVersion:1,tournamentVersion:1,kind,advance:2,source:CLUB_RULEBOOK,sourceVersion:'Club Championship · '+CLUB_RULES_VERSION,
    seriesFormat:kind==='CLUB_FINALE'?'BO5':kind==='CLUB_OPEN'?'BO3 / BO5 / BO7':'BO5',qualifierPlaces:32,directSwiss:0,
    qualificationRule:kind==='CLUB_OPEN'?'Open double elimination → two 16-team BO5 Swiss groups → two eight-team BO5 GSL groups → BO7 hybrid playoffs. Two losses eliminate in double elimination and GSL; three losses eliminate in Swiss.':
      kind==='CLUB_KICKOFF'?'Twenty invited clubs plus one Open winner each from EU, NA, MENA and SAM. Twenty-four-team double elimination; top eight seeds receive opening byes. The winner earns its region one additional Club Finale place.':
      kind==='CLUB_LEAGUE'?'BO5 single round robin. EU and NA: 12 teams; all other regions: 8. Rank by match wins, game difference, goal difference, then initial seed. Regional finish determines Finale qualification.':
      'Sixteen qualified teams contest one BO5 Swiss group. Three wins advance, three losses eliminate. Top eight enter BO7 hybrid playoffs: top four have an upper-bracket life before the single-elimination semifinals.'};
}
