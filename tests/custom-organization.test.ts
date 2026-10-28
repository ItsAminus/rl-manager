import {beforeAll,expect,it} from 'vitest';
import initSqlJs from 'sql.js';
import {sqlAdapter} from './sql-fixture';
import {runMigration} from '../src/database/migrations/001_initial_schema';
import {createCustomOrganization,saveCustomOrganizationBrand} from '../src/main/custom-organization';
import {validateCustomOrganization} from '../src/game/custom-organization';
import {ClubStudio} from '../src/main/club-studio';
import {broadcastTeam} from '../src/services/broadcast-assets';
import {Region} from '../src/types';
const logo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNfoAAAAASUVORK5CYII=';
const design={name:'Solar Esports',shortName:'SOL',logo,players:[{gamertag:'Nova',overall:81,age:18},{gamertag:'Echo',overall:74,age:20},{gamertag:'Pulse',overall:68,age:19}]};
let SQL:any;beforeAll(async()=>{SQL=await initSqlJs();});
it('creates the selected squad in every region without consuming a free agent or changing another club',()=>{
 for(const region of Object.values(Region)){
 const db=sqlAdapter(new SQL.Database());runMigration(db);db.exec("INSERT INTO players(id,gamertag,teamId,overall) VALUES('fa','Available',NULL,99)");
 const club=createCustomOrganization(db,'save',region,design,'2026-10-11');
 db.prepare('INSERT INTO careers(id,managerName,teamId,currentDate) VALUES(?,?,?,?)').run('save','M',club.teamId,'2026-10-11');saveCustomOrganizationBrand(db,club);
 expect(db.prepare("SELECT teamId FROM players WHERE id='fa'").get().teamId).toBeNull();
 const players=db.prepare('SELECT * FROM players WHERE teamId=? ORDER BY overall DESC').all(club.teamId);
 expect(players.map(p=>[p.gamertag,p.overall,p.age])).toEqual(design.players.map(p=>[p.gamertag,p.overall,p.age]));
 expect(players.every(p=>p.region===region)).toBe(true);expect(db.prepare('SELECT COUNT(*) n FROM contracts WHERE teamId=? AND isActive=1').get(club.teamId).n).toBe(3);
 expect(db.prepare('SELECT shooting FROM player_attributes WHERE playerId=?').get(players[0].id).shooting).toBe(81);
 const team=new ClubStudio(db).decorate(db.prepare('SELECT * FROM teams WHERE id=?').get(club.teamId),'save');
 expect(broadcastTeam(team,[])).toMatchObject({name:'Solar Esports',shortName:'SOL',logo,logoKind:'custom'});
 const restored=sqlAdapter(new SQL.Database(db.exportBinary()));expect(new ClubStudio(restored).branding('save').logo).toBe(logo);
 expect(new ClubStudio(restored).decorate(restored.prepare('SELECT * FROM teams WHERE id=?').get(club.teamId),'different').branding).toBeUndefined();
 }
});
it('validates names, distinct teammates, ratings, region and actual PNG input before creating anything',()=>{
 const db=sqlAdapter(new SQL.Database());runMigration(db);
 for(const bad of [{...design,shortName:''},{...design,players:design.players.slice(0,2)},{...design,players:design.players.map(p=>({...p,overall:100}))},{...design,players:design.players.map(p=>({...p,gamertag:'same'}))}])expect(()=>validateCustomOrganization(bad)).toThrow();
 expect(()=>createCustomOrganization(db,'s','Invalid',design,'2026-10-11')).toThrow(/region/);
 expect(()=>createCustomOrganization(db,'s','Europe',{...design,logo:'not an image'},'2026-10-11')).toThrow(/PNG/);
 expect(db.prepare('SELECT COUNT(*) n FROM teams').get().n).toBe(0);
});
it('can create identical named clubs in different worlds with independent players and branding',()=>{
 const worlds=[sqlAdapter(new SQL.Database()),sqlAdapter(new SQL.Database())];worlds.forEach(db=>runMigration(db));
 const a=createCustomOrganization(worlds[0],'a','Europe',design,'2026-10-11'),b=createCustomOrganization(worlds[1],'b','MENA',{...design,logo:null},'2026-10-11');
 expect(a.teamId).not.toBe(b.teamId);expect(a.playerIds.some(id=>b.playerIds.includes(id))).toBe(false);
 expect(worlds[0].prepare('SELECT id FROM teams WHERE id=?').get(b.teamId)).toBeUndefined();expect(b.design.logo).toBeNull();
});
