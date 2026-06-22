import { getDb } from "./connection.js";
import { runMigrations } from "./migrate.js";

runMigrations();
const { changes } = getDb().prepare("DELETE FROM accepted_agreements").run();
console.log(`[clear-agreements] Deleted ${changes} record(s). All users will see the agreement on next visit.`);
