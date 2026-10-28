import {beforeAll,expect,it} from 'vitest';
import initSqlJs from 'sql.js';
import {sqlAdapter} from './sql-fixture';
import {runMigration} from '../src/database/migrations/001_initial_schema';
import {addSSACommunity} from '../src/main/ssa-community';
import supplied from '../data/ssa-community-rosters.json';
import names from '../data/desk-team-names.json';
import fs from 'node:fs';
let SQL:any;beforeAll(async()=>{SQL=await initSqlJs();});
it('adds nine missing clubs with starters/reserves and does not duplicate them on reload',()=>{
 const db=sqlAdapter(new SQL.Database());runMigration(db);addSSACommunity(db);
 expect(supplied.teams).toHaveLength(9);expect(db.prepare('SELECT * FROM teams').all()).toHaveLength(9);
 const count=db.prepare('SELECT COUNT(*) n FROM players').get().n;addSSACommunity(db);expect(db.prepare('SELECT COUNT(*) n FROM players').get().n).toBe(count);
 for(const t of supplied.teams){const source=db.prepare('SELECT * FROM team_roster_sources WHERE teamId=?').get(t.id);expect(JSON.parse(source.starterIds)).toHaveLength(3);expect(source.note).toContain('User-supplied');expect(db.prepare('SELECT COUNT(*) n FROM players WHERE teamId=?').get(t.id).n).toBe(3+t.substitutes.length);}
});
it('preserves career ownership and existing SSA free-agent identities rather than stealing or duplicating players',()=>{
 const db=sqlAdapter(new SQL.Database());runMigration(db);db.exec("INSERT INTO teams(id,name,region) VALUES('own','Own','Sub-Saharan Africa');INSERT INTO careers(id,managerName,teamId) VALUES('save','M','own');INSERT INTO players(id,gamertag,teamId,region) VALUES('known','Goldninja','own','Sub-Saharan Africa'),('fa','TyKop.',NULL,'Sub-Saharan Africa')");
 addSSACommunity(db);expect(db.prepare("SELECT teamId FROM players WHERE id='known'").get().teamId).toBe('own');expect(db.prepare("SELECT COUNT(*) n FROM players WHERE LOWER(gamertag) LIKE 'tykop%'").get().n).toBe(1);
 expect(db.prepare("SELECT status FROM team_roster_sources WHERE teamId='thepunishers_ssa'").get().status).toBe('incomplete');
});
it('has a prepared recording for every new club',()=>{
 for(const t of supplied.teams){const entry=(names as any)[t.id];expect(entry?.name).toBe(t.name);expect(fs.statSync('public/audio/desk-team-names/'+entry.file).size).toBeGreaterThan(1000);}
});
