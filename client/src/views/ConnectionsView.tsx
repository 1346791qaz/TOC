import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Database,
  Edit2,
  Info,
  Loader2,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";
import type { DbConnection, DbDriverType } from "@shared/schemas";
import { useCreate, useList, useSoftDelete, useUpdate } from "@/lib/queries";
import { ViewShell, EmptyHint } from "@/components/ViewShell";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Driver metadata
// ---------------------------------------------------------------------------

interface DriverMeta {
  label: string;
  color: string;
  defaultPort: number | null;
  /** Short note shown in the form (install prereqs, alias behaviour, etc.) */
  note?: string;
  /** If true the "Test" button in the list will be disabled */
  noLiveTest?: boolean;
}

const DRIVER_META: Record<DbDriverType, DriverMeta> = {
  // Relational SQL
  postgresql:  { label: "PostgreSQL",       color: "text-blue-400",     defaultPort: 5432 },
  mysql:       { label: "MySQL",            color: "text-orange-400",   defaultPort: 3306 },
  mssql:       { label: "SQL Server",       color: "text-sky-400",      defaultPort: 1433 },
  oracle:      { label: "Oracle DB",        color: "text-red-400",      defaultPort: 1521,
    note: "Uses oracledb thin mode — no Oracle Instant Client required." },
  db2:         { label: "IBM Db2",          color: "text-purple-400",   defaultPort: 50000,
    note: "Requires the ibm_db native package. Run: npm install ibm_db  (needs IBM CLI Driver).",
    noLiveTest: false },
  hana:        { label: "SAP HANA",         color: "text-emerald-400",  defaultPort: 39015,
    note: "Uses the pure-JS hdb driver. No SAP client installation needed." },
  odbc:        { label: "ODBC (DSN)",       color: "text-yellow-400",   defaultPort: null,
    note: "Requires the odbc package and a system DSN configured via ODBC Data Source Administrator.",
    noLiveTest: false },
  // Cloud DW
  snowflake:   { label: "Snowflake",        color: "text-cyan-400",     defaultPort: null },
  bigquery:    { label: "BigQuery",         color: "text-green-400",    defaultPort: null,
    note: "Requires @google-cloud/bigquery and a service-account JSON key file.",
    noLiveTest: false },
  // SQL aliases (served by an existing driver)
  redshift:    { label: "Amazon Redshift",  color: "text-orange-300",   defaultPort: 5439,
    note: "Uses the PostgreSQL driver (pg). Enter your Redshift endpoint as the host." },
  "azure-sql": { label: "Azure SQL",        color: "text-sky-300",      defaultPort: 1433,
    note: "Uses the SQL Server driver (mssql). Enter your Azure SQL server hostname." },
  timescaledb: { label: "TimescaleDB",      color: "text-blue-300",     defaultPort: 5432,
    note: "Uses the PostgreSQL driver (pg). Connect exactly as you would to Postgres." },
  mariadb:     { label: "MariaDB",          color: "text-orange-300",   defaultPort: 3306,
    note: "Uses the MySQL driver (mysql2). Fully compatible with standard MySQL connections." },
  // Time Series / IoT
  influxdb:    { label: "InfluxDB v2",      color: "text-pink-400",     defaultPort: 8086,
    note: "Enter the InfluxDB URL as host (e.g. http://localhost:8086). Token goes in Password. Org goes in Extra options." },
  // NoSQL
  mongodb:     { label: "MongoDB",          color: "text-green-500",    defaultPort: 27017,
    note: "Columns are discovered by sampling 20 documents per collection." },
  cassandra:   { label: "Cassandra",        color: "text-yellow-300",   defaultPort: 9042,
    note: "Enter a single contact point as host. Datacenter goes in Extra options." },
  redis:       { label: "Redis",            color: "text-red-400",      defaultPort: 6379,
    note: "Schema browse is not available for Redis — only connection testing is supported." },
  // Catch-all
  other:       { label: "Other / Reference",color: "text-muted-foreground", defaultPort: null,
    note: "Saved for documentation only. No live testing or schema browsing is available.",
    noLiveTest: true },
};

