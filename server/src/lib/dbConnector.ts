import type { DbConnection, DbDriverType } from "@shared/schemas";

export interface SchemaInfo {
  schema: string;
}

export interface TableInfo {
  table_name: string;
  table_type: string;
}

export interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: boolean;
  column_default: string | null;
}

export interface TestResult {
  ok: boolean;
  latency_ms: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// PostgreSQL
// ---------------------------------------------------------------------------
async function pgTest(conn: DbConnection): Promise<TestResult> {
  const { Client } = await import("pg");
  const start = Date.now();
  const client = new Client(buildPgConfig(conn));
  try {
    await client.connect();
    await client.query("SELECT 1");
    return { ok: true, latency_ms: Date.now() - start };
  } catch (e) {
    return { ok: false, latency_ms: Date.now() - start, error: String(e) };
  } finally {
    await client.end().catch(() => {});
  }
}

async function pgSchemas(conn: DbConnection): Promise<SchemaInfo[]> {
  const { Client } = await import("pg");
  const client = new Client(buildPgConfig(conn));
  await client.connect();
  try {
    const res = await client.query<{ schema_name: string }>(
      `SELECT schema_name FROM information_schema.schemata
       WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast')
       ORDER BY schema_name`,
    );
    return res.rows.map((r) => ({ schema: r.schema_name }));
  } finally {
    await client.end().catch(() => {});
  }
}

async function pgTables(conn: DbConnection, schema: string): Promise<TableInfo[]> {
  const { Client } = await import("pg");
  const client = new Client(buildPgConfig(conn));
  await client.connect();
  try {
    const res = await client.query<{ table_name: string; table_type: string }>(
      `SELECT table_name, table_type FROM information_schema.tables
       WHERE table_schema = $1 ORDER BY table_name`,
      [schema],
    );
    return res.rows;
  } finally {
    await client.end().catch(() => {});
  }
}

async function pgColumns(conn: DbConnection, schema: string, table: string): Promise<ColumnInfo[]> {
  const { Client } = await import("pg");
  const client = new Client(buildPgConfig(conn));
  await client.connect();
  try {
    const res = await client.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [schema, table],
    );
    return res.rows.map((r) => ({
      column_name: r.column_name,
      data_type: r.data_type,
      is_nullable: r.is_nullable === "YES",
      column_default: r.column_default,
    }));
  } finally {
    await client.end().catch(() => {});
  }
}

function buildPgConfig(conn: DbConnection) {
  return {
    host: conn.host ?? "localhost",
    port: conn.port ?? 5432,
    database: conn.database_name ?? undefined,
    user: conn.username ?? undefined,
    password: conn.password ?? undefined,
    ssl: conn.ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 8000,
  };
}

// ---------------------------------------------------------------------------
// MySQL / MariaDB
// ---------------------------------------------------------------------------
async function mysqlTest(conn: DbConnection): Promise<TestResult> {
  const mysql = await import("mysql2/promise");
  const start = Date.now();
  let connection: Awaited<ReturnType<typeof mysql.createConnection>> | undefined;
  try {
    connection = await mysql.createConnection(buildMysqlConfig(conn));
    await connection.query("SELECT 1");
    return { ok: true, latency_ms: Date.now() - start };
  } catch (e) {
    return { ok: false, latency_ms: Date.now() - start, error: String(e) };
  } finally {
    await connection?.end().catch(() => {});
  }
}

async function mysqlSchemas(conn: DbConnection): Promise<SchemaInfo[]> {
  const mysql = await import("mysql2/promise");
  const connection = await mysql.createConnection(buildMysqlConfig(conn));
  try {
    const [rows] = await connection.query(
      `SELECT schema_name FROM information_schema.schemata
       WHERE schema_name NOT IN ('information_schema','performance_schema','mysql','sys')
       ORDER BY schema_name`,
    );
    return (rows as Array<Record<string, unknown>>).map((r) => ({ schema: String(r["schema_name"] ?? "") }));
  } finally {
    await connection.end().catch(() => {});
  }
}

