import type {AppDatabase} from './database';
import {opponentPreview} from './opponent-preview';
import {preparedDeskTurns,type DeskContext} from './desk-bank';
import {matchStageLabel,isChampionshipFinal} from '../services/match-stage';

export type {DeskTurn} from './desk-bank';
/** Only completed series in this event, through the current career date. */
export function tournamentJourney(db:AppDatabase,competitionId:string,teamId:string,date:string){
  return db.prepare(`SELECT f.id,f.scheduledDate,f.homeTeamId,f.homeScore,f.awayScore,
    h.name homeName,a.name awayName,n.label,s.stage,f.round
    FROM fixtures f JOIN teams h ON h.id=f.homeTeamId JOIN teams a ON a.id=f.awayTeamId
    LEFT JOIN fixture_stages s ON s.fixtureId=f.id LEFT JOIN tournament_nodes n ON n.id=s.nodeId
    WHERE f.competitionId=? AND f.status='completed' AND f.scheduledDate<=?
    AND (f.homeTeamId=? OR f.awayTeamId=?) ORDER BY f.scheduledDate,f.rowid`).all(competitionId,date,teamId,teamId).map(f=>{
      const home=f.homeTeamId===teamId,scored=home?f.homeScore:f.awayScore,conceded=home?f.awayScore:f.homeScore;
      return {id:f.id,date:f.scheduledDate,round:f.label||f.stage||`Round ${f.round}`,opponent:home?f.awayName:f.homeName,score:`${scored}–${conceded}`,won:scored===conceded?null:scored>conceded};
    });
}
export function deskTier(type:string,name:string,label:string){
  if(/\b(?:semi[ -]?finals?|grand[ -]?finals?|final)\b/i.test(label)&&!/quarter|lower|upper|qualif/i.test(label))return 'extended';
  return /^(MAJOR|WORLDS|WORLD_CHAMPIONSHIP|EWC|FIFAE|FIFAE_WORLD_CUP)$/i.test(type)||/\bmajor\b|world championship|esports world cup|fifae/i.test(name)&&!/qualif|lcq/i.test(name)?'short':'graphics';
}

