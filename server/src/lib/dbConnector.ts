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
  note?: string;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
function tryParseJson(s: string | null): Record<string, unknown> | null {
  if (!s) return null;
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return null; }
}

function str(v: unknown): string { return String(v ?? ""); }

// ---------------------------------------------------------------------------
// PostgreSQL (also used for Redshift, TimescaleDB)
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
      column_name: string; data_type: string; is_nullable: string; column_default: string | null;
    }>(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [schema, table],
    );
    return res.rows.map((r) => ({
      column_name: r.column_name, data_type: r.data_type,
      is_nullable: r.is_nullable === "YES", column_default: r.column_default,
    }));
  } finally {
    await client.end().catch(() => {});
  }
}

function buildPgConfig(conn: DbConnection) {
  const extras = tryParseJson(conn.extra_options);
  const defaultPort = conn.driver_type === "redshift" ? 5439 : 5432;
  return {
    host: conn.host ?? "localhost",
    port: conn.port ?? defaultPort,
    database: conn.database_name ?? undefined,
    user: conn.username ?? undefined,
    password: conn.password ?? undefined,
    ssl: conn.ssl ? { rejectUnauthorized: extras?.["rejectUnauthorized"] !== false } : false,
    connectionTimeoutMillis: 8000,
  };
}

// ---------------------------------------------------------------------------
// MySQL / MariaDB (mysql2 handles both)
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
    return (rows as Array<Record<string, unknown>>).map((r) => ({ schema: str(r["schema_name"]) }));
  } finally {
    await connection.end().catch(() => {});
  }
}