// Grouped for the picker
const DRIVER_GROUPS: { label: string; drivers: DbDriverType[] }[] = [
  { label: "Relational SQL",        drivers: ["postgresql", "mysql", "mssql", "oracle", "db2", "hana", "odbc"] },
  { label: "Cloud Data Warehouse",  drivers: ["snowflake", "bigquery"] },
  { label: "SQL Aliases",           drivers: ["redshift", "azure-sql", "timescaledb", "mariadb"] },
  { label: "Time Series / IoT",     drivers: ["influxdb"] },
  { label: "NoSQL",                 drivers: ["mongodb", "cassandra", "redis"] },
  { label: "Other",                 drivers: ["other"] },
];

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

interface ConnectionFormState {
  name: string;
  driver_type: DbDriverType;
  host: string;
  port: string;
  database_name: string;
  username: string;
  password: string;
  ssl: boolean;
  extra_options: string;
}

function emptyForm(driver: DbDriverType = "postgresql"): ConnectionFormState {
  const port = DRIVER_META[driver].defaultPort;
  return { name: "", driver_type: driver, host: "", port: port != null ? String(port) : "", database_name: "", username: "", password: "", ssl: false, extra_options: "" };
}

function formToPayload(f: ConnectionFormState, vsId: string) {
  return {
    value_stream_id: vsId,
    name: f.name,
    driver_type: f.driver_type,
    host:          f.host          || null,
    port:          f.port          ? Number(f.port) : null,
    database_name: f.database_name || null,
    username:      f.username      || null,
    password:      f.password      || null,
    ssl:           f.ssl,
    extra_options: f.extra_options || null,
  };
}

// ---------------------------------------------------------------------------
// ConnectionForm
// ---------------------------------------------------------------------------

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </label>
  );
}

