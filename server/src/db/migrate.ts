import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type Database from "better-sqlite3";
import { getDb } from "./connection";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "migrations");

/**
 * Apply any migration files (NNN_name.sql) not yet recorded in _migrations.
 * Each migration runs inside a transaction; partial application cannot occur.
 */
export function runMigrations(database: Database.Database = getDb()): string[] {
  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    database.prepare("SELECT name FROM _migrations").all().map((r) => (r as { name: string }).name),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    const tx = database.transaction(() => {
      database.exec(sql);
      database
        .prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)")
        .run(file, new Date().toISOString());
    });
    tx();
    newlyApplied.push(file);
  }
  return newlyApplied;
}

// Allow `npm run migrate` to run this file directly (cross-platform check).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const applied = runMigrations();
  if (applied.length === 0) {
    console.log("[migrate] database already up to date");
  } else {
    console.log(`[migrate] applied: ${applied.join(", ")}`);
  }
}
