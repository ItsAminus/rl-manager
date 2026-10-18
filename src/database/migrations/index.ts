import { runMigration as migration001 } from './001_initial_schema';

export function runAllMigrations(db: any) {
  // Check if migrations table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      appliedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const appliedMigrations = new Set(
    db.prepare('SELECT name FROM migrations').all().map((m: any) => m.name)
  );

  const migrations = [
    { name: '001_initial_schema', runner: migration001 },
  ];

  for (const migration of migrations) {
    if (!appliedMigrations.has(migration.name)) {
      console.log(`Running migration: ${migration.name}`);
      // Run in transaction
      const transaction = db.transaction(() => {
        migration.runner(db);
        db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration.name);
      });
      transaction();
      console.log(`Migration ${migration.name} applied successfully.`);
    }
  }
}
