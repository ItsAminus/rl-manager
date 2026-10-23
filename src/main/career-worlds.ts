import fs from 'fs';
import path from 'path';
import type { AppDatabase } from './database';

const parse = (s: string | null, fallback: any = {}) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };
const WORLD_TABLES = ['players','player_attributes','player_traits','teams','contracts','player_affiliations','player_rating_sources','team_roster_sources'];

function replaceRows(target: AppDatabase, source: AppDatabase, table: string) {
  target.exec(`DELETE FROM "${table}"`);
  for (const row of source.prepare(`SELECT * FROM "${table}"`).all()) {
    const cols=Object.keys(row);
    target.prepare(`INSERT INTO "${table}" (${cols.map(c=>`"${c}"`).join(',')}) VALUES (${cols.map(()=>'?').join(',')})`).run(...cols.map(c=>row[c]));
  }
}
function putRow(db: AppDatabase, table: string, row: any) {
  const cols=Object.keys(row);
  db.prepare(`INSERT OR REPLACE INTO "${table}" (${cols.map(c=>`"${c}"`).join(',')}) VALUES (${cols.map(()=>'?').join(',')})`).run(...cols.map(c=>row[c]));
}

/** One-time recovery of an old shared world. Its untouched source is retained.
 * New worlds never use this inference: their entire database is isolated. */
