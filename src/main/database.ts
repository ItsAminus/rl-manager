import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';
import { runMigration } from '../database/migrations/001_initial_schema';
import { AsyncLocalStorage } from 'node:async_hooks';
import { CareerWorlds } from './career-worlds';

export interface PreparedStatement {
  get(...params: any[]): any;
  all(...params: any[]): any[];
  run(...params: any[]): { changes: number; lastInsertRowid: number };
}

export interface AppDatabase {
  prepare(sql: string): PreparedStatement;
  exec(sql: string): void;
  transaction<T>(fn: () => T): () => T;
  close(): void;
  exportBinary(): Uint8Array;
}

let rawDb: SqlJsDatabase | null = null;
let dbPath: string = '';
let sqlRuntime: Awaited<ReturnType<typeof initSqlJs>>;
let master: AppDatabase;
let worlds: CareerWorlds | null = null;
let activeWorld: AppDatabase | null = null;
const scope=new AsyncLocalStorage<AppDatabase>();

class SqliteWrapper implements AppDatabase {
  private dirty=false;
  private inTransaction=false;
  constructor(private sqlDb: SqlJsDatabase, readonly filename='') {}
  private save(){
    if(!this.filename||this.inTransaction||!this.dirty)return;
    const temporary=this.filename+'.tmp';
    fs.writeFileSync(temporary,Buffer.from(this.sqlDb.export()));
    fs.renameSync(temporary,this.filename);this.dirty=false;
  }

  prepare(sql: string): PreparedStatement {
    const self = this;
    return {
      get(...params: any[]): any {
        const stmt = self.sqlDb.prepare(sql);
        try {
          // Normalize params
          const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          if (flatParams.length > 0) {
            stmt.bind(flatParams);
          }
          if (stmt.step()) {
            return stmt.getAsObject();
          }
          return undefined;
        } finally {
          stmt.free();
        }
      },

      all(...params: any[]): any[] {
        const stmt = self.sqlDb.prepare(sql);
        const results: any[] = [];
        try {
          const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          if (flatParams.length > 0) {
            stmt.bind(flatParams);
          }
          while (stmt.step()) {
            results.push(stmt.getAsObject());
          }
          return results;
        } finally {
          stmt.free();
        }
      },

      run(...params: any[]): { changes: number; lastInsertRowid: number } {
        const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        self.sqlDb.run(sql, flatParams);
        const changes = self.sqlDb.getRowsModified();
        if (changes) self.dirty = true;
        self.save();
        return { changes, lastInsertRowid: 0 };
      },
    };
  }

  exec(sql: string): void {
    this.sqlDb.exec(sql);
    this.dirty = true;
    this.save();
  }

  transaction<T>(fn: () => T): () => T {
    const self = this;
    return () => {
      // If already inside an active transaction, execute fn directly (reentrant)
      if (self.inTransaction) {
        return fn();
      }

      const wasDirty = self.dirty;
      self.inTransaction = true;
      self.sqlDb.exec('BEGIN TRANSACTION;');
      try {
        const result = fn();
        self.sqlDb.exec('COMMIT;');
        self.inTransaction = false;
        self.save();
        return result;
      } catch (err) {
        try {
          self.sqlDb.exec('ROLLBACK;');
        } catch (rbErr) {
          console.warn('[Database] Rollback skipped or inactive:', rbErr);
        }
        self.inTransaction = false;
        self.dirty = wasDirty;
        throw err;
      }
    };
  }

  close(): void {
    if (this.inTransaction) {
      try {
        this.sqlDb.exec('COMMIT;');
      } catch (_) {}
      this.inTransaction = false;
    }
    if (this.dirty) {
      this.save();
    }
    this.sqlDb.close();
  }

  exportBinary(): Uint8Array {
    return this.sqlDb.export();
  }
}

export let db: AppDatabase;

export function getDbPath(): string {
  const target=scope.getStore()||activeWorld;
  return target?(target as SqliteWrapper).filename:dbPath;
}

export function configureCareerWorlds(seed:()=>void){
  const baseline=new SqliteWrapper(new sqlRuntime.Database());
  runMigration(baseline);
  // Seeding owns its transactions. Roster backups export the connection,
  // which sql.js cannot safely do inside an enclosing transaction.
  scope.run(baseline,seed);
  if(baseline.prepare('SELECT COUNT(*) AS n FROM players').get().n<3)throw new Error('Career world template could not be seeded');
  const folder=path.join(path.dirname(dbPath),'careers');
  // Keep the original shared database as the recovery source. No destructive
  // migration runs against it; each career is repaired in its own new file.
  const backup=path.join(path.dirname(dbPath),'before-career-isolation.sqlite.bak');
  if(!fs.existsSync(backup))fs.writeFileSync(backup,Buffer.from(master.exportBinary()));
  worlds=new CareerWorlds(master,baseline,folder,(bytes,file)=>{
    const target=new SqliteWrapper(new sqlRuntime.Database(bytes),file);runMigration(target);return target;
  });
}
export function careerWorld<T>(id:string,fn:()=>T,fresh=false):T {
  if(!worlds)throw new Error('Career worlds are not initialized');
  return scope.run(worlds.get(id,fresh),fn);
}
export function activateCareerWorld(id:string){activeWorld=worlds!.get(id);}
export function clearActiveCareerWorld(){activeWorld=null;}
export function createPracticeWorld(id:string){return worlds!.practice(id);}
export function getCareerDatabase(id:string){return worlds!.get(id);}
export function getCareerTemplate(){if(!worlds)throw Error('Career worlds are not initialized');return worlds.template();}
export function syncCareerWorld(id:string){worlds?.sync(id);}
export function listCareerWorlds(){return worlds!.list();}
export function deleteCareerWorld(id:string){worlds!.delete(id);}

export async function initDb(customPath?: string): Promise<void> {
  const userDataPath = customPath || (app ? app.getPath('userData') : path.join(process.cwd(), 'temp_data'));
  const dbDir = path.join(userDataPath, 'database');

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  dbPath = path.join(dbDir, 'rlmanager.sqlite');

  const SQL = await initSqlJs();sqlRuntime=SQL;

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    rawDb = new SQL.Database(fileBuffer);
    console.log('[Database] Loaded existing database from:', dbPath);
  } else {
    rawDb = new SQL.Database();
    console.log('[Database] Created new database at:', dbPath);
  }

  master = new SqliteWrapper(rawDb,dbPath);
  const target=()=>scope.getStore()||activeWorld||master;
  db = {prepare:sql=>target().prepare(sql),exec:sql=>target().exec(sql),
    transaction:fn=>target().transaction(fn),close:()=>target().close(),exportBinary:()=>target().exportBinary()};

  // Run initial schema migration
  runMigration(db);

  console.log('[Database] Schema migrations applied and saved.');
}

export function closeDb() {
  worlds?.close();activeWorld=null;worlds=null;
  if (db) {
    master.close();
    console.log('[Database] Closed.');
  }
}

export function getDb(): AppDatabase {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export function runInTransaction<T>(fn: () => T): T {
  const transaction = db.transaction(fn);
  return transaction();
}
