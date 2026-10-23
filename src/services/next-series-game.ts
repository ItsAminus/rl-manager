/** Only a saved win can advance a played series. A draw/disconnect never does. */
export function nextSeriesGame(series:{bestOf:number;blueWins:number;orangeWins:number;gameNumber:number},
  result:{completed:boolean;blueScore:number;orangeScore:number}):number|null {
  if(!result.completed || ![result.blueScore,result.orangeScore].every(Number.isFinite)
    || result.blueScore===result.orangeScore)return null;
  if(series.bestOf===2)return series.gameNumber>=2?null:series.gameNumber+1;
  const blue=series.blueWins+Number(result.blueScore>result.orangeScore);
  const orange=series.orangeWins+Number(result.orangeScore>result.blueScore);
  return Math.max(blue,orange)>=Math.ceil(series.bestOf/2)?null:series.gameNumber+1;
}