export function recoverLegacyWorld(world: AppDatabase, baseline: AppDatabase, careerId: string) {
  const career=world.prepare('SELECT * FROM careers WHERE id=?').get(careerId);
  if(!career)throw new Error('Career not found');
  const careers=world.prepare('SELECT * FROM careers').all();
  const transfers=world.prepare('SELECT * FROM transfers ORDER BY date,rowid').all().filter(t=>{
    if(t.careerId)return t.careerId===careerId;
    const offer=world.prepare("SELECT careerId FROM outgoing_offers WHERE playerId=? AND sellerId=? AND buyerId=? AND status='completed' ORDER BY responseDate DESC LIMIT 1").get(t.playerId,t.fromTeamId,t.toTeamId);
    if(offer)return offer.careerId===careerId;
    const owners=careers.filter(c=>[t.fromTeamId,t.toTeamId].includes(c.teamId)&&c.currentDate>=t.date);
    if(owners.length===1)return owners[0].id===careerId;
    // Autonomous legacy moves can only belong to a world which reached that day.
    const reached=careers.filter(c=>c.currentDate>=t.date);
    return owners.length===0&&reached.length===1&&reached[0].id===careerId;
  });
  const owned=new Set([...baseline.prepare('SELECT id FROM players WHERE teamId=?').all(career.teamId).map(p=>p.id),...transfers.filter(t=>[t.fromTeamId,t.toTeamId].includes(career.teamId)).map(t=>t.playerId)]);
  const oldPlayers=world.prepare('SELECT * FROM players').all().filter(p=>owned.has(p.id));
  const oldTeam=world.prepare('SELECT * FROM teams WHERE id=?').get(career.teamId);
  const oldAttrs=world.prepare('SELECT * FROM player_attributes').all().filter(p=>owned.has(p.playerId));
  const oldTraits=world.prepare('SELECT * FROM player_traits').all().filter(p=>owned.has(p.playerId));
  const oldContracts=world.prepare('SELECT * FROM contracts').all().filter(p=>owned.has(p.playerId));
  const customPlayers=world.prepare('SELECT * FROM players WHERE teamId=?').all(career.teamId).filter(p=>!baseline.prepare('SELECT id FROM players WHERE id=?').get(p.id));
  world.exec('PRAGMA foreign_keys=OFF');
  world.transaction(()=>{
    for(const table of WORLD_TABLES)replaceRows(world,baseline,table);
    if(oldTeam)putRow(world,'teams',oldTeam);
    for(const p of oldPlayers){const original=world.prepare('SELECT teamId FROM players WHERE id=?').get(p.id);putRow(world,'players',{...p,teamId:original?.teamId??null});}
    for(const p of customPlayers)putRow(world,'players',p);
    for(const p of oldAttrs)putRow(world,'player_attributes',p);
    for(const p of oldTraits)putRow(world,'player_traits',p);
    world.exec('DELETE FROM transfers');
    for(const t of transfers){
      putRow(world,'transfers',{...t,careerId});
      if(t.type!=='renewal')world.prepare('UPDATE players SET teamId=? WHERE id=?').run(t.toTeamId,t.playerId);
    }
    for(const p of oldContracts) {
      if(p.isActive&&world.prepare('SELECT teamId FROM players WHERE id=?').get(p.playerId)?.teamId!==p.teamId)continue;
      if(p.isActive)world.prepare('UPDATE contracts SET isActive=0 WHERE playerId=?').run(p.playerId);
      putRow(world,'contracts',p);
    }
    // Remove other saves' histories and posts, not just their career header.
    for(const {name} of world.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()){
      if(world.prepare(`PRAGMA table_info("${name}")`).all().some(c=>c.name==='careerId'))world.prepare(`DELETE FROM "${name}" WHERE careerId<>?`).run(careerId);
    }
    world.exec(`DELETE FROM game_incidents WHERE gameResultId NOT IN(SELECT g.id FROM game_results g JOIN fixtures f ON f.id=g.fixtureId JOIN career_competitions c ON c.competitionId=f.competitionId);
      DELETE FROM game_development WHERE gameResultId NOT IN(SELECT g.id FROM game_results g JOIN fixtures f ON f.id=g.fixtureId JOIN career_competitions c ON c.competitionId=f.competitionId);
      DELETE FROM game_player_stats WHERE gameResultId NOT IN(SELECT g.id FROM game_results g JOIN fixtures f ON f.id=g.fixtureId JOIN career_competitions c ON c.competitionId=f.competitionId);
      DELETE FROM game_results WHERE fixtureId NOT IN(SELECT f.id FROM fixtures f JOIN career_competitions c ON c.competitionId=f.competitionId);
      DELETE FROM fixtures WHERE competitionId NOT IN(SELECT competitionId FROM career_competitions);
      DELETE FROM competition_entries WHERE competitionId NOT IN(SELECT competitionId FROM career_competitions);
      DELETE FROM competition_byes WHERE competitionId NOT IN(SELECT competitionId FROM career_competitions);
      DELETE FROM qualification_results WHERE competitionId NOT IN(SELECT competitionId FROM career_competitions);
      DELETE FROM fixture_stages WHERE competitionId NOT IN(SELECT competitionId FROM career_competitions);
      DELETE FROM tournament_groups WHERE competitionId NOT IN(SELECT competitionId FROM career_competitions);
      DELETE FROM tournament_stage_teams WHERE competitionId NOT IN(SELECT competitionId FROM career_competitions);
      DELETE FROM tournament_nodes WHERE competitionId NOT IN(SELECT competitionId FROM career_competitions);
      DELETE FROM tournament_state WHERE competitionId NOT IN(SELECT competitionId FROM career_competitions);
      DELETE FROM competitions WHERE id NOT IN(SELECT competitionId FROM career_competitions);`);
    world.prepare('DELETE FROM careers WHERE id<>?').run(careerId);
    world.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES ('isolated_world_v1',?)").run(careerId);
  })();
  world.exec('PRAGMA foreign_keys=ON; VACUUM');
}