async function mysqlTables(conn: DbConnection, schema: string): Promise<TableInfo[]> {
  const mysql = await import("mysql2/promise");
  const connection = await mysql.createConnection(buildMysqlConfig(conn));
  try {
    const [rows] = await connection.query(
      `SELECT table_name, table_type FROM information_schema.tables
       WHERE table_schema = ? ORDER BY table_name`,
      [schema],
    );
    return (rows as Array<Record<string, unknown>>).map((r) => ({
      table_name: String(r["table_name"] ?? ""),
      table_type: String(r["table_type"] ?? ""),
    }));
  } finally {
    await connection.end().catch(() => {});
  }
}

async function mysqlColumns(conn: DbConnection, schema: string, table: string): Promise<ColumnInfo[]> {
  const mysql = await import("mysql2/promise");
  const connection = await mysql.createConnection(buildMysqlConfig(conn));
  try {
    const [rows] = await connection.query(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = ? AND table_name = ?
       ORDER BY ordinal_position`,
      [schema, table],
    );
    return (rows as Array<Record<string, unknown>>).map((r) => ({
      column_name: String(r["column_name"] ?? ""),
      data_type: String(r["data_type"] ?? ""),
      is_nullable: String(r["is_nullable"] ?? "YES") === "YES",
      column_default: r["column_default"] != null ? String(r["column_default"]) : null,
    }));
  } finally {
    await connection.end().catch(() => {});
  }
}

function buildMysqlConfig(conn: DbConnection) {
  return {
    host: conn.host ?? "localhost",
    port: conn.port ?? 3306,
    database: conn.database_name ?? undefined,
    user: conn.username ?? undefined,
    password: conn.password ?? undefined,
    ssl: conn.ssl ? {} : undefined,
    connectTimeout: 8000,
  };
}

// ---------------------------------------------------------------------------
// SQL Server (mssql)
// ---------------------------------------------------------------------------
async function mssqlTest(conn: DbConnection): Promise<TestResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mssql = require("mssql") as typeof import("mssql");
  const start = Date.now();
  let pool: import("mssql").ConnectionPool | undefined;
  try {
    pool = await mssql.connect(buildMssqlConfig(conn));
    await pool.request().query("SELECT 1 AS n");
    return { ok: true, latency_ms: Date.now() - start };
  } catch (e) {
    return { ok: false, latency_ms: Date.now() - start, error: String(e) };
  } finally {
    await pool?.close().catch(() => {});
  }
}

async function mssqlSchemas(conn: DbConnection): Promise<SchemaInfo[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mssql = require("mssql") as typeof import("mssql");
  const pool = await mssql.connect(buildMssqlConfig(conn));
  try {
    const result = await pool.request().query(
      `SELECT SCHEMA_NAME AS schema_name FROM information_schema.schemata
       WHERE SCHEMA_NAME NOT IN ('sys','INFORMATION_SCHEMA','guest','db_owner',
         'db_accessadmin','db_securityadmin','db_ddladmin','db_backupoperator',
         'db_datareader','db_datawriter','db_denydatareader','db_denydatawriter')
       ORDER BY SCHEMA_NAME`,
    );
    return (result.recordset as Array<{ schema_name: string }>).map((r) => ({ schema: r.schema_name }));
  } finally {
    await pool.close().catch(() => {});
  }
}

async function mssqlTables(conn: DbConnection, schema: string): Promise<TableInfo[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mssql = require("mssql") as typeof import("mssql");
  const pool = await mssql.connect(buildMssqlConfig(conn));
  try {
    const result = await pool.request()
      .input("schema", mssql.NVarChar, schema)
      .query(
        `SELECT table_name, table_type FROM information_schema.tables
         WHERE table_schema = @schema ORDER BY table_name`,
      );
    return result.recordset as TableInfo[];
  } finally {
    await pool.close().catch(() => {});
  }
}

async function mssqlColumns(conn: DbConnection, schema: string, table: string): Promise<ColumnInfo[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mssql = require("mssql") as typeof import("mssql");
  const pool = await mssql.connect(buildMssqlConfig(conn));
  try {
    const result = await pool.request()
      .input("schema", mssql.NVarChar, schema)
      .input("table", mssql.NVarChar, table)
      .query(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_schema = @schema AND table_name = @table
         ORDER BY ordinal_position`,
      );
    return (result.recordset as Array<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>).map((r) => ({
      column_name: r.column_name,
      data_type: r.data_type,
      is_nullable: r.is_nullable === "YES",
      column_default: r.column_default,
    }));
  } finally {
    await pool.close().catch(() => {});
  }
}

