import { describe, expect, it } from 'vitest';
import { playedMatchResult } from '../src/services/played-match-result';
const payload={fixtureId:'f',gameNumber:2,blueTeam:{id:'us',players:[0,1,2].map(i=>({playerId:'blue'+i,gamertag:'B'+i,isHuman:i===1}))},orangeTeam:{id:'them',players:[0,1,2].map(i=>({playerId:'orange'+i,gamertag:'O'+i}))}};
const result={completed:true,blueScore:2,orangeScore:3,playerStats:[0,1,2,3,4,5].map(slot=>({slot,team:slot<3?0:1,name:slot===1?'Human account name':slot<3?'B'+slot:'O'+(slot-3),is_bot:slot!==1,goals:slot,saves:1,shots:2,assists:0,demolitions:1,score:slot*100}))};
describe('played match mapping',()=>{
  it('uses launch slots, including a human account name unlike the pro name',()=>{
    const mapped=playedMatchResult(payload,result);
    expect(mapped).toMatchObject({fixtureId:'f',gameNumber:2,blueTeamId:'us',orangeTeamId:'them',blueScore:2,orangeScore:3,wasPlayed:true});
    expect(mapped.playerStats[1]).toMatchObject({playerId:'blue1',goals:1,score:100,isHuman:true});
    expect(mapped.playerStats.filter(p=>p.isHuman)).toHaveLength(1);
    expect(mapped.playerStats[5]).toMatchObject({playerId:'orange2',goals:5,score:500});
  });
  it('falls back to exact names and the human marker in older result files without slots',()=>{
    const mapped=playedMatchResult(payload,{...result,playerStats:result.playerStats.map(({slot,...car})=>car).reverse()});
    expect(mapped.playerStats[1].score).toBe(100);
    expect(mapped.playerStats[5].score).toBe(500);
  });
  it('rejects unfinished, tied or corrupt scores and stats without inventing a winner',()=>{
    expect(()=>playedMatchResult(payload,{...result,completed:false})).toThrow('completed');
    expect(()=>playedMatchResult(payload,{...result,blueScore:3})).toThrow('completed');
    expect(()=>playedMatchResult(payload,{...result,playerStats:[{slot:0,team:0,score:-1}]})).toThrow('statistics');
  });
});
