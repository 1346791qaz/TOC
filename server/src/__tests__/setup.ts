import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resetDbSingleton } from "../db/connection";
import { runMigrations } from "../db/migrate";

/**
 * Spin up an isolated, migrated SQLite file in a temp dir. Returns a cleanup
 * function. Each test gets its own DB so soft-delete state never leaks.
 */
export function freshDb(): () => void {
  const dir = mkdtempSync(path.join(tmpdir(), "oil-test-"));
  process.env.VSME_DB_PATH = path.join(dir, "test.sqlite");
  resetDbSingleton();
  runMigrations();
  return () => {
    resetDbSingleton();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.VSME_DB_PATH;
  };
}