/** Career facts only. Editorial picks are opinions, never fabricated live polls. */
export function prematchDesk(db:AppDatabase,career:any,fixtureId:string){
  const f=db.prepare(`SELECT f.*,c.name competitionName,c.type competitionType,n.label roundLabel,s.stage,s.groupName
    FROM fixtures f JOIN competitions c ON c.id=f.competitionId
    JOIN career_competitions cc ON cc.competitionId=f.competitionId AND cc.careerId=?
    LEFT JOIN fixture_stages s ON s.fixtureId=f.id LEFT JOIN tournament_nodes n ON n.id=s.nodeId
    WHERE f.id=?`).get(career.id,fixtureId);
  if(!f||![f.homeTeamId,f.awayTeamId].includes(career.teamId))throw Error('This fixture is not part of your career.');
  const roster=(id:string)=>{
    const saved=id===career.teamId?db.prepare('SELECT players FROM career_lineup WHERE careerId=?').get(career.id):db.prepare('SELECT players FROM career_ai_lineups WHERE careerId=? AND teamId=?').get(career.id,id);
    let ids:string[]=[];try{ids=JSON.parse(saved?.players||'[]');}catch{/* fall back to current squad */}
    const rows=db.prepare('SELECT p.id,p.gamertag,p.overall,p.morale,p.fatigue,p.preferredTendency,a.aerial,a.passing,a.shooting,a.goalkeeping,a.groundControl,t.confidence,t.pressureResistance FROM players p LEFT JOIN player_attributes a ON a.playerId=p.id LEFT JOIN player_traits t ON t.playerId=p.id WHERE p.teamId=? ORDER BY p.overall DESC,p.id').all(id);
    const selected=ids.map(id=>rows.find(p=>p.id===id)).filter(Boolean);
    return (selected.length===3?selected:rows).slice(0,3);
  };
  const ownPlayers=roster(career.teamId),opponentId=f.homeTeamId===career.teamId?f.awayTeamId:f.homeTeamId,otherPlayers=roster(opponentId);
  const own= db.prepare('SELECT id,name,shortName,teamChemistry FROM teams WHERE id=?').get(career.teamId);
  const other=db.prepare('SELECT id,name,shortName,teamChemistry FROM teams WHERE id=?').get(opponentId);
  const preview=opponentPreview(db,career,opponentId,otherPlayers.map(p=>p.id),ownPlayers.map(p=>p.id));
  const ownPreview=opponentPreview(db,career,career.teamId,ownPlayers.map(p=>p.id),ownPlayers.map(p=>p.id));
  const mean=(ps:any[])=>ps.length?ps.reduce((sum,p)=>sum+p.overall,0)/ps.length:0;
  const gap=mean(ownPlayers)-mean(otherPlayers),fav=gap>=0?own:other;
  const stageLabel=matchStageLabel(f.stage,f.groupName,f.roundLabel,f.round);
  const tier=deskTier(f.competitionType||'',f.competitionName||'',stageLabel);
  const formEdge=preview.recent.length>=3&&ownPreview.recent.length>=3?preview.recent.filter(p=>p.won).length/preview.recent.length-ownPreview.recent.filter(p=>p.won).length/ownPreview.recent.length:0;
  const picks=[{analyst:'Form desk',team:Math.abs(gap)<4&&Math.abs(formEdge)>=.4?(formEdge>0?other.name:own.name):fav.name,reason:Math.abs(gap)<4&&Math.abs(formEdge)>=.4?'Recent form gives this closely matched lineup the editorial edge.':'Squad quality is the main guide; recent results provide context.'},
    {analyst:'Tactics desk',team:Math.abs(gap)<2?'Too close to call':fav.name,reason:Math.abs(gap)<2?'Little separates the selected lineups.':'The stronger lineup has more room for error on paper.'}];
  const context:DeskContext={gap,absGap:Math.abs(gap),ownAvg:mean(ownPlayers),oppAvg:mean(otherPlayers),format:Number(String(f.seriesFormat).replace(/\D/g,''))||5,round:f.round,
    isFinal:isChampionshipFinal(stageLabel)?1:0,isSemi:stageLabel==='Semifinal'?1:0,
    isGroup:/group/i.test(f.stage||'')?1:0,isPlayoff:/playoff|upper|lower|final/i.test((f.stage||'')+' '+(f.roundLabel||''))?1:0,
    isWorlds:/WORLDS|WORLD_CHAMPIONSHIP/.test(f.competitionType||'')?1:0,isMajor:f.competitionType==='MAJOR'?1:0,isRegional:f.competitionType==='REGIONAL'?1:0,
    isEwc:/EWC/.test(f.competitionType||'')?1:0,isFifae:/FIFA/i.test(f.competitionType||'')?1:0,isLcq:/LCQ/.test(f.competitionType||'')?1:0,isQualifier:f.competitionType==='QUALIFIER'?1:0,
    isPath:career.mode==='Path To Glory'?1:0,ownChemistry:own.teamChemistry??50,oppChemistry:other.teamChemistry??50};
  const average=(players:any[],field:string,fallback=50)=>{const values=players.map(p=>p[field]).filter(Number.isFinite);return values.length?values.reduce((sum,n)=>sum+n,0)/values.length:fallback;};
  for(const [prefix,players,recent] of [['own',ownPlayers,ownPreview.recent],['opp',otherPlayers,preview.recent]] as const){
    const ratings=players.map(p=>p.overall).filter(Number.isFinite).sort((a,b)=>b-a);
    context[prefix+'Spread']=ratings.length?ratings[0]-ratings[ratings.length-1]:0;
    context[prefix+'Min']=ratings.length?ratings[ratings.length-1]:0;
    context[prefix+'StarGap']=ratings.length>1?ratings[0]-ratings.slice(1).reduce((a,b)=>a+b,0)/(ratings.length-1):0;
    context[prefix+'Strikers']=players.filter(p=>/STRIKER|FIRST_MAN|First Man/i.test(p.preferredTendency||'')).length;
    context[prefix+'Anchors']=players.filter(p=>/ANCHOR/i.test(p.preferredTendency||'')).length;
    context[prefix+'Playmakers']=players.filter(p=>/PLAYMAKER/i.test(p.preferredTendency||'')).length;
    for(const [label,field,fallback] of [['Morale','morale',65],['Fatigue','fatigue',0],['Confidence','confidence',60],['Pressure','pressureResistance',60],['Aerial','aerial',50],['Passing','passing',50],['Shooting','shooting',50],['Saving','goalkeeping',50],['Ground','groundControl',50]] as const)context[prefix+label]=average(players,field,fallback);
    context[prefix+'RecentCount']=recent.length;context[prefix+'Wins']=recent.filter(r=>r.won).length;
    const streak=(won:boolean)=>{let count=0;for(const r of recent){if(r.won!==won)break;count++;}return count;};
    context[prefix+'Streak']=streak(true);context[prefix+'LosingStreak']=streak(false);
    const score=recent[0]?.score.split(/[–-]/).map(Number)||[];
    context[prefix+'LastWon']=recent.length?Number(recent[0].won):-1;
    context[prefix+'LastClean']=score.length===2?Number(Math.min(...score)===0):-1;
    context[prefix+'LastDecider']=score.length===2?Number(Math.abs(score[0]-score[1])===1&&Math.min(...score)>0):-1;
    context[prefix+'Alternating']=recent.length>=4&&recent.slice(1,4).every((r,i)=>r.won!==recent[i].won)?1:0;
    context[prefix+'BrokenWinRun']=recent.length>=3&&!recent[0].won&&recent[1].won&&recent[2].won?1:0;
    context[prefix+'BrokenLossRun']=recent.length>=3&&recent[0].won&&!recent[1].won&&!recent[2].won?1:0;
    const teamId=prefix==='own'?own.id:other.id;
    const after=new Date(career.currentDate+'T12:00:00Z');after.setUTCDate(after.getUTCDate()-30);
    context[prefix+'Incoming']=db.prepare('SELECT COUNT(*) n FROM transfers WHERE toTeamId=? AND date>=? AND date<=?').get(teamId,after.toISOString().slice(0,10),career.currentDate).n;
    context[prefix+'NewStarters']=players.filter(p=>db.prepare('SELECT id FROM transfers WHERE playerId=? AND toTeamId=? AND date>=? AND date<=? LIMIT 1').get(p.id,teamId,after.toISOString().slice(0,10),career.currentDate)).length;
    context[prefix+'Outgoing']=db.prepare('SELECT COUNT(*) n FROM transfers WHERE fromTeamId=? AND date>=? AND date<=?').get(teamId,after.toISOString().slice(0,10),career.currentDate).n;
  }
  context.floorGap=context.ownMin-context.oppMin;
  for(const skill of ['Aerial','Passing','Shooting','Saving'])context[skill.toLowerCase()+'Gap']=context['own'+skill]-context['opp'+skill];
  const heads=preview.headToHead;
  context.headCount=heads.length;context.headLastOwnWon=heads.length?Number(!heads[0].won):-1;
  const headScore=heads[0]?.score.split(/[–-]/).map(Number)||[];
  context.headLastMargin=headScore.length===2?Math.abs(headScore[0]-headScore[1]):-1;
  context.headOwnDominant=heads.length>=2&&heads.every(r=>!r.won)?1:0;
  context.headOppDominant=heads.length>=2&&heads.every(r=>r.won)?1:0;
  context.headSplit=heads.some(r=>r.won)&&heads.some(r=>!r.won)?1:0;
  const turns=preparedDeskTurns(tier,career.id+':'+f.id+':'+career.currentDate,context,own.id,other.id,own.name,other.name);

  return {fixtureId:f.id,date:career.currentDate,tier,event:f.competitionName,competitionType:f.competitionType,round:stageLabel,own:{...own,players:ownPlayers,average:mean(ownPlayers),recent:ownPreview.recent,form:ownPreview.form,journey:tournamentJourney(db,f.competitionId,own.id,career.currentDate)},opponent:{...other,players:otherPlayers,average:mean(otherPlayers),recent:preview.recent,form:preview.form,journey:tournamentJourney(db,f.competitionId,other.id,career.currentDate)},preview,picks,turns:tier==='graphics'?[]:turns};
}
