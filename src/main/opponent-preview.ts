import type {AppDatabase} from './database';

const skills=[['shooting','Finishing'],['passing','Passing'],['aerial','Aerial play'],['groundControl','Ground control'],['goalkeeping','Shot stopping'],['demolitions','Demolitions'],['positioning','Positioning']] as const;
const caliber=(rating:number)=>rating>=94?'World class':rating>=89?'Elite':rating>=84?'High-level contender':rating>=79?'Established competitive':rating>=70?'Developing competitive':rating>=60?'Semi-professional':'Grassroots';
const band=(rating:number)=>`${Math.floor(rating/5)*5}–${Math.min(100,Math.floor(rating/5)*5+4)}`;
const role=(value:string)=>({STRIKER:'Attacking threat',DEFENSIVE_ANCHOR:'Defensive anchor',PLAYMAKER:'Playmaker',BALANCED:'All-rounder'}[value]||'Flexible role');

/** Free match preparation; deliberately does not create recruitment observations. */
export function opponentPreview(db:AppDatabase,career:any,teamId:string,starterIds:string[],ownStarterIds:string[]=[]){
  const team=db.prepare('SELECT id,name,region FROM teams WHERE id=?').get(teamId);
  if(!team)throw Error('Opponent not found.');
  const squad=db.prepare(`SELECT p.id,p.gamertag,p.overall,p.preferredTendency,a.shooting,a.passing,a.aerial,a.groundControl,a.goalkeeping,a.demolitions,a.positioning
    FROM players p LEFT JOIN player_attributes a ON a.playerId=p.id WHERE p.teamId=? ORDER BY p.overall DESC,p.id`).all(teamId);
  const starters=[...new Set(starterIds)].map(id=>squad.find(p=>p.id===id)).filter(Boolean).slice(0,3);
  const selected=starters.length?starters:squad.slice(0,3);
  const rated=selected.filter(p=>Number.isFinite(p.overall));
  const average=rated.length?rated.reduce((s,p)=>s+p.overall,0)/rated.length:null;
  const ownRoster=db.prepare('SELECT id,overall FROM players WHERE teamId=? ORDER BY overall DESC').all(career.teamId);
  const own=(ownStarterIds.length?[...new Set(ownStarterIds)].map(id=>ownRoster.find(p=>p.id===id)).filter(Boolean):ownRoster).slice(0,3).filter(p=>Number.isFinite(p.overall));
  const ownAverage=own.length?own.reduce((s,p)=>s+p.overall,0)/own.length:null;
  const diff=average===null||ownAverage===null?null:average-ownAverage;
  const comparison=diff===null?'Not enough roster information to compare.':diff>=12?'A major step up in quality: your squad are clear underdogs.':diff>=4?'They have the stronger squad on paper.':diff<=-12?'Your squad has a substantial quality advantage.':diff<=-4?'Your squad has the edge on paper.':'Closely matched squads on paper; execution could decide this series.';
  const players=selected.map(p=>{
    const ranked=skills.filter(([key])=>Number.isFinite(p[key])).map(([key,label])=>({label,value:p[key]})).sort((a,b)=>b.value-a.value);
    return {id:p.id,gamertag:p.gamertag,caliber:Number.isFinite(p.overall)?caliber(p.overall):'Unrated',ratingBand:Number.isFinite(p.overall)?band(p.overall):'Unknown',role:role(p.preferredTendency),strengths:ranked.slice(0,2).map(s=>s.label),relativeWeakness:ranked.length>2&&ranked[0].value-ranked[ranked.length-1].value>=5?ranked[ranked.length-1].label:null};
  });
  const recent=db.prepare(`SELECT f.id,f.scheduledDate,f.homeTeamId,f.awayTeamId,f.homeScore,f.awayScore,h.name homeTeamName,a.name awayTeamName
    FROM fixtures f JOIN career_competitions cc ON cc.competitionId=f.competitionId
    JOIN teams h ON h.id=f.homeTeamId JOIN teams a ON a.id=f.awayTeamId
    WHERE cc.careerId=? AND f.status='completed' AND f.scheduledDate<=? AND (f.homeTeamId=? OR f.awayTeamId=?)
    ORDER BY f.scheduledDate DESC,f.rowid DESC LIMIT 5`).all(career.id,career.currentDate,teamId,teamId).map(f=>{
      const home=f.homeTeamId===teamId;return {id:f.id,date:f.scheduledDate,opponent:home?f.awayTeamName:f.homeTeamName,opponentId:home?f.awayTeamId:f.homeTeamId,won:(home?f.homeScore>f.awayScore:f.awayScore>f.homeScore),score:home?`${f.homeScore}–${f.awayScore}`:`${f.awayScore}–${f.homeScore}`};
    });
  const wins=recent.filter(r=>r.won).length;
  const headToHead=teamId===career.teamId?[]:db.prepare(`SELECT f.id,f.scheduledDate,f.homeTeamId,f.homeScore,f.awayScore
    FROM fixtures f JOIN career_competitions cc ON cc.competitionId=f.competitionId
    WHERE cc.careerId=? AND f.status='completed' AND f.scheduledDate<=?
    AND ((f.homeTeamId=? AND f.awayTeamId=?) OR (f.homeTeamId=? AND f.awayTeamId=?))
    ORDER BY f.scheduledDate DESC,f.rowid DESC LIMIT 5`).all(career.id,career.currentDate,teamId,career.teamId,career.teamId,teamId).map(f=>{
      const home=f.homeTeamId===teamId;return {id:f.id,date:f.scheduledDate,opponentId:career.teamId,opponent:db.prepare('SELECT name FROM teams WHERE id=?').get(career.teamId)?.name||'Your team',won:home?f.homeScore>f.awayScore:f.awayScore>f.homeScore,score:home?`${f.homeScore}–${f.awayScore}`:`${f.awayScore}–${f.homeScore}`};
    });
  const key=rated.length?[...rated].sort((a,b)=>b.overall-a.overall)[0]:null;
  const teamSkills=skills.map(([field,label])=>{const values=selected.map(p=>p[field]).filter(Number.isFinite);return {field,label,value:values.length?values.reduce((s,n)=>s+n,0)/values.length:null};}).filter(s=>s.value!==null).sort((a,b)=>b.value!-a.value!);
  const best=teamSkills[0],weakest=teamSkills[teamSkills.length-1];
  const advice:string[]=[];
  if(best?.field==='aerial')advice.push('Challenge take-offs early and keep cover for the backboard.');
  else if(best?.field==='passing')advice.push('Cover the infield passing lane and avoid sending two players into the same challenge.');
  else if(best?.field==='demolitions')advice.push('Keep the last defender moving and vary recovery routes to avoid demos.');
  else if(best?.field==='goalkeeping')advice.push('Move the defence sideways with a pass before shooting; avoid feeding routine saves.');
  else advice.push('Keep a third player behind the attack and make the first challenge set up a teammate.');
  if(diff!==null&&diff>=4)advice.push('Prioritise controlled clears, small boost pads and a compact rotation against the stronger roster.');
  else advice.push('Support the first touch with a passing option; pressure together without abandoning the last player.');
  if(best&&weakest&&best.value!-weakest.value!>=5)advice.push(`Their comparatively weaker area is ${weakest.label.toLowerCase()}; test it without assuming it is a guaranteed weakness.`);
  return {team,date:career.currentDate,caliber:average===null?'Unknown':caliber(average),ratingBand:average===null?'Unknown':band(average),comparison,
    players,keyPlayer:key?.gamertag||null,strengths:teamSkills.slice(0,2).map(s=>s.label),recent,
    form:recent.length?`${wins} wins, ${recent.length-wins} losses in their last ${recent.length} recorded series`:'No completed series recorded in this career yet.',
    headToHead,advice,
    note:'Automatic matchday assessment from the current roster and recorded results. Rating bands and skill summaries are estimates, not full recruitment reports. Tactical suggestions do not guarantee how a bot will play.'};
}