function buildMssqlConfig(conn: DbConnection) {
  return {
    server: conn.host ?? "localhost",
    port: conn.port ?? 1433,
    database: conn.database_name ?? undefined,
    user: conn.username ?? undefined,
    password: conn.password ?? undefined,
    options: {
      encrypt: conn.ssl,
      trustServerCertificate: !conn.ssl,
      connectTimeout: 8000,
    },
  };
}

// ---------------------------------------------------------------------------
// Snowflake
// ---------------------------------------------------------------------------
async function snowflakeTest(conn: DbConnection): Promise<TestResult> {
  const snowflake = await import("snowflake-sdk");
  const start = Date.now();
  return new Promise((resolve) => {
    const connection = snowflake.createConnection(buildSnowflakeConfig(conn));
    connection.connect((err) => {
      if (err) {
        resolve({ ok: false, latency_ms: Date.now() - start, error: err.message });
      } else {
        connection.execute({
          sqlText: "SELECT 1",
          complete: (execErr) => {
            connection.destroy(() => {});
            if (execErr) {
              resolve({ ok: false, latency_ms: Date.now() - start, error: execErr.message });
            } else {
              resolve({ ok: true, latency_ms: Date.now() - start });
            }
          },
        });
      }
    });
    setTimeout(() => resolve({ ok: false, latency_ms: 8000, error: "Connection timed out" }), 8000);
  });
}

async function snowflakeSchemas(conn: DbConnection): Promise<SchemaInfo[]> {
  const snowflake = await import("snowflake-sdk");
  return new Promise((resolve, reject) => {
    const connection = snowflake.createConnection(buildSnowflakeConfig(conn));
    connection.connect((err) => {
      if (err) { reject(err); return; }
      connection.execute({
        sqlText: "SHOW SCHEMAS",
        complete: (execErr, _stmt, rows) => {
          connection.destroy(() => {});
          if (execErr) { reject(execErr); return; }
          resolve((rows ?? []).map((r: Record<string, unknown>) => ({ schema: String(r["name"] ?? "") })));
        },
      });
    });
  });
}

async function snowflakeTables(conn: DbConnection, schema: string): Promise<TableInfo[]> {
  const snowflake = await import("snowflake-sdk");
  return new Promise((resolve, reject) => {
    const sfConn = snowflake.createConnection(buildSnowflakeConfig(conn));
    sfConn.connect((err) => {
      if (err) { reject(err); return; }
      sfConn.execute({
        sqlText: `SHOW TABLES IN SCHEMA "${schema}"`,
        complete: (execErr, _stmt, rows) => {
          sfConn.destroy(() => {});
          if (execErr) { reject(execErr); return; }
          resolve((rows ?? []).map((r: Record<string, unknown>) => ({
            table_name: String(r["name"] ?? ""),
            table_type: "BASE TABLE",
          })));
        },
      });
    });
  });
}

