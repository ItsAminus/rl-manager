import {describe,expect,it} from 'vitest';
import {nextSeriesGame} from '../src/services/next-series-game';
describe('automatic series continuation',()=>{
  it('advances after either side wins, and stops when the series is won',()=>{
    for(const bestOf of [1,3,5,7])for(const blueWins of [true,false]){
      const needed=Math.ceil(bestOf/2);
      const result={completed:true,blueScore:blueWins?2:1,orangeScore:blueWins?1:2};
      const series={bestOf,gameNumber:needed,blueWins:blueWins?needed-1:0,orangeWins:blueWins?0:needed-1};
      expect(nextSeriesGame(series,result)).toBeNull();
      if(bestOf>1)expect(nextSeriesGame({...series,blueWins:0,orangeWins:0,gameNumber:1},result)).toBe(2);
    }
  });
  it('does not advance a draw or disconnected match',()=>{
    const series={bestOf:3,blueWins:0,orangeWins:0,gameNumber:1};
    expect(nextSeriesGame(series,{completed:true,blueScore:1,orangeScore:1})).toBeNull();
    expect(nextSeriesGame(series,{completed:false,blueScore:2,orangeScore:1})).toBeNull();
  });
});