async function mysqlTables(conn: DbConnection, schema: string): Promise<TableInfo[]> {
  const mysql = await import("mysql2/promise");
  const connection = await mysql.createConnection(buildMysqlConfig(conn));
  try {
    const [rows] = await connection.query(
      `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name`,
      [schema],
    );
    return (rows as Array<Record<string, unknown>>).map((r) => ({
      table_name: str(r["table_name"]), table_type: str(r["table_type"]),
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
       FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position`,
      [schema, table],
    );
    return (rows as Array<Record<string, unknown>>).map((r) => ({
      column_name: str(r["column_name"]), data_type: str(r["data_type"]),
      is_nullable: str(r["is_nullable"]) === "YES", column_default: r["column_default"] != null ? str(r["column_default"]) : null,
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
// SQL Server (mssql) — also used for Azure SQL
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
       WHERE SCHEMA_NAME NOT IN ('sys','INFORMATION_SCHEMA','guest',
         'db_owner','db_accessadmin','db_securityadmin','db_ddladmin',
         'db_backupoperator','db_datareader','db_datawriter',
         'db_denydatareader','db_denydatawriter')
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
      .query(`SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = @schema ORDER BY table_name`);
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
      .query(`SELECT column_name, data_type, is_nullable, column_default
              FROM information_schema.columns
              WHERE table_schema = @schema AND table_name = @table
              ORDER BY ordinal_position`);
    return (result.recordset as Array<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }>)
      .map((r) => ({
        column_name: r.column_name, data_type: r.data_type,
        is_nullable: r.is_nullable === "YES", column_default: r.column_default,
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
    options: { encrypt: conn.ssl, trustServerCertificate: !conn.ssl, connectTimeout: 8000 },
  };
}

// ---------------------------------------------------------------------------
// Oracle — uses thin mode (no Oracle Instant Client required)
// ---------------------------------------------------------------------------
async function oracleTest(conn: DbConnection): Promise<TestResult> {
  const oracledb = await import("oracledb");
  const start = Date.now();
  let connection: import("oracledb").Connection | undefined;
  try {
    connection = await oracledb.getConnection(buildOracleConfig(conn));
    await connection.execute("SELECT 1 FROM DUAL");
    return { ok: true, latency_ms: Date.now() - start };
  } catch (e) {
    return { ok: false, latency_ms: Date.now() - start, error: String(e) };
  } finally {
    await connection?.close().catch(() => {});
  }
}

async function oracleSchemas(conn: DbConnection): Promise<SchemaInfo[]> {
  const oracledb = await import("oracledb");
  const connection = await oracledb.getConnection(buildOracleConfig(conn));
  try {
    const result = await connection.execute<[string]>(
      `SELECT USERNAME FROM ALL_USERS ORDER BY USERNAME`,
      [], { outFormat: oracledb.OUT_FORMAT_ARRAY },
    );
    return (result.rows ?? []).map((r) => ({ schema: r[0] }));
  } finally {
    await connection.close().catch(() => {});
  }
}

async function oracleTables(conn: DbConnection, schema: string): Promise<TableInfo[]> {
  const oracledb = await import("oracledb");
  const connection = await oracledb.getConnection(buildOracleConfig(conn));
  try {
    const result = await connection.execute<[string, string]>(
      `SELECT TABLE_NAME, 'BASE TABLE' AS TABLE_TYPE FROM ALL_TABLES WHERE OWNER = :1 ORDER BY TABLE_NAME`,
      [schema.toUpperCase()], { outFormat: oracledb.OUT_FORMAT_ARRAY },
    );
    return (result.rows ?? []).map((r) => ({ table_name: r[0], table_type: r[1] }));
  } finally {
    await connection.close().catch(() => {});
  }
}

async function oracleColumns(conn: DbConnection, schema: string, table: string): Promise<ColumnInfo[]> {
  const oracledb = await import("oracledb");
  const connection = await oracledb.getConnection(buildOracleConfig(conn));
  try {
    const result = await connection.execute<[string, string, string, string]>(
      `SELECT COLUMN_NAME, DATA_TYPE, NULLABLE, DATA_DEFAULT
       FROM ALL_TAB_COLUMNS WHERE OWNER = :1 AND TABLE_NAME = :2
       ORDER BY COLUMN_ID`,
      [schema.toUpperCase(), table.toUpperCase()], { outFormat: oracledb.OUT_FORMAT_ARRAY },
    );
    return (result.rows ?? []).map((r) => ({
      column_name: r[0], data_type: r[1],
      is_nullable: r[2] === "Y", column_default: r[3] ?? null,
    }));
  } finally {
    await connection.close().catch(() => {});
  }
}

function buildOracleConfig(conn: DbConnection) {
  const extras = tryParseJson(conn.extra_options);
  const serviceName = conn.database_name ?? extras?.["serviceName"] ?? extras?.["service_name"];
  const connectString = serviceName
    ? `${conn.host ?? "localhost"}:${conn.port ?? 1521}/${serviceName}`
    : `${conn.host ?? "localhost"}:${conn.port ?? 1521}`;
  return {
    user: conn.username ?? "",
    password: conn.password ?? "",
    connectString,
  };
}

// ---------------------------------------------------------------------------
// SAP HANA — hdb pure-JS driver
// ---------------------------------------------------------------------------
async function hanaTest(conn: DbConnection): Promise<TestResult> {
  const start = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const hdb = require("hdb") as { createClient: (opts: Record<string, unknown>) => { connect: (cb: (err: Error | null) => void) => void; disconnect: () => void } };
  return new Promise((resolve) => {
    const client = hdb.createClient(buildHanaConfig(conn));
    const timer = setTimeout(() => resolve({ ok: false, latency_ms: 8000, error: "Connection timed out" }), 8000);
    client.connect((err) => {
      clearTimeout(timer);
      client.disconnect();
      if (err) resolve({ ok: false, latency_ms: Date.now() - start, error: err.message });
      else resolve({ ok: true, latency_ms: Date.now() - start });
    });
  });
}

async function hanaQuery<T>(conn: DbConnection, sql: string, params: unknown[] = []): Promise<T[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const hdb = require("hdb") as { createClient: (opts: Record<string, unknown>) => { connect: (cb: (err: Error | null) => void) => void; exec: (sql: string, params: unknown[], cb: (err: Error | null, rows: unknown[]) => void) => void; disconnect: () => void } };
  return new Promise((resolve, reject) => {
    const client = hdb.createClient(buildHanaConfig(conn));
    client.connect((err) => {
      if (err) { reject(err); return; }
      client.exec(sql, params, (execErr, rows) => {
        client.disconnect();
        if (execErr) reject(execErr);
        else resolve(rows as T[]);
      });
    });
  });
}

async function hanaSchemas(conn: DbConnection): Promise<SchemaInfo[]> {
  const rows = await hanaQuery<Record<string, unknown>>(
    conn,
    `SELECT SCHEMA_NAME FROM SYS.SCHEMAS WHERE IS_USER_CREATED = 'TRUE' ORDER BY SCHEMA_NAME`,
  );
  return rows.map((r) => ({ schema: str(r["SCHEMA_NAME"]) }));
}

async function hanaTables(conn: DbConnection, schema: string): Promise<TableInfo[]> {
  const rows = await hanaQuery<Record<string, unknown>>(
    conn,
    `SELECT TABLE_NAME, TABLE_TYPE FROM SYS.TABLES WHERE SCHEMA_NAME = ? ORDER BY TABLE_NAME`,
    [schema],
  );
  return rows.map((r) => ({ table_name: str(r["TABLE_NAME"]), table_type: str(r["TABLE_TYPE"]) }));
}

async function hanaColumns(conn: DbConnection, schema: string, table: string): Promise<ColumnInfo[]> {
  const rows = await hanaQuery<Record<string, unknown>>(
    conn,
    `SELECT COLUMN_NAME, DATA_TYPE_NAME, IS_NULLABLE, DEFAULT_VALUE
     FROM SYS.TABLE_COLUMNS WHERE SCHEMA_NAME = ? AND TABLE_NAME = ? ORDER BY POSITION`,
    [schema, table],
  );
  return rows.map((r) => ({
    column_name: str(r["COLUMN_NAME"]), data_type: str(r["DATA_TYPE_NAME"]),
    is_nullable: str(r["IS_NULLABLE"]) === "TRUE", column_default: r["DEFAULT_VALUE"] != null ? str(r["DEFAULT_VALUE"]) : null,
  }));
}

function buildHanaConfig(conn: DbConnection): Record<string, unknown> {
  return {
    host: conn.host ?? "localhost",
    port: conn.port ?? 30015,
    user: conn.username ?? "",
    password: conn.password ?? "",
    ...(conn.database_name ? { databaseName: conn.database_name } : {}),
    useTLS: conn.ssl,
  };
}

// ---------------------------------------------------------------------------
// MongoDB
// ---------------------------------------------------------------------------
async function mongoTest(conn: DbConnection): Promise<TestResult> {
  const { MongoClient } = await import("mongodb");
  const start = Date.now();
  const client = new MongoClient(buildMongoUri(conn), { serverSelectionTimeoutMS: 8000 });
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    return { ok: true, latency_ms: Date.now() - start };
  } catch (e) {
    return { ok: false, latency_ms: Date.now() - start, error: String(e) };
  } finally {
    await client.close().catch(() => {});
  }
}

async function mongoSchemas(conn: DbConnection): Promise<SchemaInfo[]> {
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(buildMongoUri(conn), { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  try {
    const result = await client.db().admin().listDatabases();
    const system = new Set(["admin", "local", "config"]);
    return result.databases
      .filter((d) => !system.has(d.name))
      .map((d) => ({ schema: d.name }));
  } finally {
    await client.close().catch(() => {});
  }
}

async function mongoTables(conn: DbConnection, schema: string): Promise<TableInfo[]> {
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(buildMongoUri(conn), { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  try {
    const collections = await client.db(schema).listCollections().toArray();
    return collections.map((c) => ({ table_name: c.name, table_type: c.type ?? "collection" }));
  } finally {
    await client.close().catch(() => {});
  }
}

async function mongoColumns(conn: DbConnection, schema: string, table: string): Promise<ColumnInfo[]> {
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(buildMongoUri(conn), { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  try {
    const sample = await client.db(schema).collection(table)
      .aggregate([{ $sample: { size: 20 } }, { $project: { _id: 0 } }])
      .toArray();
    const fields = new Map<string, string>();
    for (const doc of sample) {
      flattenMongoDoc(doc, "", fields);
    }
    return Array.from(fields.entries()).map(([name, type]) => ({
      column_name: name, data_type: type, is_nullable: true, column_default: null,
    }));
  } finally {
    await client.close().catch(() => {});
  }
}

function flattenMongoDoc(obj: Record<string, unknown>, prefix: string, out: Map<string, string>) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    const type = v === null ? "null" : typeof v === "object" && !Array.isArray(v) ? "object" : Array.isArray(v) ? "array" : typeof v;
    if (!out.has(key)) out.set(key, type);
    if (v !== null && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length < 10) {
      flattenMongoDoc(v as Record<string, unknown>, key, out);
    }
  }
}

function buildMongoUri(conn: DbConnection): string {
  const extras = tryParseJson(conn.extra_options);
  const authSource = extras?.["authSource"] as string ?? "admin";
  const replicaSet = extras?.["replicaSet"] as string | undefined;
  const base = `${conn.host ?? "localhost"}:${conn.port ?? 27017}`;
  const auth = conn.username ? `${encodeURIComponent(conn.username)}:${encodeURIComponent(conn.password ?? "")}@` : "";
  const db = conn.database_name ?? "";
  const qs = new URLSearchParams();
  qs.set("authSource", authSource);
  if (replicaSet) qs.set("replicaSet", replicaSet);
  if (conn.ssl) qs.set("tls", "true");
  return `mongodb://${auth}${base}/${db}?${qs.toString()}`;
}

// ---------------------------------------------------------------------------
// InfluxDB v2
// ---------------------------------------------------------------------------
async function influxTest(conn: DbConnection): Promise<TestResult> {
  const { InfluxDB } = await import("@influxdata/influxdb-client");
  const start = Date.now();
  try {
    const client = new InfluxDB(buildInfluxConfig(conn));
    const queryApi = client.getQueryApi(conn.username ?? "");
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out")), 8000);
      queryApi.queryLines(`buckets()`, {
        next: () => { clearTimeout(timeout); resolve(); },
        error: (e) => { clearTimeout(timeout); reject(e); },
        complete: () => { clearTimeout(timeout); resolve(); },
      });
    });
    return { ok: true, latency_ms: Date.now() - start };
  } catch (e) {
    return { ok: false, latency_ms: Date.now() - start, error: String(e) };
  }
}

async function influxSchemas(conn: DbConnection): Promise<SchemaInfo[]> {
  const { InfluxDB } = await import("@influxdata/influxdb-client");
  const client = new InfluxDB(buildInfluxConfig(conn));
  const queryApi = client.getQueryApi(conn.username ?? "");
  const rows: string[] = [];
  await new Promise<void>((resolve, reject) => {
    queryApi.queryLines(`import "influxdata/influxdb/schema"\nschema.buckets()`, {
      next: (line) => { rows.push(line); },
      error: reject,
      complete: resolve,
    });
  });
  const names = rows
    .filter((l) => l.startsWith(",_result") === false && l.includes("name"))
    .map((l) => {
      const parts = l.split(",");
      return parts[parts.length - 2] ?? "";
    })
    .filter(Boolean);
  return [...new Set(names)].map((n) => ({ schema: n }));
}

async function influxTables(conn: DbConnection, schema: string): Promise<TableInfo[]> {
  const { InfluxDB } = await import("@influxdata/influxdb-client");
  const client = new InfluxDB(buildInfluxConfig(conn));
  const queryApi = client.getQueryApi(conn.username ?? "");
  const rows: string[] = [];
  await new Promise<void>((resolve, reject) => {
    queryApi.queryLines(
      `import "influxdata/influxdb/schema"\nschema.measurements(bucket: "${schema}")`,
      { next: (l) => { rows.push(l); }, error: reject, complete: resolve },
    );
  });
  const names = rows
    .filter((l) => !l.startsWith("#") && l.includes(","))
    .map((l) => l.split(",").pop()?.trim() ?? "")
    .filter(Boolean);
  return [...new Set(names)].map((n) => ({ table_name: n, table_type: "measurement" }));
}

async function influxColumns(conn: DbConnection, schema: string, table: string): Promise<ColumnInfo[]> {
  const { InfluxDB } = await import("@influxdata/influxdb-client");
  const client = new InfluxDB(buildInfluxConfig(conn));
  const queryApi = client.getQueryApi(conn.username ?? "");
  const rows: string[] = [];
  await new Promise<void>((resolve, reject) => {
    queryApi.queryLines(
      `import "influxdata/influxdb/schema"\nschema.fieldKeys(bucket: "${schema}", predicate: (r) => r["_measurement"] == "${table}")`,
      { next: (l) => { rows.push(l); }, error: reject, complete: resolve },
    );
  });
  const fields = rows
    .filter((l) => !l.startsWith("#") && l.includes(","))
    .map((l) => l.split(",").pop()?.trim() ?? "")
    .filter(Boolean);
  return [...new Set(fields)].map((f) => ({
    column_name: f, data_type: "field", is_nullable: true, column_default: null,
  }));
}

function buildInfluxConfig(conn: DbConnection) {
  return {
    url: conn.host ?? "http://localhost:8086",
    token: conn.password ?? "",
  };
}

// ---------------------------------------------------------------------------
// Cassandra
// ---------------------------------------------------------------------------
async function cassandraTest(conn: DbConnection): Promise<TestResult> {
  const cassandra = await import("cassandra-driver");
  const start = Date.now();
  const client = new cassandra.Client(buildCassandraConfig(conn));
  try {
    await client.connect();
    await client.execute("SELECT release_version FROM system.local");
    return { ok: true, latency_ms: Date.now() - start };
  } catch (e) {
    return { ok: false, latency_ms: Date.now() - start, error: String(e) };
  } finally {
    await client.shutdown().catch(() => {});
  }
}

async function cassandraSchemas(conn: DbConnection): Promise<SchemaInfo[]> {
  const cassandra = await import("cassandra-driver");
  const client = new cassandra.Client(buildCassandraConfig(conn));
  await client.connect();
  try {
    const result = await client.execute(
      `SELECT keyspace_name FROM system_schema.keyspaces`,
    );
    const system = new Set(["system","system_auth","system_schema","system_distributed","system_traces"]);
    return result.rows
      .filter((r) => !system.has(r["keyspace_name"] as string))
      .map((r) => ({ schema: r["keyspace_name"] as string }));
  } finally {
    await client.shutdown().catch(() => {});
  }
}

async function cassandraTables(conn: DbConnection, schema: string): Promise<TableInfo[]> {
  const cassandra = await import("cassandra-driver");
  const client = new cassandra.Client(buildCassandraConfig(conn));
  await client.connect();
  try {
    const result = await client.execute(
      `SELECT table_name FROM system_schema.tables WHERE keyspace_name = ?`,
      [schema],
    );
    return result.rows.map((r) => ({ table_name: r["table_name"] as string, table_type: "table" }));
  } finally {
    await client.shutdown().catch(() => {});
  }
}

async function cassandraColumns(conn: DbConnection, schema: string, table: string): Promise<ColumnInfo[]> {
  const cassandra = await import("cassandra-driver");
  const client = new cassandra.Client(buildCassandraConfig(conn));
  await client.connect();
  try {
    const result = await client.execute(
      `SELECT column_name, type FROM system_schema.columns WHERE keyspace_name = ? AND table_name = ?`,
      [schema, table],
    );
    return result.rows.map((r) => ({
      column_name: r["column_name"] as string, data_type: r["type"] as string,
      is_nullable: true, column_default: null,
    }));
  } finally {
    await client.shutdown().catch(() => {});
  }
}

function buildCassandraConfig(conn: DbConnection) {
  const extras = tryParseJson(conn.extra_options);
  const hosts = (conn.host ?? "localhost").split(",").map((h) => h.trim());
  const config: Record<string, unknown> = {
    contactPoints: hosts,
    localDataCenter: str(extras?.["datacenter"] ?? "datacenter1"),
    protocolOptions: { port: conn.port ?? 9042 },
  };
  if (conn.username) {
    config["credentials"] = { username: conn.username, password: conn.password ?? "" };
  }
  if (conn.database_name) config["keyspace"] = conn.database_name;
  return config;
}

// ---------------------------------------------------------------------------
// Redis (ioredis) — key-value, no schema browse
// ---------------------------------------------------------------------------
async function redisTest(conn: DbConnection): Promise<TestResult> {
  const { default: Redis } = await import("ioredis");
  const start = Date.now();
  const extras = tryParseJson(conn.extra_options);
  const redis = new Redis({
    host: conn.host ?? "localhost",
    port: conn.port ?? 6379,
    password: conn.password ?? undefined,
    db: extras?.["db"] as number ?? 0,
    tls: conn.ssl ? {} : undefined,
    lazyConnect: true,
    connectTimeout: 8000,
  });
  try {
    await redis.connect();
    await redis.ping();
    return { ok: true, latency_ms: Date.now() - start, note: "Redis is a key-value store. Schema browsing is not available." };
  } catch (e) {
    return { ok: false, latency_ms: Date.now() - start, error: String(e) };
  } finally {
    redis.disconnect();
  }
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
      if (err) { resolve({ ok: false, latency_ms: Date.now() - start, error: err.message }); return; }
      connection.execute({
        sqlText: "SELECT 1",
        complete: (execErr) => {
          connection.destroy(() => {});
          if (execErr) resolve({ ok: false, latency_ms: Date.now() - start, error: execErr.message });
          else resolve({ ok: true, latency_ms: Date.now() - start });
        },
      });
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
          resolve((rows ?? []).map((r: Record<string, unknown>) => ({ schema: str(r["name"]) })));
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
          resolve((rows ?? []).map((r: Record<string, unknown>) => ({ table_name: str(r["name"]), table_type: "BASE TABLE" })));
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
            column_name: str(r["name"]), data_type: str(r["type"]),
            is_nullable: str(r["null?"]) === "Y", column_default: r["default"] != null ? str(r["default"]) : null,
          })));
        },
      });
    });
  });
}