async function snowflakeColumns(conn: DbConnection, schema: string, table: string): Promise<ColumnInfo[]> {
  const snowflake = await import("snowflake-sdk");
  return new Promise((resolve, reject) => {
    const sfConn = snowflake.createConnection(buildSnowflakeConfig(conn));
    sfConn.connect((err) => {
      if (err) { reject(err); return; }
      sfConn.execute({
        sqlText: `DESCRIBE TABLE "${schema}"."${table}"`,
        complete: (execErr, _stmt, rows) => {
          sfConn.destroy(() => {});
          if (execErr) { reject(execErr); return; }
          resolve((rows ?? []).map((r: Record<string, unknown>) => ({
            column_name: String(r["name"] ?? ""),
            data_type: String(r["type"] ?? ""),
            is_nullable: String(r["null?"] ?? "Y") === "Y",
            column_default: r["default"] != null ? String(r["default"]) : null,
          })));
        },
      });
    });
  });
}

function buildSnowflakeConfig(conn: DbConnection) {
  const extras = conn.extra_options ? tryParseJson(conn.extra_options) : {};
  return {
    account: String(extras?.account ?? conn.host ?? ""),
    username: conn.username ?? "",
    password: conn.password ?? "",
    database: conn.database_name ?? undefined,
    warehouse: extras?.warehouse as string | undefined,
  };
}

// ---------------------------------------------------------------------------
// Public dispatch functions
// ---------------------------------------------------------------------------
type Dispatcher = {
  test: (c: DbConnection) => Promise<TestResult>;
  schemas: (c: DbConnection) => Promise<SchemaInfo[]>;
  tables: (c: DbConnection, schema: string) => Promise<TableInfo[]>;
  columns: (c: DbConnection, schema: string, table: string) => Promise<ColumnInfo[]>;
};

const DRIVERS: Record<DbDriverType, Dispatcher> = {
  postgresql: { test: pgTest, schemas: pgSchemas, tables: pgTables, columns: pgColumns },
  mysql: { test: mysqlTest, schemas: mysqlSchemas, tables: mysqlTables, columns: mysqlColumns },
  mssql: { test: mssqlTest, schemas: mssqlSchemas, tables: mssqlTables, columns: mssqlColumns },
  snowflake: { test: snowflakeTest, schemas: snowflakeSchemas, tables: snowflakeTables, columns: snowflakeColumns },
  other: {
    test: async () => ({ ok: false, latency_ms: 0, error: "Generic connection strings do not support live schema browsing." }),
    schemas: async () => { throw new Error("Generic connections do not support schema browsing."); },
    tables: async () => { throw new Error("Generic connections do not support schema browsing."); },
    columns: async () => { throw new Error("Generic connections do not support schema browsing."); },
  },
};

function tryParseJson(s: string): Record<string, unknown> | null {
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return null; }
}

export function testConnection(conn: DbConnection): Promise<TestResult> {
  return DRIVERS[conn.driver_type as DbDriverType]?.test(conn)
    ?? Promise.resolve({ ok: false, latency_ms: 0, error: `Unknown driver: ${conn.driver_type}` });
}

export function listSchemas(conn: DbConnection): Promise<SchemaInfo[]> {
  const driver = DRIVERS[conn.driver_type as DbDriverType];
  if (!driver) throw new Error(`Unknown driver: ${conn.driver_type}`);
  return driver.schemas(conn);
}

export function listTables(conn: DbConnection, schema: string): Promise<TableInfo[]> {
  const driver = DRIVERS[conn.driver_type as DbDriverType];
  if (!driver) throw new Error(`Unknown driver: ${conn.driver_type}`);
  return driver.tables(conn, schema);
}

export function listColumns(conn: DbConnection, schema: string, table: string): Promise<ColumnInfo[]> {
  const driver = DRIVERS[conn.driver_type as DbDriverType];
  if (!driver) throw new Error(`Unknown driver: ${conn.driver_type}`);
  return driver.columns(conn, schema, table);
}
