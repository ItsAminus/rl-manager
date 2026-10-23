import registry from '../../data/player-introductions.json';

type SourcedFact = { text: string; source: string; achievedOn?:string };
type EventEvidence = {event:string;date:string;source:string;region?:string;placement?:number;seed?:number;games?:number;rating?:number};
type CardRow = {label:string;value:string;source:string};
type RecordEntry = { gamertag: string; dateOfBirth?:SourcedFact; rlcsDebut?: SourcedFact; bestWorldsResult?: SourcedFact; worldsHistory?:SourcedFact[]; eventHistory?:EventEvidence[] };
const records = registry.players as Record<string, RecordEntry>;

function validDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export function ageOnDate(birth:string,date:string):number|null {
  if(!validDate(birth)||!validDate(date)||date<birth)return null;
  const age=Number(date.slice(0,4))-Number(birth.slice(0,4))-(date.slice(5)<birth.slice(5)?1:0);
  return age>=13&&age<=100?age:null;
}

function eventName(value:string) {
  const names:Record<string,string> = {
    'rlcs-world-championship-2026':'RLCS 2026 WORLD CHAMPIONSHIP',
    'esports-world-cup-2026':'ESPORTS WORLD CUP 2026',
    'rlcs-paris-major-2-2026':'RLCS 2026 PARIS MAJOR',
    'rlcs-major-1-2026':'RLCS 2026 BOSTON MAJOR',
  };
  return names[value]||value.toUpperCase();
}
function ordinal(value:number) {
  const suffix=value%100>=11&&value%100<=13?'TH':({1:'ST',2:'ND',3:'RD'} as Record<number,string>)[value%10]||'TH';
  return `${value}${suffix}`;
}

// History is editorial data, never inferred from a rating, nickname or first
// observed account title. Missing facts remain missing for both card and voice.
export function playerIntroduction(player: { playerId: string; gamertag: string; age?: number; introductionDate?:string; generatedPlayer?:boolean; careerTitle?: {title?: string; earnedDate?: string};careerHistory?:{debut?:{text:string;date:string}|null;worlds?:{text:string;place:number;date:string}|null} }) {
  const entry = records[player.playerId];
  const matched = entry?.gamertag === player.gamertag ? entry : undefined;
  const date=player.introductionDate||registry.reviewedAt;
  const fact = (value?: SourcedFact) => value?.text?.trim() && /^https:\/\//.test(value.source) &&
    (!value.achievedOn||(validDate(date)&&validDate(value.achievedOn)&&value.achievedOn<=date)) ? value : null;
  const birth=fact(matched?.dateOfBirth);
  const age=birth?ageOnDate(birth.text,date):player.generatedPlayer&&Number.isInteger(player.age)&&player.age!>=13&&player.age!<=100?player.age:null;
  let debut = fact(matched?.rlcsDebut);
  let worlds = fact(matched?.bestWorldsResult);
  // A later best result must not hide a real earlier Worlds appearance when
  // the save is dated before that improvement.
  if (!worlds) {
    const rank = (value:SourcedFact) => value.text==='WORLD CHAMPION'?1:value.text==='RUNNER-UP'?2:Number(value.text.match(/^\d+/)?.[0]||999);
    worlds = (matched?.worldsHistory||[]).filter(value=>fact(value)).sort((a,b)=>rank(a)-rank(b))[0]||null;
  }
  // An equipped/public account title is not a tournament-result source. IRL
  // history comes only from this identity-checked editorial registry.
  if (/^RLCS \d{4} World Champion$/.test(player.careerTitle?.title || '') &&
      player.careerTitle?.earnedDate&&validDate(player.careerTitle.earnedDate)&&player.careerTitle.earnedDate<=date) {
    worlds = {text: 'WORLD CHAMPION', source: `Career award · ${player.careerTitle?.earnedDate || ''}`};
  }
  const history=player.careerHistory;
  // Verified IRL debuts stay the debut; a first appearance in this save fills
  // an unknown history. Later tournaments must never overwrite a first event.
  if(!debut&&history?.debut&&validDate(history.debut.date)&&history.debut.date<=date)
    debut={text:history.debut.text,source:`Career appearance · ${history.debut.date}`};
  const priorPlace=worlds?.text==='WORLD CHAMPION'?1:worlds?.text==='RUNNER-UP'?2:Number(worlds?.text.match(/^\d+/)?.[0]||999);
  if(history?.worlds&&validDate(history.worlds.date)&&history.worlds.date<=date&&history.worlds.place<priorPlace)
    worlds={text:history.worlds.text,source:`Career result · ${history.worlds.date}`};
  const event = (matched?.eventHistory||[]).filter(e=>/^https:\/\//.test(e.source)&&validDate(e.date)&&validDate(date)&&e.date<=date)
    .sort((a,b)=>b.date.localeCompare(a.date))[0];
  const cardRows:CardRow[]=[];
  if(age!==null&&age!==undefined)cardRows.push({label:'AGE',value:String(age),source:birth?.source||'Career save'});
  else if(event)cardRows.push({label:event.region?'COMPETITION REGION':'EVENT DATE',value:event.region?.toUpperCase()||event.date,source:event.source});
  if(debut)cardRows.push({label:'RLCS DEBUT',value:debut.text,source:debut.source});
  else if(event)cardRows.push({label:'RECORDED EVENT',value:eventName(event.event),source:event.source});
  if(worlds)cardRows.push({label:'BEST WORLDS RESULT',value:worlds.text,source:worlds.source});
  else if(event) {
    const placement=Number.isInteger(event.placement)&&event.placement!>0;
    const seed=Number.isInteger(event.seed)&&event.seed!>0;
    const games=Number.isInteger(event.games)&&event.games!>0;
    if(placement)cardRows.push({label:'RECORDED TEAM FINISH',value:ordinal(event.placement!)+' PLACE',source:event.source});
    else if(games&&Number.isFinite(event.rating))cardRows.push({label:'EVENT RATING',value:`${event.rating!.toFixed(2)} · ${event.games} GAMES`,source:event.source});
    else if(seed)cardRows.push({label:'RECORDED TEAM SEED',value:'SEED '+event.seed,source:event.source});
    else if(games)cardRows.push({label:'RECORDED GAMES',value:String(event.games),source:event.source});
  }
  return {
    age,
    rlcsDebut: debut?.text || null, bestWorldsResult: worlds?.text || null,
    cardRows,
    sources: {age:birth?birth.source:player.generatedPlayer?'Career save':null,
      rlcsDebut: debut?.source || null, bestWorldsResult: worlds?.source || null},
  };
}
