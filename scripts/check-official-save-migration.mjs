import {createServer} from 'vite';
import initSqlJs from 'sql.js';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const vite=await createServer({configFile:false,root:process.cwd(),server:{watch:null},esbuild:{jsx:'automatic'}});
const {sqlAdapter}=await vite.ssrLoadModule('/tests/sql-fixture.ts');
const {runMigration}=await vite.ssrLoadModule('/src/database/migrations/001_initial_schema.ts');
const {CareerManagement}=await vite.ssrLoadModule('/src/main/career-management.ts');
const SQL=await initSqlJs(),results=[];
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
try{
  for(const file of process.argv.slice(2)){
    // Read the existing file once. All migration writes stay in this in-memory copy.
    const db=sqlAdapter(new SQL.Database(fs.readFileSync(file)));runMigration(db);
    const career=db.prepare('SELECT * FROM careers LIMIT 1').get();
    const snapshot=()=>({rosters:hash(db.prepare('SELECT id,teamId FROM players ORDER BY id').all()),
      results:hash(db.prepare('SELECT * FROM game_results ORDER BY id').all()),
      completed:hash(db.prepare("SELECT id,homeTeamId,awayTeamId,homeScore,awayScore FROM fixtures WHERE status='completed' ORDER BY id").all())});
    const before=snapshot(),management=new CareerManagement(db),start=Date.now();
    // Re-run the migration on the copy even if the running app already upgraded it.
    db.prepare("DELETE FROM settings WHERE key='official_circuit_rules_v3'").run();
    management.ensureCircuit(career.id);
    if(JSON.stringify(before)!==JSON.stringify(snapshot()))throw Error('Migration changed saved rosters or played results');
    const events=db.prepare('SELECT c.id,c.name,c.config FROM competitions c JOIN career_competitions cc ON cc.competitionId=c.id WHERE cc.careerId=? ORDER BY c.id').all(career.id);
    const eventHash=hash(events);management.ensureCircuit(career.id);
    if(eventHash!==hash(db.prepare('SELECT c.id,c.name,c.config FROM competitions c JOIN career_competitions cc ON cc.competitionId=c.id WHERE cc.careerId=? ORDER BY c.id').all(career.id)))throw Error('Migration is not idempotent');
    results.push({file:path.basename(file),careerDate:career.currentDate,migrationMs:Date.now()-start,events:events.length,
      official:events.filter(e=>JSON.parse(e.config||'{}').rulesVersion===3&&!JSON.parse(e.config||'{}').legacyRules).length,
      preservedLegacy:events.filter(e=>JSON.parse(e.config||'{}').legacyRules).length,rostersAndResultsPreserved:true,idempotent:true});db.close();
  }
  fs.mkdirSync('scratch/competition-rules',{recursive:true});fs.writeFileSync('scratch/competition-rules/save-migration-check.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await vite.close();}