export class CareerWorlds {
  private loaded=new Map<string,AppDatabase>();
  private temporary=new Set<string>();
  private index:Record<string,any>;
  constructor(private master:AppDatabase,private baseline:AppDatabase,private folder:string,
    private factory:(bytes:Uint8Array,file:string)=>AppDatabase) {
    fs.mkdirSync(folder,{recursive:true});
    this.index=fs.existsSync(this.indexFile)?parse(fs.readFileSync(this.indexFile,'utf8')):{};
  }
  private get indexFile(){return path.join(this.folder,'index.json');}
  template(){return this.baseline;}
  practice(id:string){
    if(!/^tutorial-[\w-]+$/.test(id))throw Error('Invalid practice career');
    if(this.loaded.has(id))return this.loaded.get(id)!;
    const world=this.factory(this.baseline.exportBinary(),'');
    this.temporary.add(id);this.loaded.set(id,world);return world;
  }
  private filename(id:string){if(!/^[\w-]{1,80}$/.test(id))throw new Error('Invalid career ID');return path.join(this.folder,id+'.sqlite');}
  list(){
    const rows=this.master.prepare('SELECT c.*,t.name AS teamName,s.number AS seasonNumber FROM careers c LEFT JOIN teams t ON t.id=c.teamId LEFT JOIN seasons s ON s.careerId=c.id AND s.isActive=1').all();
    const map=new Map(rows.map(r=>[r.id,r]));
    for(const [id,row] of Object.entries(this.index))row.deleted?map.delete(id):map.set(id,row);
    return [...map.values()].sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  }
  get(id:string,fresh=false){
    if(this.index[id]?.employment==='dismissed')throw Error('Career ended: this manager was dismissed and the playable save was removed.');
    const existing=this.loaded.get(id);if(existing)return existing;
    if(!fresh&&!this.list().some(c=>c.id===id))throw new Error('Career not found');
    const filename=this.filename(id),onDisk=fs.existsSync(filename);
    const world=this.factory(onDisk?fs.readFileSync(filename):fresh?this.baseline.exportBinary():this.master.exportBinary(),filename);
    if(!fresh&&world.prepare("SELECT value FROM settings WHERE key='isolated_world_v1'").get()?.value!==id)recoverLegacyWorld(world,this.baseline,id);
    if(fresh)world.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES ('isolated_world_v1',?)").run(id);
    this.loaded.set(id,world);return world;
  }
  sync(id:string){
    if(this.temporary.has(id))return;
    const world=this.loaded.get(id);if(!world)return;
    const row=world.prepare("SELECT c.*,COALESCE(m.mode,'Manager Career') AS mode,t.name AS teamName,s.number AS seasonNumber FROM careers c LEFT JOIN career_modes m ON m.careerId=c.id LEFT JOIN teams t ON t.id=c.teamId LEFT JOIN seasons s ON s.careerId=c.id AND s.isActive=1 WHERE c.id=?").get(id);
    if(!row)return;
    const employment=world.prepare('SELECT * FROM manager_employment WHERE careerId=?').get(id);
    row.employment=employment?.status||'employed';
    if(row.employment==='dismissed'){
      // Retain forensic recovery data before ending access to the playable save.
      const archiveFolder=path.join(this.folder,'recovery');fs.mkdirSync(archiveFolder,{recursive:true});
      const archive=path.join(archiveFolder,id+'.dismissed.sqlite');
      if(!fs.existsSync(archive)){const temp=archive+'.tmp';fs.writeFileSync(temp,Buffer.from(world.exportBinary()));fs.renameSync(temp,archive);}
      this.index[id]={...row,deleted:true,dismissalReason:employment.reason};this.saveIndex();
      this.loaded.delete(id);world.close();
      const file=this.filename(id);if(fs.existsSync(file))fs.unlinkSync(file);
      return;
    }
    if(JSON.stringify(row)!==JSON.stringify(this.index[id])){this.index[id]=row;this.saveIndex();}
  }
  delete(id:string){this.index[id]={deleted:true};this.saveIndex();}
  private saveIndex(){const temp=this.indexFile+'.tmp';fs.writeFileSync(temp,JSON.stringify(this.index));fs.renameSync(temp,this.indexFile);}
  close(){for(const world of this.loaded.values())world.close();this.loaded.clear();this.baseline.close();}
}