function buildSnowflakeConfig(conn: DbConnection) {
  const extras = tryParseJson(conn.extra_options);
  return {
    account: str(extras?.["account"] ?? conn.host ?? ""),
    username: conn.username ?? "",
    password: conn.password ?? "",
    database: conn.database_name ?? undefined,
    warehouse: str(extras?.["warehouse"] ?? ""),
  };
}

// ---------------------------------------------------------------------------
// DB2 — ibm_db (requires IBM DB2 CLI / Data Server Driver)
// ---------------------------------------------------------------------------
async function db2Test(conn: DbConnection): Promise<TestResult> {
  const start = Date.now();
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ibmdb = require("ibm_db") as { open: (cs: string, cb: (err: Error | null, db: { close: (cb: () => void) => void }) => void) => void };
    const cs = buildDb2ConnectionString(conn);
    return await new Promise<TestResult>((resolve) => {
      ibmdb.open(cs, (err, db) => {
        if (err) { resolve({ ok: false, latency_ms: Date.now() - start, error: err.message }); return; }
        db.close(() => resolve({ ok: true, latency_ms: Date.now() - start }));
      });
    });
  } catch {
    return { ok: false, latency_ms: Date.now() - start, error: "ibm_db package is not installed. Run: npm install ibm_db (requires IBM DB2 CLI or IBM Data Server Driver)" };
  }
}