function Field({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

function TextInput({ value, onChange, placeholder, type = "text", autoComplete }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; autoComplete?: string;
}) {
  return (
    <input
      type={type}
      autoComplete={autoComplete}
      className="w-full rounded-md border border-border bg-input px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function ConnectionForm({ initial, onSave, onCancel, saving, error }: {
  initial: ConnectionFormState;
  onSave: (f: ConnectionFormState) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState<ConnectionFormState>(initial);

  function set(key: keyof ConnectionFormState, value: string | boolean) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "driver_type") {
        const port = DRIVER_META[value as DbDriverType].defaultPort;
        next.port = port != null ? String(port) : "";
        next.extra_options = "";
      }
      return next;
    });
  }

  const meta = DRIVER_META[form.driver_type];

  // Drivers that use host as something other than a hostname
  const isSnowflake  = form.driver_type === "snowflake";
  const isInfluxDB   = form.driver_type === "influxdb";
  const isODBC       = form.driver_type === "odbc";
  const isOther      = form.driver_type === "other";
  const isOracle     = form.driver_type === "oracle";
  const isBigQuery   = form.driver_type === "bigquery";
  const isRedis      = form.driver_type === "redis";
  const isMongoDB    = form.driver_type === "mongodb";
  const isCassandra  = form.driver_type === "cassandra";

  // Drivers that don't use username/password in the typical way
  const noCredentials = isRedis;   // Redis uses only password
  const noUsername    = isRedis;

  return (
    <div className="space-y-4">
      {/* Driver picker */}
      <div>
        <Label>Database type</Label>
        <div className="max-h-52 overflow-y-auto rounded-md border border-border bg-input p-2 space-y-3">
          {DRIVER_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {group.label}
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {group.drivers.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => set("driver_type", d)}
                    className={cn(
                      "flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-left text-xs transition-colors",
                      form.driver_type === d
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <Database size={11} className={cn("shrink-0", DRIVER_META[d].color)} />
                    <span className="truncate">{DRIVER_META[d].label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Driver note */}
      {meta.note && (
        <div className="flex gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <Info size={13} className="mt-0.5 shrink-0" />
          <span>{meta.note}</span>
        </div>
      )}

      {/* Connection name */}
      <Field>
        <Label>Connection name <span className="text-status-critical">*</span></Label>
        <TextInput
          value={form.name}
          onChange={(v) => set("name", v)}
          placeholder={`e.g. Production ${meta.label.split(" ")[0]}`}
        />
      </Field>

      {/* ---- Driver-specific fields ---- */}

      {isOther && (
        <Field>
          <Label>Notes / reference info</Label>
          <textarea
            rows={3}
            className="w-full rounded-md border border-border bg-input px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            placeholder="Paste a redacted connection string or describe the system…"
            value={form.extra_options}
            onChange={(e) => set("extra_options", e.target.value)}
          />
        </Field>
      )}

      {isODBC && (
        <>
          <Field>
            <Label>DSN name</Label>
            <TextInput value={form.host} onChange={(v) => set("host", v)} placeholder="MyDSN" />
            <p className="mt-1 text-xs text-muted-foreground">
              The DSN must be configured in the system ODBC Data Source Administrator before use.
            </p>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <Label>Username</Label>
              <TextInput value={form.username} onChange={(v) => set("username", v)} autoComplete="username" />
            </Field>
            <Field>
              <Label>Password</Label>
              <TextInput type="password" value={form.password} onChange={(v) => set("password", v)} autoComplete="current-password" />
            </Field>
          </div>
        </>
      )}

      {isBigQuery && (
        <>
          <Field>
            <Label>GCP Project ID</Label>
            <TextInput value={form.database_name} onChange={(v) => set("database_name", v)} placeholder="my-gcp-project" />
          </Field>
          <Field>
            <Label>Service account key file path</Label>
            <TextInput value={form.extra_options} onChange={(v) => set("extra_options", v)} placeholder="/etc/keys/bigquery-sa.json" />
            <p className="mt-1 text-xs text-muted-foreground">
              Absolute path on the server where the JSON key file lives. Install @google-cloud/bigquery to enable browsing.
            </p>
          </Field>
        </>
      )}

      {isSnowflake && (
        <>
          <Field>
            <Label>Account identifier</Label>
            <TextInput value={form.host} onChange={(v) => set("host", v)} placeholder="orgname-accountname" />
            <p className="mt-1 text-xs text-muted-foreground">
              Found in your Snowflake URL: <span className="font-mono">https://&lt;account&gt;.snowflakecomputing.com</span>
            </p>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <Label>Database</Label>
              <TextInput value={form.database_name} onChange={(v) => set("database_name", v)} placeholder="MY_DB" />
            </Field>
            <Field>
              <Label>Warehouse</Label>
              <TextInput value={form.extra_options} onChange={(v) => set("extra_options", v)} placeholder="COMPUTE_WH" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <Label>Username</Label>
              <TextInput value={form.username} onChange={(v) => set("username", v)} autoComplete="username" />
            </Field>
            <Field>
              <Label>Password</Label>
              <TextInput type="password" value={form.password} onChange={(v) => set("password", v)} autoComplete="current-password" />
            </Field>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded border-border" checked={form.ssl} onChange={(e) => set("ssl", e.target.checked)} />
            <span>Use SSL / TLS</span>
          </label>
        </>
      )}

      {isInfluxDB && (
        <>
          <Field>
            <Label>InfluxDB URL</Label>
            <TextInput value={form.host} onChange={(v) => set("host", v)} placeholder="http://localhost:8086" />
          </Field>
          <Field>
            <Label>Organisation</Label>
            <TextInput value={form.extra_options} onChange={(v) => set("extra_options", v)} placeholder="my-org" />
          </Field>
          <Field>
            <Label>Default bucket (optional)</Label>
            <TextInput value={form.database_name} onChange={(v) => set("database_name", v)} placeholder="telemetry" />
          </Field>
          <Field>
            <Label>API token</Label>
            <TextInput type="password" value={form.password} onChange={(v) => set("password", v)} />
            <p className="mt-1 text-xs text-muted-foreground">Token with read access. Generate one in InfluxDB → Data → API Tokens.</p>
          </Field>
        </>
      )}

      {isOracle && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label>Host</Label>
              <TextInput value={form.host} onChange={(v) => set("host", v)} placeholder="oracle-server.example.com" />
            </div>
            <Field>
              <Label>Port</Label>
              <TextInput type="number" value={form.port} onChange={(v) => set("port", v)} placeholder="1521" />
            </Field>
          </div>
          <Field>
            <Label>Service name</Label>
            <TextInput value={form.database_name} onChange={(v) => set("database_name", v)} placeholder="ORCL" />
            <p className="mt-1 text-xs text-muted-foreground">
              The Oracle service name (or SID). Found in tnsnames.ora or ask your DBA.
            </p>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <Label>Username</Label>
              <TextInput value={form.username} onChange={(v) => set("username", v)} autoComplete="username" />
            </Field>
            <Field>
              <Label>Password</Label>
              <TextInput type="password" value={form.password} onChange={(v) => set("password", v)} autoComplete="current-password" />
            </Field>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded border-border" checked={form.ssl} onChange={(e) => set("ssl", e.target.checked)} />
            <span>Use SSL / TLS</span>
          </label>
        </>
      )}

      {isMongoDB && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label>Host</Label>
              <TextInput value={form.host} onChange={(v) => set("host", v)} placeholder="localhost" />
            </div>
            <Field>
              <Label>Port</Label>
              <TextInput type="number" value={form.port} onChange={(v) => set("port", v)} placeholder="27017" />
            </Field>
          </div>
          <Field>
            <Label>Database</Label>
            <TextInput value={form.database_name} onChange={(v) => set("database_name", v)} placeholder="mydb" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <Label>Username</Label>
              <TextInput value={form.username} onChange={(v) => set("username", v)} autoComplete="username" />
            </Field>
            <Field>
              <Label>Password</Label>
              <TextInput type="password" value={form.password} onChange={(v) => set("password", v)} autoComplete="current-password" />
            </Field>
          </div>
          <Field>
            <Label>Extra options (JSON, optional)</Label>
            <TextInput value={form.extra_options} onChange={(v) => set("extra_options", v)} placeholder='{"authSource":"admin","replicaSet":"rs0"}' />
          </Field>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded border-border" checked={form.ssl} onChange={(e) => set("ssl", e.target.checked)} />
            <span>Use TLS</span>
          </label>
        </>
      )}

      {isCassandra && (
        <>
          <Field>
            <Label>Contact point (host)</Label>
            <TextInput value={form.host} onChange={(v) => set("host", v)} placeholder="cassandra-node1.example.com" />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field>
              <Label>Port</Label>
              <TextInput type="number" value={form.port} onChange={(v) => set("port", v)} placeholder="9042" />
            </Field>
            <div className="col-span-2">
              <Label>Keyspace</Label>
              <TextInput value={form.database_name} onChange={(v) => set("database_name", v)} placeholder="production" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <Label>Username</Label>
              <TextInput value={form.username} onChange={(v) => set("username", v)} autoComplete="username" />
            </Field>
            <Field>
              <Label>Password</Label>
              <TextInput type="password" value={form.password} onChange={(v) => set("password", v)} autoComplete="current-password" />
            </Field>
          </div>
          <Field>
            <Label>Local datacenter</Label>
            <TextInput value={form.extra_options} onChange={(v) => set("extra_options", v)} placeholder="datacenter1" />
            <p className="mt-1 text-xs text-muted-foreground">Required for the datastax driver. Matches the DC name in your cluster topology.</p>
          </Field>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded border-border" checked={form.ssl} onChange={(e) => set("ssl", e.target.checked)} />
            <span>Use SSL / TLS</span>
          </label>
        </>
      )}

      {isRedis && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label>Host</Label>
              <TextInput value={form.host} onChange={(v) => set("host", v)} placeholder="localhost" />
            </div>
            <Field>
              <Label>Port</Label>
              <TextInput type="number" value={form.port} onChange={(v) => set("port", v)} placeholder="6379" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <Label>Password (optional)</Label>
              <TextInput type="password" value={form.password} onChange={(v) => set("password", v)} />
            </Field>
            <Field>
              <Label>DB number</Label>
              <TextInput type="number" value={form.database_name} onChange={(v) => set("database_name", v)} placeholder="0" />
            </Field>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded border-border" checked={form.ssl} onChange={(e) => set("ssl", e.target.checked)} />
            <span>Use TLS</span>
          </label>
        </>
      )}

      {/* Standard host/port/db/user/pass fields for the remaining SQL drivers */}
      {!isOther && !isODBC && !isBigQuery && !isSnowflake && !isInfluxDB && !isOracle && !isMongoDB && !isCassandra && !isRedis && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label>Host</Label>
              <TextInput value={form.host} onChange={(v) => set("host", v)} placeholder="localhost" />
            </div>
            <Field>
              <Label>Port</Label>
              <TextInput type="number" value={form.port} onChange={(v) => set("port", v)} />
            </Field>
          </div>
          <Field>
            <Label>Database</Label>
            <TextInput value={form.database_name} onChange={(v) => set("database_name", v)} placeholder="my_database" />
          </Field>
          {!noCredentials && (
            <div className="grid grid-cols-2 gap-3">
              {!noUsername && (
                <Field>
                  <Label>Username</Label>
                  <TextInput value={form.username} onChange={(v) => set("username", v)} autoComplete="username" />
                </Field>
              )}
              <Field>
                <Label>Password</Label>
                <TextInput type="password" value={form.password} onChange={(v) => set("password", v)} autoComplete="current-password" />
              </Field>
            </div>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded border-border" checked={form.ssl} onChange={(e) => set("ssl", e.target.checked)} />
            <span>Use SSL / TLS</span>
          </label>
          {/* SAP HANA tenant DB hint */}
          {form.driver_type === "hana" && (
            <Field>
              <Label>Tenant database name (optional)</Label>
              <TextInput value={form.extra_options} onChange={(v) => set("extra_options", v)} placeholder="HXE" />
              <p className="mt-1 text-xs text-muted-foreground">
                Leave blank to connect to the system DB. For multi-tenant setups, enter the tenant DB name.
              </p>
            </Field>
          )}
          {/* Db2 extra hint */}
          {form.driver_type === "db2" && (
            <Field>
              <Label>Extra options (JSON, optional)</Label>
              <TextInput value={form.extra_options} onChange={(v) => set("extra_options", v)} placeholder='{"sslServerCertificate":"/path/to/cert.arm"}' />
            </Field>
          )}
        </>
      )}

      {error && <p className="text-xs text-status-critical">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
        <Button type="button" disabled={saving || !form.name.trim()} onClick={() => onSave(form)}>
          {saving ? "Saving…" : "Save connection"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Test status badge
// ---------------------------------------------------------------------------

type TestStatus = "idle" | "testing" | "ok" | "error";

function TestBadge({ status, latency }: { status: TestStatus; latency: number | null }) {
  if (status === "idle") return null;
  if (status === "testing")
    return <Loader2 size={14} className="animate-spin text-muted-foreground" />;
  if (status === "ok")
    return <span className="flex items-center gap-1 text-xs text-status-ok"><CheckCircle2 size={13} /> {latency}ms</span>;
  return <span className="flex items-center gap-1 text-xs text-status-critical"><XCircle size={13} /> Failed</span>;
}

// ---------------------------------------------------------------------------
// ConnectionsView
// ---------------------------------------------------------------------------

export function ConnectionsView({ vsId }: { vsId: string }) {
  const connections = useList<DbConnection>("db_connections", { where: { value_stream_id: vsId } });
  const createConn  = useCreate("db_connections");
  const updateConn  = useUpdate("db_connections");
  const del         = useSoftDelete("db_connections");

  const [showForm,    setShowForm]    = useState(false);
  const [editingConn, setEditingConn] = useState<DbConnection | null>(null);
  const [formError,   setFormError]   = useState<string | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [testStatus,  setTestStatus]  = useState<Record<string, TestStatus>>({});
  const [testLatency, setTestLatency] = useState<Record<string, number | null>>({});
  const [testError,   setTestError]   = useState<Record<string, string | undefined>>({});

  const list = useMemo(() => connections.data ?? [], [connections.data]);

  useEffect(() => {
    if (!showForm && !editingConn) setFormError(null);
  }, [showForm, editingConn]);

  function handleCreate(form: ConnectionFormState) {
    setSaving(true);
    setFormError(null);
    createConn.mutate(formToPayload(form, vsId), {
      onSuccess: () => { setSaving(false); setShowForm(false); },
      onError:   (e) => { setSaving(false); setFormError(String(e)); },
    });
  }

  function handleUpdate(form: ConnectionFormState) {
    if (!editingConn) return;
    setSaving(true);
    setFormError(null);
    updateConn.mutate(
      { id: editingConn.id, data: formToPayload(form, vsId) },
      {
        onSuccess: () => { setSaving(false); setEditingConn(null); },
        onError:   (e) => { setSaving(false); setFormError(String(e)); },
      },
    );
  }

  async function handleTest(conn: DbConnection) {
    setTestStatus((s) => ({ ...s, [conn.id]: "testing" }));
    try {
      const res    = await fetch(`/api/db_connections/${conn.id}/test`, { method: "POST" });
      const result = await res.json() as { ok: boolean; latency_ms: number; error?: string };
      setTestStatus((s)  => ({ ...s,  [conn.id]: result.ok ? "ok" : "error" }));
      setTestLatency((s) => ({ ...s,  [conn.id]: result.ok ? result.latency_ms : null }));
      setTestError((s)   => ({ ...s,  [conn.id]: result.error }));
    } catch (e) {
      setTestStatus((s) => ({ ...s,  [conn.id]: "error" }));
      setTestError((s)  => ({ ...s,  [conn.id]: String(e) }));
    }
  }

  return (
    <ViewShell
      title="Database Connections"
      subtitle="Connect to live databases to import data element definitions directly from source schemas."
      actions={
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus size={14} /> Add connection
        </Button>
      }
    >
      {list.length === 0 && !showForm ? (
        <EmptyHint>
          No connections configured. Click &ldquo;Add connection&rdquo; to connect to a live database.
        </EmptyHint>
      ) : (
        <div className="space-y-2">
          {list.map((conn) => {
            const driver   = conn.driver_type as DbDriverType;
            const meta     = DRIVER_META[driver] ?? DRIVER_META.other;
            const disabled = testStatus[conn.id] === "testing" || !!meta.noLiveTest;
            return (
              <div key={conn.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
                <Database size={18} className={meta.color} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{conn.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {meta.label}
                    {conn.host && ` · ${conn.host}${conn.port ? `:${conn.port}` : ""}`}
                    {conn.database_name && ` · ${conn.database_name}`}
                  </p>
                  {testError[conn.id] && testStatus[conn.id] === "error" && (
                    <p className="mt-0.5 truncate text-xs text-status-critical">{testError[conn.id]}</p>
                  )}
                </div>
                <TestBadge status={testStatus[conn.id] ?? "idle"} latency={testLatency[conn.id] ?? null} />
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" disabled={disabled} onClick={() => handleTest(conn)}>
                    Test
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingConn(conn)}>
                    <Edit2 size={13} />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-status-critical"
                    onClick={() => del.mutate(conn.id)}
                  >
                    <Trash2 size={13} />
                  </Button>
                  <ChevronRight size={14} className="text-muted-foreground/40" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add Database Connection">
        <ConnectionForm
          initial={emptyForm()}
          onSave={handleCreate}
          onCancel={() => setShowForm(false)}
          saving={saving}
          error={formError}
        />
      </Modal>

      {editingConn && (
        <Modal open onClose={() => setEditingConn(null)} title="Edit Connection">
          <ConnectionForm
            initial={{
              name:          editingConn.name,
              driver_type:   editingConn.driver_type as DbDriverType,
              host:          editingConn.host          ?? "",
              port:          editingConn.port != null   ? String(editingConn.port) : "",
              database_name: editingConn.database_name ?? "",
              username:      editingConn.username       ?? "",
              password:      editingConn.password       ?? "",
              ssl:           editingConn.ssl,
              extra_options: editingConn.extra_options  ?? "",
            }}
            onSave={handleUpdate}
            onCancel={() => setEditingConn(null)}
            saving={saving}
            error={formError}
          />
        </Modal>
      )}
    </ViewShell>
  );
}
