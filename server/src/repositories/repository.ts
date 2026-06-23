import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { getDb } from "../db/connection";

// Columns stored as INTEGER 0/1 but exposed as booleans in the domain model.
const BOOLEAN_COLUMNS: Record<string, string[]> = {
  metrics: ["is_leading"],
  step_data_elements: ["is_key"],
  constraints: ["is_system_constraint"],
  db_connections: ["ssl"],
};

type EntitySchema = {
  record: z.ZodTypeAny;
  createInput: z.ZodTypeAny;
  updateInput: z.ZodTypeAny;
};

export interface ListOptions {
  /** Equality filters applied in addition to the soft-delete predicate. */
  where?: Record<string, string | number | boolean | null>;
  /** When true, return ONLY soft-deleted rows (the Trash view). */
  trashed?: boolean;
  orderBy?: string;
}

/**
 * Generic, soft-delete-aware data access for a single table. All reads exclude
 * deleted rows unless `trashed` is requested; there is no hard-delete path
 * exposed (see {@link Repository.softDelete}).
 */
export class Repository<TRecord extends { id: string }> {
  constructor(
    private readonly table: string,
    private readonly schema: EntitySchema,
  ) {}

  private get booleanCols(): string[] {
    return BOOLEAN_COLUMNS[this.table] ?? [];
  }

  /** Convert a raw SQLite row into the domain shape (0/1 -> boolean). */
  private fromRow(row: Record<string, unknown>): TRecord {
    const out = { ...row };
    for (const col of this.booleanCols) {
      if (col in out) out[col] = out[col] === 1 || out[col] === true;
    }
    return out as TRecord;
  }

  /** Convert a domain value into a SQLite-bindable value. */
  private toBind(value: unknown): string | number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value === "number") return value;
    return String(value);
  }

  list(opts: ListOptions = {}): TRecord[] {
    const clauses: string[] = [opts.trashed ? "deleted_at IS NOT NULL" : "deleted_at IS NULL"];
    const params: (string | number | null)[] = [];
    for (const [key, val] of Object.entries(opts.where ?? {})) {
      if (val === null) {
        clauses.push(`${key} IS NULL`);
      } else {
        clauses.push(`${key} = ?`);
        params.push(this.toBind(val));
      }
    }
    const order = opts.orderBy ? ` ORDER BY ${opts.orderBy}` : "";
    const rows = getDb()
      .prepare(`SELECT * FROM ${this.table} WHERE ${clauses.join(" AND ")}${order}`)
      .all(...params) as Record<string, unknown>[];
    return rows.map((r) => this.fromRow(r));
  }

  get(id: string, opts: { includeDeleted?: boolean } = {}): TRecord | null {
    const predicate = opts.includeDeleted ? "" : " AND deleted_at IS NULL";
    const row = getDb()
      .prepare(`SELECT * FROM ${this.table} WHERE id = ?${predicate}`)
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.fromRow(row) : null;
  }

  create(input: unknown, id: string = randomUUID()): TRecord {
    const data = this.schema.createInput.parse(input) as Record<string, unknown>;
    const now = new Date().toISOString();
    const row: Record<string, unknown> = {
      id,
      ...data,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
    const cols = Object.keys(row);
    const placeholders = cols.map(() => "?").join(", ");
    getDb()
      .prepare(`INSERT INTO ${this.table} (${cols.join(", ")}) VALUES (${placeholders})`)
      .run(...cols.map((c) => this.toBind(row[c])));
    return this.get(id) as TRecord;
  }

  update(id: string, input: unknown): TRecord | null {
    const data = this.schema.updateInput.parse(input) as Record<string, unknown>;
    const cols = Object.keys(data);
    if (cols.length === 0) return this.get(id);
    const assignments = [...cols.map((c) => `${c} = ?`), "updated_at = ?"];
    const params = [...cols.map((c) => this.toBind(data[c])), new Date().toISOString(), id];
    getDb()
      .prepare(`UPDATE ${this.table} SET ${assignments.join(", ")} WHERE id = ? AND deleted_at IS NULL`)
      .run(...params);
    return this.get(id);
  }

  /**
   * Insert a complete row verbatim (preserving id and timestamps). Used by the
   * import engine for lossless round-trips; not exposed over generic CRUD.
   */
  insertRaw(row: Record<string, unknown>): void {
    const cols = Object.keys(row);
    const placeholders = cols.map(() => "?").join(", ");
    getDb()
      .prepare(`INSERT INTO ${this.table} (${cols.join(", ")}) VALUES (${placeholders})`)
      .run(...cols.map((c) => this.toBind(row[c])));
  }

  softDelete(id: string): boolean {
    const res = getDb()
      .prepare(`UPDATE ${this.table} SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`)
      .run(new Date().toISOString(), new Date().toISOString(), id);
    return res.changes > 0;
  }

  restore(id: string): boolean {
    const res = getDb()
      .prepare(`UPDATE ${this.table} SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL`)
      .run(new Date().toISOString(), id);
    return res.changes > 0;
  }
}