async function db2NotAvailable(): Promise<SchemaInfo[]> {
  throw new Error("DB2 schema browsing requires the ibm_db package. Run: npm install ibm_db");
}

function buildDb2ConnectionString(conn: DbConnection): string {
  return `DATABASE=${conn.database_name ?? ""};HOSTNAME=${conn.host ?? "localhost"};PORT=${conn.port ?? 50000};PROTOCOL=TCPIP;UID=${conn.username ?? ""};PWD=${conn.password ?? ""};`;
}

// ---------------------------------------------------------------------------
// ODBC — generic (requires system ODBC driver manager + appropriate drivers)
// ---------------------------------------------------------------------------
async function odbcTest(conn: DbConnection): Promise<TestResult> {
  const start = Date.now();
  try {
    const extras = tryParseJson(conn.extra_options);
    const dsn = str(extras?.["dsn"] ?? extras?.["connectionString"] ?? "");
    if (!dsn) return { ok: false, latency_ms: 0, error: "No DSN or connection string configured. Add {\"dsn\": \"...\"}  to the Options field." };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const odbc = require("odbc") as { connect: (cs: string) => Promise<{ close: () => Promise<void> }> };
    const connection = await odbc.connect(dsn);
    await connection.close();
    return { ok: true, latency_ms: Date.now() - start, note: "ODBC schema browsing is not available — use for connection testing only." };
  } catch (e) {
    const msg = String(e);
    if (msg.includes("Cannot find module")) {
      return { ok: false, latency_ms: Date.now() - start, error: "odbc package is not installed. Run: npm install odbc (requires unixODBC or Windows ODBC Manager)" };
    }
    return { ok: false, latency_ms: Date.now() - start, error: msg };
  }
}

