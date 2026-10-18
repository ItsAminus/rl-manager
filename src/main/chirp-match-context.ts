import type { AppDatabase } from './database';

// The model receives compact saved evidence, never inferred open nets from shots.
export type ChirpMatchContext = {
  fixtureId:string; status:string; competition:string; format:string; date:string;
  home:string; away:string; seriesScore:string; games:{game:number;blue:string;orange:string;score:string}[];
  facts:string[]; incidents:string[]; statistics:string[];
};
export function chirpMatchContext(db:AppDatabase,careerId:string,fixtureId:string):ChirpMatchContext|undefined {
  const f=db.prepare(`SELECT f.*,h.name home,a.name away,c.name competition FROM fixtures f
    JOIN career_competitions cc ON cc.competitionId=f.competitionId AND cc.careerId=?
    JOIN teams h ON h.id=f.homeTeamId JOIN teams a ON a.id=f.awayTeamId
    JOIN competitions c ON c.id=f.competitionId WHERE f.id=?`).get(careerId,fixtureId);
  if(!f)return;
  const games=db.prepare(`SELECT g.*,b.name blue,o.name orange FROM game_results g
    JOIN teams b ON b.id=g.blueTeamId JOIN teams o ON o.id=g.orangeTeamId WHERE g.fixtureId=? ORDER BY g.gameNumber`).all(f.id);
  const facts:string[]=[],wins:Record<string,number>={[f.homeTeamId]:0,[f.awayTeamId]:0};
  let completeHistory=games.length>0,expected=1;
  for(const g of games){
    if(g.gameNumber!==expected++ || g.blueScore===g.orangeScore || ![f.homeTeamId,f.awayTeamId].includes(g.blueTeamId) || ![f.homeTeamId,f.awayTeamId].includes(g.orangeTeamId))completeHistory=false;
  }
  if(f.status==='completed' && f.homeScore!==f.awayScore){
    const winnerId=f.homeScore>f.awayScore?f.homeTeamId:f.awayTeamId,loserId=winnerId===f.homeTeamId?f.awayTeamId:f.homeTeamId;
    const winner=winnerId===f.homeTeamId?f.home:f.away,loser=loserId===f.homeTeamId?f.home:f.away;
    facts.push(`${winner} won the series ${Math.max(f.homeScore,f.awayScore)}–${Math.min(f.homeScore,f.awayScore)} against ${loser}.`);
    if(completeHistory && games.length===f.homeScore+f.awayScore){
      let largestDeficit=0;
      for(const g of games){wins[g.blueScore>g.orangeScore?g.blueTeamId:g.orangeTeamId]++;largestDeficit=Math.max(largestDeficit,wins[loserId]-wins[winnerId]);}
      if(wins[f.homeTeamId]===f.homeScore && wins[f.awayTeamId]===f.awayScore){
      if(largestDeficit>0)facts.push(`${winner} came back from ${largestDeficit} ${largestDeficit===1?'game':'games'} behind to win the series.`);
      const needed=Math.floor(Number(String(f.seriesFormat).replace(/\D/g,''))/2)+1;
      const first=games.slice(0,needed-1),last=games.slice(needed-1);
      if(needed>1 && first.length===needed-1 && last.length===needed && first.every(g=>(g.blueScore>g.orangeScore?g.blueTeamId:g.orangeTeamId)===loserId) && last.every(g=>(g.blueScore>g.orangeScore?g.blueTeamId:g.orangeTeamId)===winnerId))
        facts.push(`${loser} led the series ${needed-1}–0, then ${winner} completed a reverse sweep to win ${needed}–${needed-1}.`);
      const deciding=games[games.length-1];
      if(deciding && ((f.homeScore===needed && f.awayScore===needed-1) || (f.awayScore===needed && f.homeScore===needed-1)))
        facts.push(`Deciding game ${deciding.gameNumber}: ${deciding.blue} ${deciding.blueScore}–${deciding.orangeScore} ${deciding.orange}.`);
      }
    }
  }
  const goals=db.prepare(`SELECT i.*,g.gameNumber FROM game_incidents i JOIN game_results g ON g.id=i.gameResultId
    WHERE g.fixtureId=? AND i.type='goal' ORDER BY g.gameNumber,i.sequence LIMIT 512`).all(f.id);
  for(const g of games){
    if(g.blueScore===g.orangeScore)continue;
    const sequence:number[][]=[];let valid=true,previous=[0,0],lastGoal:any;
    for(const incident of goals.filter(i=>i.gameResultId===g.id)){
      let score:any;try{score=JSON.parse(incident.evidence).score;}catch{valid=false;break;}
      if(!Array.isArray(score)||score.length!==2||score.some(n=>!Number.isInteger(n)||n<0)){valid=false;break;}
      if(score[0]===previous[0] && score[1]===previous[1])continue;
      if(score[0]<previous[0]||score[1]<previous[1]||score[0]-previous[0]+score[1]-previous[1]!==1){valid=false;break;}
      sequence.push(score);previous=score;lastGoal=incident;
    }
    if(!valid||!sequence.length||previous[0]!==g.blueScore||previous[1]!==g.orangeScore)continue;
    const winner=g.blueScore>g.orangeScore?0:1,deficit=Math.max(0,...sequence.map(s=>s[1-winner]-s[winner]));
    const name=winner===0?g.blue:g.orange,other=winner===0?g.orange:g.blue;
    if(deficit>0)facts.push(`Game ${g.gameNumber}: ${name} recovered from a ${deficit}-goal deficit to win ${Math.max(g.blueScore,g.orangeScore)}–${Math.min(g.blueScore,g.orangeScore)} against ${other}.`);
    if(lastGoal.overtime)facts.push(`${name} won game ${g.gameNumber} in overtime.`);
  }
  const names:Record<string,string>={open_net_miss:'confirmed open-net misses',critical_demo:'critical demos',save:'saves',goal:'goals',own_goal:'confirmed own goals',big_mistake:'confirmed big mistakes'};
  const incidents=db.prepare(`SELECT g.gameNumber,p.gamertag,i.type,COUNT(*) n,SUM(i.critical) critical
    FROM game_incidents i JOIN game_results g ON g.id=i.gameResultId JOIN players p ON p.id=i.playerId
    WHERE g.fixtureId=? GROUP BY g.gameNumber,i.playerId,i.type ORDER BY SUM(i.critical) DESC,COUNT(*) DESC LIMIT 12`).all(f.id)
    .filter(i=>names[i.type]).map(i=>`${i.gamertag}: ${i.n} ${names[i.type]} in game ${i.gameNumber}${i.critical?`; ${i.critical} marked critical`:''}.`);
  const statistics=db.prepare(`SELECT p.gamertag,SUM(s.goals) goals,SUM(s.assists) assists,SUM(s.saves) saves,SUM(s.shots) shots
    FROM game_player_stats s JOIN game_results g ON g.id=s.gameResultId JOIN players p ON p.id=s.playerId
    WHERE g.fixtureId=? GROUP BY p.id ORDER BY SUM(s.goals) DESC,SUM(s.saves) DESC LIMIT 3`).all(f.id)
    .map(s=>`${s.gamertag}: ${s.goals} goals, ${s.assists} assists, ${s.saves} saves, ${s.shots} registered shots across the saved games.`);
  return {fixtureId:f.id,status:f.status,competition:f.competition,format:f.seriesFormat,date:f.scheduledDate,home:f.home,away:f.away,
    seriesScore:`${f.homeScore}–${f.awayScore}`,games:games.map(g=>({game:g.gameNumber,blue:g.blue,orange:g.orange,score:`${g.blueScore}–${g.orangeScore}`})),facts,incidents,statistics};
}
