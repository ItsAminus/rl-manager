import {beforeAll,describe,it,expect} from 'vitest';
import initSqlJs from 'sql.js';
import {runMigration} from '../src/database/migrations/001_initial_schema';
import {sqlAdapter} from './sql-fixture';
import {CareerHonours,championTitle} from '../src/main/career-honours';
import {broadcastTeam} from '../src/services/broadcast-assets';
import {playerTitle} from '../src/services/player-title';
let SQL:any;beforeAll(async()=>{SQL=await initSqlJs();});
function world(careerId:string){
  const db=sqlAdapter(new SQL.Database());runMigration(db);
  db.prepare("INSERT INTO competitions(id,name,status,config) VALUES('major','RLCS Major 1','completed',?)").run(JSON.stringify({seasonYear:2026,kind:'MAJOR',cycle:1}));
  const honours=new CareerHonours(db);honours.register(careerId,'major','team',[{id:'player_1'},{id:'player_2'},{id:'player_3'},{id:'reserve'}],'2026-02-19');
  return {db,honours};
}
describe('save-specific championship titles',()=>{
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
