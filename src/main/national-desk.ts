import type {AppDatabase} from './database';
import {NationalManagement} from './national-management';
import {deskTier} from './prematch-desk';
import {preparedDeskTurns,type DeskContext} from './desk-bank';
import {matchStageLabel} from '../services/match-stage';

/** National results are separate from club histories; draws stay draws. */
export function nationalPrematchDesk(db:AppDatabase,careerId:string,fixtureId:string){
  const c=new NationalManagement(db).context(careerId,fixtureId,undefined,false);
  const mean=(ps:any[])=>ps.reduce((n,p)=>n+p.overall,0)/ps.length;
  const ownAverage=mean(c.bluePlayers),otherAverage=mean(c.orangePlayers),gap=ownAverage-otherAverage;
  const history=(teamId:string)=>c.state.matches.filter(m=>m.id!==fixtureId&&m.status==='completed'&&m.scheduledDate<=c.career.currentDate&&[m.homeTeamId,m.awayTeamId].includes(teamId)).sort((a,b)=>b.scheduledDate.localeCompare(a.scheduledDate)).map(m=>{
    const home=m.homeTeamId===teamId,forScore=(home?m.homeScore:m.awayScore)||0,against=(home?m.awayScore:m.homeScore)||0,other=home?m.awayTeamId:m.homeTeamId;
    return {id:m.id,date:m.scheduledDate,round:m.stage,won:forScore===against?null:forScore>against,score:`${forScore}–${against}`,opponentId:other,opponent:c.state.entrants.find(n=>n.id===other)?.name||other};
  });
  const ownHistory=history(c.blue.id),otherHistory=history(c.orange.id);
  const ownRecent=ownHistory.slice(0,5),otherRecent=otherHistory.slice(0,5),heads=otherHistory.filter(r=>r.opponentId===c.blue.id).slice(0,5);
  const context:DeskContext={gap,absGap:Math.abs(gap),ownAvg:ownAverage,oppAvg:otherAverage,format:Number(c.match.seriesFormat.replace(/\D/g,'')),isNational:1,isFifae:1,
    nationalDifferentClubs:new Set(c.bluePlayers.map(p=>p.teamId).filter(Boolean)).size,
    isFinal:/^final$/i.test(c.match.stage)?1:0,isSemi:/^semi/i.test(c.match.stage)?1:0,isGroup:/group/i.test(c.match.stage)?1:0,isPlayoff:/final/i.test(c.match.stage)?1:0,headCount:heads.length};
  for(const [prefix,players,results] of [['own',c.bluePlayers,ownRecent],['opp',c.orangePlayers,otherRecent]] as const){
    context[prefix+'RecentCount']=results.length;context[prefix+'Wins']=results.filter(r=>r.won===true).length;
    const streak=(won:boolean)=>{let count=0;for(const r of results){if(r.won!==won)break;count++;}return count;};
    context[prefix+'Streak']=streak(true);context[prefix+'LosingStreak']=streak(false);
    context[prefix+'LastWon']=results[0]?.won===null||!results.length?-1:Number(results[0].won);
    const ratings=players.map(p=>p.overall);context[prefix+'Spread']=Math.max(...ratings)-Math.min(...ratings);
    context[prefix+'Min']=Math.min(...ratings);
  }
  const form=(results:ReturnType<typeof history>)=>results.length?`${results.filter(r=>r.won===true).length} wins, ${results.filter(r=>r.won===false).length} losses and ${results.filter(r=>r.won===null).length} draws in the last ${results.length} recorded national matchups.`:'No recent national matchups recorded in this career.';
  const stageLabel=matchStageLabel(c.match.stage,c.match.groupName);
  const tier=deskTier('FIFAE',c.competition.name,stageLabel);
  const comparison=Math.abs(gap)<2?'Closely matched national lineups on paper.':gap>0?`${c.blue.name} have the stronger selected lineup on paper.`:`${c.orange.name} have the stronger selected lineup on paper.`;
  const key=[...c.orangePlayers].sort((a,b)=>b.overall-a.overall)[0];
  return {fixtureId,date:c.career.currentDate,tier,event:c.competition.name,competitionType:'FIFAE',round:stageLabel,
    own:{id:c.blue.id,name:c.blue.name,players:c.bluePlayers,average:ownAverage,recent:ownRecent,form:form(ownRecent),journey:[...ownHistory].reverse()},opponent:{id:c.orange.id,name:c.orange.name,players:c.orangePlayers,average:otherAverage,recent:otherRecent,form:form(otherRecent),journey:[...otherHistory].reverse()},
    preview:{comparison,keyPlayer:key.gamertag,recent:otherRecent,form:form(otherRecent),headToHead:heads,advice:['Cover the first challenge and give the next player a clear outlet.']},
    picks:[{analyst:'Lineup desk',team:Math.abs(gap)<2?'Too close to call':gap>0?c.blue.name:c.orange.name,reason:'Editorial prediction from the selected national squads.'}],
    turns:preparedDeskTurns(tier,careerId+':'+fixtureId,context,c.blue.id,c.orange.id,c.blue.name,c.orange.name)};
}
