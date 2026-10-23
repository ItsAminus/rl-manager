import {beforeAll,describe,it,expect} from 'vitest';
import initSqlJs from 'sql.js';
import {runMigration} from '../src/database/migrations/001_initial_schema';
import {sqlAdapter} from './sql-fixture';
import {CareerHonours,championTitle} from '../src/main/career-honours';
import {broadcastTeam} from '../src/services/broadcast-assets';
import {playerTitle} from '../src/services/player-title';
import {playerIntroduction} from '../src/services/player-introduction';
import {TrophyCeremonies} from '../src/main/trophy-ceremonies';
let SQL:any;beforeAll(async()=>{SQL=await initSqlJs();});
function world(careerId:string){
  const db=sqlAdapter(new SQL.Database());runMigration(db);
  db.prepare("INSERT INTO competitions(id,name,status,config) VALUES('major','RLCS Major 1','completed',?)").run(JSON.stringify({seasonYear:2026,kind:'MAJOR',cycle:1}));
  const honours=new CareerHonours(db);honours.register(careerId,'major','team',[{id:'player_1'},{id:'player_2'},{id:'player_3'},{id:'reserve'}],'2026-02-19');
  return {db,honours};
}
describe('save-specific championship titles',()=>{
  it('uses actual career appearances for an unknown debut and a completed Worlds placement, even after a transfer',()=>{
    const {db,honours}=world('a');
    db.exec(`INSERT INTO players(id,gamertag,teamId) VALUES('prospect','Prospect','newclub'),('reserve','Reserve','newclub');
      INSERT INTO competitions(id,name,type,status) VALUES('open','RLCS 2027 Europe Open 1','QUALIFIER','completed'),('world','RLCS Worlds 2027','WORLDS','completed');
      INSERT INTO career_competitions(competitionId,careerId,stage) VALUES('open','a','QUALIFIER'),('world','a','WORLDS');
      INSERT INTO fixtures(id,competitionId,homeTeamId,awayTeamId,scheduledDate,status) VALUES('opengame','open','oldclub','other','2027-01-04','completed'),('worldgame','world','oldclub','other','2027-09-12','completed'),('final','world','other','winner','2027-09-15','completed');
      INSERT INTO game_results(id,fixtureId,blueTeamId,orangeTeamId) VALUES('g1','opengame','oldclub','other'),('g2','worldgame','oldclub','other');
      INSERT INTO game_player_stats(id,gameResultId,playerId) VALUES('s1','g1','prospect'),('s2','g2','prospect');
      INSERT INTO tournament_state(competitionId,phase,config) VALUES('world','completed','{"kind":"WORLDS","placements":{"oldclub":2}}');`);
    honours.register('a','world','oldclub',[{id:'prospect'},{id:'reserve'}],'2027-09-12');
    const history=honours.introductionHistory('a','prospect','2027-09-16');
    expect(history).toEqual({debut:{text:'RLCS 2027 Europe Open 1',date:'2027-01-04'},worlds:{text:'RUNNER-UP',place:2,date:'2027-09-15'}});
    expect(playerIntroduction({playerId:'prospect',gamertag:'Prospect',introductionDate:'2027-09-16',careerHistory:history})).toMatchObject({rlcsDebut:'RLCS 2027 Europe Open 1',bestWorldsResult:'RUNNER-UP'});
    expect(honours.introductionHistory('a','reserve','2027-09-16')).toEqual({debut:null,worlds:null});
    expect(honours.introductionHistory('a','prospect','2027-09-13').worlds).toBeNull();
    expect(honours.introductionHistory('b','prospect','2027-09-16')).toEqual({debut:null,worlds:null});
    db.exec("UPDATE career_competitions SET stage='ARCHIVED' WHERE careerId='a'");
    expect(honours.introductionHistory('a','prospect','2028-01-01')).toEqual(history);
  });
  it('improves real Worlds history without replacing an established real debut or downgrading a champion',()=>{
    const careerHistory={debut:{text:'RLCS 2027 Open 1',date:'2027-01-01'},worlds:{text:'RUNNER-UP',place:2,date:'2027-09-15'}};
    const stizzy=playerIntroduction({playerId:'real_stizzy',gamertag:'Stizzy',introductionDate:'2027-10-01',careerHistory});
    expect(stizzy.rlcsDebut).toBe('2021-22 Spring Regional 2');expect(stizzy.bestWorldsResult).toBe('RUNNER-UP');
    expect(stizzy.sources.bestWorldsResult).toContain('Career result');
    expect(playerIntroduction({playerId:'player_1',gamertag:'zen',introductionDate:'2027-10-01',careerHistory}).bestWorldsResult).toBe('WORLD CHAMPION');
    expect(playerIntroduction({playerId:'real_stizzy',gamertag:'Stizzy',introductionDate:'2026-10-01',careerHistory}).bestWorldsResult).toBe('9TH-12TH');
  });
  it('queues a celebration only after completion and persists dismissal per save',()=>{
    const {db}=world('a'),ceremony=new TrophyCeremonies(db);
    db.exec("INSERT INTO careers(id,managerName,teamId) VALUES('a','Manager','team'); INSERT INTO teams(id,name) VALUES('team','Champions'); UPDATE competitions SET status='scheduled' WHERE id='major';");
    const c={id:'major',type:'MAJOR'};ceremony.record('a',c,'team','2026-02-22');expect(ceremony.pending('a')).toBeNull();
    db.exec("UPDATE competitions SET status='completed' WHERE id='major'");ceremony.record('a',c,'team','2026-02-22');ceremony.record('a',c,'team','2026-02-22');
    expect(ceremony.pending('a').winnerName).toBe('Champions');expect(ceremony.pending('b')).toBeNull();ceremony.dismiss('b','major');expect(ceremony.pending('a')).not.toBeNull();
    ceremony.dismiss('a','major');ceremony.record('a',c,'team','2026-02-22');expect(ceremony.pending('a')).toBeNull();
  });
  it('awards the registered winning squad once, including its reserve, and equips the earned title',()=>{
    const {db,honours}=world('a'),competition={...db.prepare("SELECT * FROM competitions WHERE id='major'").get(),stage:'MAJOR',cycle:1};
    expect(honours.award('a',competition,'team','2026-02-22')).toHaveLength(4);
    expect(honours.award('a',competition,'team','2026-02-22')).toHaveLength(0);
    expect(honours.equipped('a','player_1').title).toBe('RLCS 2026 Boston Major Champion');
    expect(honours.equipped('a','late-signing')).toBeNull();
    expect(honours.equipped('a','reserve').title).toBe('RLCS 2026 Boston Major Champion');
  });
  it('keeps the same pro independent across saves and leaves the verified IRL title untouched',()=>{
    const original=playerTitle('player_1')?.title,{db,honours}=world('a'),b=world('b');
    honours.award('a',{...db.prepare("SELECT * FROM competitions WHERE id='major'").get(),stage:'MAJOR',cycle:1},'team','2026-02-22');
    expect(b.honours.equipped('b','player_1')).toBeNull();expect(honours.equipped('b','player_1')).toBeNull();
    expect(playerTitle('player_1')?.title).toBe(original);
    const team={id:'team',name:'Test'},player={playerId:'player_1',gamertag:'zen',rating:99};
    expect(broadcastTeam(team,[{...player,careerTitle:honours.equipped('a',player.playerId)}]).players[0].title).toBe('RLCS 2026 Boston Major Champion');
    expect(broadcastTeam(team,[player]).players[0].title).toBe(original);
  });
  it('uses the latest career win, retains all honours and does not invent an EWC account title',()=>{
    const {db,honours}=world('a');
    db.exec("INSERT INTO competitions(id,name,status) VALUES('world','Worlds','completed'),('ewc','EWC','completed')");
    honours.register('a','world','team',[{id:'player_1'}],'2027-09-15');honours.register('a','ewc','team',[{id:'player_1'}],'2028-08-12');
    honours.award('a',{id:'world',stage:'WORLDS',config:JSON.stringify({seasonYear:2027})},'team','2027-09-20');
    honours.award('a',{id:'ewc',stage:'INVITATIONAL',config:'{}'},'team','2028-08-16');
    expect(honours.equipped('a','player_1').title).toBe('RLCS 2027 World Champion');
    expect(honours.list('a','player_1')).toHaveLength(2);expect(honours.list('a','player_1')[0].title).toBeNull();
    expect(championTitle('REGIONAL',6,2027)).toBe('RLCS 2027 Regional Champion');expect(championTitle('KICKOFF',1,2026)).toBeNull();
  });
});