// ---------------------------------------------------------------------------
// BigQuery stub (requires @google-cloud/bigquery + service-account)
// ---------------------------------------------------------------------------
async function bigqueryTest(conn: DbConnection): Promise<TestResult> {
  const start = Date.now();
  try {
    const extras = tryParseJson(conn.extra_options);
    const projectId = conn.database_name ?? str(extras?.["projectId"]);
    if (!projectId) return { ok: false, latency_ms: 0, error: "Set the 'Database' field to your GCP project ID." };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BigQuery } = require("@google-cloud/bigquery") as { BigQuery: new (opts: Record<string, unknown>) => { query: (q: string) => Promise<unknown[][]> } };
    const bq = new BigQuery({ projectId, keyFilename: str(extras?.["keyFile"] ?? "") || undefined });
    await bq.query("SELECT 1");
    return { ok: true, latency_ms: Date.now() - start };
  } catch (e) {
    const msg = String(e);
    if (msg.includes("Cannot find module")) {
      return { ok: false, latency_ms: Date.now() - start, error: "BigQuery package not installed. Run: npm install @google-cloud/bigquery" };
    }
    return { ok: false, latency_ms: Date.now() - start, error: msg };
  }
}

async function bigqueryNotAvailable(): Promise<SchemaInfo[]> {
  throw new Error("BigQuery schema browsing requires the @google-cloud/bigquery package and service-account credentials. Run: npm install @google-cloud/bigquery");
}

