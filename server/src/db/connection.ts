import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Data lives under <repo>/data/oil.sqlite by default. Override with VSME_DB_PATH
// (used by tests to point at a temp / in-memory DB). Read lazily so tests can
// set the env var and reset the singleton between cases.
export function dbPath(): string {
  return process.env.VSME_DB_PATH ?? path.resolve(__dirname, "../../../data/oil.sqlite");
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const target = dbPath();
  if (target !== ":memory:") {
    mkdirSync(path.dirname(target), { recursive: true });
  }
  db = new Database(target);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

/** Test helper — drop the singleton so a fresh DB path can be opened. */
export function resetDbSingleton(): void {
  if (db) db.close();
  db = null;
}
