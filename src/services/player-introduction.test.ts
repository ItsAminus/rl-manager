import {describe, expect, it} from 'vitest';
import {ageOnDate,playerIntroduction} from './player-introduction';
import {broadcastTeam} from './broadcast-assets';
import players from '../../data/players.json';

describe('player introduction facts', () => {
  it('gives every one of the top 1,000 launch cards three populated, sourced rows',()=>{
    const targets=[...players].sort((a,b)=>b.overall-a.overall||a.id.localeCompare(b.id,'en')).slice(0,1000);
    for(const introductionDate of ['2026-10-11','2026-10-22']) {
      const team=broadcastTeam({id:'audit',name:'Coverage'},targets.map(p=>({playerId:p.id,gamertag:p.gamertag,introductionDate})));
      expect(team.players).toHaveLength(1000);
      for(const player of team.players) {
        const facts=player.introduction;
        expect(facts.cardRows,player.gamertag).toHaveLength(3);
        for(const row of facts.cardRows) {
          expect(row.value.trim().length,player.gamertag).toBeGreaterThan(0);
          expect(row.source.startsWith('https://'),player.gamertag).toBe(true);
          expect(row.value).not.toMatch(/NOT RECORDED|NOT VERIFIED/i);
          if(row.label==='RLCS DEBUT')expect(row.value).toBe(facts.rlcsDebut);
          if(row.label==='BEST WORLDS RESULT')expect(row.value).toBe(facts.bestWorldsResult);
          if(row.label==='AGE')expect(row.value).toBe(String(facts.age));
        }
      }
    }
  });
  it('labels qualifier evidence as its event and team result, without inventing a debut or age',()=>{
    const facts=playerIntroduction({playerId:'sg_player_4487946',gamertag:'Exfusionz_2',introductionDate:'2026-10-22'});
    expect(facts).toMatchObject({age:null,rlcsDebut:null,bestWorldsResult:null});
    expect(facts.cardRows).toEqual([
      expect.objectContaining({label:'COMPETITION REGION',value:'OCEANIA'}),
      expect.objectContaining({label:'RECORDED EVENT',value:'RLCS 2026 - OCEANIA OPEN 6'}),
      expect.objectContaining({label:'RECORDED TEAM FINISH',value:'7TH PLACE'}),
    ]);
    expect(playerIntroduction({playerId:'sg_player_4487946',gamertag:'Exfusionz_2',introductionDate:'2025-01-01'}).cardRows).toHaveLength(0);
    expect(playerIntroduction({playerId:'sg_player_4487946',gamertag:'Different player'}).cardRows).toHaveLength(0);
  });
  it('puts Stizzy’s verified debut into the actual launch card payload', () => {
    const team=broadcastTeam({id:'team_1',name:'Team Vitality'},[
      {playerId:'real_stizzy',gamertag:'Stizzy',age:17,introductionDate:'2026-10-22'},
    ]);
    expect(team.players[0].introduction).toMatchObject({age:19,
      rlcsDebut:'2021-22 Spring Regional 2',bestWorldsResult:'9TH-12TH'});
    expect(team.players[0].introduction.sources.rlcsDebut).toContain('tour-de-rocket-league-preview');
  });
  it.each([
    ['player_1','zen',19,'2022-23 Spring Regional 1','WORLD CHAMPION'],
    ['player_6','ExoTiiK',23,'RLCS X Fall Regional 1','WORLD CHAMPION'],
    ['real_stizzy','Stizzy',19,'2021-22 Spring Regional 2','9TH-12TH'],
    ['player_2','Vatira',20,'2021-22 Fall Regional 1','3RD-4TH'],
    ['player_3','Atow.',19,'2021-22 Spring Regional 1','3RD-4TH'],
    ['real_juicy','juicy',21,'2021-22 Spring Regional 3','3RD-4TH'],
    ['player_4','M0nkey M00n',23,'RLCS X Fall Regional 1','WORLD CHAMPION'],
    ['player_7','dralii',19,'2024 Open 1','WORLD CHAMPION'],
    ['player_24','archie',21,'RLCS X Fall Regional 1','3RD-4TH'],
    ['player_12','nass',19,'2024 Open 1','7TH-8TH'],
    ['player_8','Oski',19,'2021-22 Spring Regional 1','3RD-4TH'],
  ])('retains the researched card for %s / %s',(playerId,gamertag,age,rlcsDebut,bestWorldsResult)=>{
    const facts=playerIntroduction({playerId:playerId as string,gamertag:gamertag as string,introductionDate:'2026-10-22'});
    expect(facts).toMatchObject({age,rlcsDebut,bestWorldsResult});
    expect(Object.values(facts.sources).every(source=>source?.startsWith('https://'))).toBe(true);
  });
  it('does not turn a 2v2 title or missing history into a 3v3 Worlds achievement', () => {
    const facts=playerIntroduction({playerId:'unknown',gamertag:'New prospect',age:17,
      careerTitle:{title:'RLCS 2026 2v2 World Champion'}});
    expect(facts).toMatchObject({age:null,rlcsDebut:null,bestWorldsResult:null});
  });
  it('uses a career Worlds championship and rejects invalid ages', () => {
    const facts=playerIntroduction({playerId:'unknown',gamertag:'Prospect',age:NaN,introductionDate:'2028-09-21',
      careerTitle:{title:'RLCS 2028 World Champion',earnedDate:'2028-09-20'}});
    expect(facts.age).toBeNull();
    expect(facts.bestWorldsResult).toBe('WORLD CHAMPION');
    expect(facts.sources.bestWorldsResult).toContain('2028-09-20');
  });
  it('calculates verified ages at the career date rather than using stale database ages', () => {
    expect(ageOnDate('2007-02-20','2027-02-19')).toBe(19);
    expect(ageOnDate('2007-02-20','2027-02-20')).toBe(20);
    expect(ageOnDate('2007-02-20','2027-02-30')).toBeNull();
    expect(playerIntroduction({playerId:'player_1',gamertag:'zen',age:15,introductionDate:'2027-02-20'}).age).toBe(20);
    expect(playerIntroduction({playerId:'unknown',gamertag:'Unverified',age:19}).age).toBeNull();
    expect(playerIntroduction({playerId:'new',gamertag:'Career prospect',age:17,generatedPlayer:true}).age).toBe(17);
  });
  it('does not announce a future result or career award before it happened', () => {
    expect(playerIntroduction({playerId:'real_juicy',gamertag:'juicy',introductionDate:'2025-01-01'}).bestWorldsResult).toBeNull();
    expect(playerIntroduction({playerId:'unknown',gamertag:'Prospect',introductionDate:'2026-10-11',
      careerTitle:{title:'RLCS 2028 World Champion',earnedDate:'2028-09-20'}}).bestWorldsResult).toBeNull();
  });
  it('uses the best result already achieved in an earlier career year',()=>{
    expect(playerIntroduction({playerId:'player_24',gamertag:'archie',introductionDate:'2024-10-22'}).bestWorldsResult).toBe('5TH-6TH');
  });
  it('does not infer a player biography from a public account title', () => {
    const facts=playerIntroduction({playerId:'player_4',gamertag:'Renamed prospect',age:23});
    expect(facts.bestWorldsResult).toBeNull();
  });
  it('keeps verified 3v3 placements separate from other formats', () => {
    const facts=playerIntroduction({playerId:'player_3',gamertag:'Atow.',age:19});
    expect(facts.rlcsDebut).toBe('2021-22 Spring Regional 1');
    expect(facts.bestWorldsResult).toBe('3RD-4TH');
    expect(facts.sources.bestWorldsResult).toContain('Atow/Results');
  });
});