// ---------------------------------------------------------------------------
// Public dispatch
// ---------------------------------------------------------------------------
type Dispatcher = {
  test: (c: DbConnection) => Promise<TestResult>;
  schemas: (c: DbConnection) => Promise<SchemaInfo[]>;
  tables: (c: DbConnection, schema: string) => Promise<TableInfo[]>;
  columns: (c: DbConnection, schema: string, table: string) => Promise<ColumnInfo[]>;
};

const noSchema = (msg: string) => async (): Promise<never> => { throw new Error(msg); };

const DRIVERS: Record<DbDriverType, Dispatcher> = {
  // ---- SQL (native implementations) ----
  postgresql: { test: pgTest, schemas: pgSchemas, tables: pgTables, columns: pgColumns },
  mysql:      { test: mysqlTest, schemas: mysqlSchemas, tables: mysqlTables, columns: mysqlColumns },
  mssql:      { test: mssqlTest, schemas: mssqlSchemas, tables: mssqlTables, columns: mssqlColumns },
  oracle:     { test: oracleTest, schemas: oracleSchemas, tables: oracleTables, columns: oracleColumns },
  hana:       { test: hanaTest, schemas: hanaSchemas, tables: hanaTables, columns: hanaColumns },
  // ---- SQL aliases (reuse existing drivers) ----
  redshift:    { test: pgTest, schemas: pgSchemas, tables: pgTables, columns: pgColumns },
  timescaledb: { test: pgTest, schemas: pgSchemas, tables: pgTables, columns: pgColumns },
  "azure-sql": { test: mssqlTest, schemas: mssqlSchemas, tables: mssqlTables, columns: mssqlColumns },
  mariadb:     { test: mysqlTest, schemas: mysqlSchemas, tables: mysqlTables, columns: mysqlColumns },
  // ---- Requires optional native packages ----
  db2: { test: db2Test, schemas: db2NotAvailable, tables: db2NotAvailable as unknown as Dispatcher["tables"], columns: db2NotAvailable as unknown as Dispatcher["columns"] },
  odbc: { test: odbcTest, schemas: noSchema("ODBC connections do not support schema browsing."), tables: noSchema("ODBC connections do not support schema browsing."), columns: noSchema("ODBC connections do not support schema browsing.") },
  bigquery: { test: bigqueryTest, schemas: bigqueryNotAvailable, tables: bigqueryNotAvailable as unknown as Dispatcher["tables"], columns: bigqueryNotAvailable as unknown as Dispatcher["columns"] },
  // ---- Cloud / Warehouse ----
  snowflake: { test: snowflakeTest, schemas: snowflakeSchemas, tables: snowflakeTables, columns: snowflakeColumns },
  // ---- Time Series ----
  influxdb: { test: influxTest, schemas: influxSchemas, tables: influxTables, columns: influxColumns },
  // ---- NoSQL ----
  mongodb:   { test: mongoTest, schemas: mongoSchemas, tables: mongoTables, columns: mongoColumns },
  cassandra: { test: cassandraTest, schemas: cassandraSchemas, tables: cassandraTables, columns: cassandraColumns },
  redis:     { test: redisTest, schemas: noSchema("Redis is a key-value store — schema browsing is not applicable."), tables: noSchema("Redis is a key-value store."), columns: noSchema("Redis is a key-value store.") },
  // ---- Catch-all ----
  other: {
    test: async () => ({ ok: false, latency_ms: 0, error: "Generic connections do not support live testing. Save for documentation purposes." }),
    schemas: noSchema("Generic connections do not support schema browsing."),
    tables: noSchema("Generic connections do not support schema browsing."),
    columns: noSchema("Generic connections do not support schema browsing."),
  },
};

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
