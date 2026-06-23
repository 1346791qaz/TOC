import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, Database, Edit2, Plus, Trash2, XCircle, Loader2 } from "lucide-react";
import type { DbConnection, DbDriverType } from "@shared/schemas";
import { DB_DRIVER_TYPES } from "@shared/schemas";
import { useCreate, useList, useSoftDelete, useUpdate } from "@/lib/queries";
import { ViewShell, EmptyHint } from "@/components/ViewShell";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

// Default ports per driver
const DEFAULT_PORTS: Record<DbDriverType, number | null> = {
  postgresql: 5432,
  mysql: 3306,
  mssql: 1433,
  snowflake: null,
  other: null,
};

const DRIVER_LABELS: Record<DbDriverType, string> = {
  postgresql: "PostgreSQL",
  mysql: "MySQL / MariaDB",
  mssql: "SQL Server",
  snowflake: "Snowflake",
  other: "Other (connection string)",
};

const DRIVER_COLORS: Record<DbDriverType, string> = {
  postgresql: "text-blue-400",
  mysql: "text-orange-400",
  mssql: "text-sky-400",
  snowflake: "text-cyan-400",
  other: "text-muted-foreground",
};

type TestStatus = "idle" | "testing" | "ok" | "error";

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
  return {
    name: "",
    driver_type: driver,
    host: "",
    port: String(DEFAULT_PORTS[driver] ?? ""),
    database_name: "",
    username: "",
    password: "",
    ssl: false,
    extra_options: "",
  };
}

function formToPayload(f: ConnectionFormState, vsId: string) {
  return {
    value_stream_id: vsId,
    name: f.name,
    driver_type: f.driver_type,
    host: f.host || null,
    port: f.port ? Number(f.port) : null,
    database_name: f.database_name || null,
    username: f.username || null,
    password: f.password || null,
    ssl: f.ssl,
    extra_options: f.extra_options || null,
  };
}

function ConnectionForm({
  initial,
  onSave,
  onCancel,
  saving,
  error,
}: {
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
        const port = DEFAULT_PORTS[value as DbDriverType];
        next.port = port != null ? String(port) : "";
      }
      return next;
    });
  }

  const isOther = form.driver_type === "other";

  return (
    <div className="space-y-4">
      {/* Driver type */}
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Database type
        </label>
        <div className="grid grid-cols-3 gap-2">
          {DB_DRIVER_TYPES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => set("driver_type", d)}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                form.driver_type === d
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-input text-muted-foreground hover:border-border/80 hover:bg-muted",
              )}
            >
              <Database size={13} className={DRIVER_COLORS[d]} />
              <span className="truncate text-xs">{DRIVER_LABELS[d]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Display name */}
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Connection name <span className="text-status-critical">*</span>
        </label>
        <input
          className="w-full rounded-md border border-border bg-input px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          placeholder={`e.g. Production ${DRIVER_LABELS[form.driver_type].split(" ")[0]}`}
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </div>

      {isOther ? (
        /* Raw connection string for unsupported drivers */
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Connection string / options (JSON)
          </label>
          <textarea
            rows={4}
            className="w-full rounded-md border border-border bg-input px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            placeholder='{"connectionString":"..."}'
            value={form.extra_options}
            onChange={(e) => set("extra_options", e.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Generic connections are saved for reference but cannot be used for live schema browsing.
          </p>
        </div>
      ) : (
        <>
          {/* Snowflake account hint */}
          {form.driver_type === "snowflake" && (
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Account identifier
              </label>
              <input
                className="w-full rounded-md border border-border bg-input px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                placeholder="orgname-accountname"
                value={form.host}
                onChange={(e) => set("host", e.target.value)}
              />
              <label className="mb-1 mt-3 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Warehouse (optional)
              </label>
              <input
                className="w-full rounded-md border border-border bg-input px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                placeholder="COMPUTE_WH"
                value={form.extra_options}
                onChange={(e) =>
                  set("extra_options", e.target.value ? JSON.stringify({ account: form.host, warehouse: e.target.value }) : "")
                }
              />
            </div>
          )}

          {/* Host + port (non-Snowflake) */}
          {form.driver_type !== "snowflake" && (
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Host
                </label>
                <input
                  className="w-full rounded-md border border-border bg-input px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                  placeholder="localhost"
                  value={form.host}
                  onChange={(e) => set("host", e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Port
                </label>
                <input
                  type="number"
                  className="w-full rounded-md border border-border bg-input px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                  value={form.port}
                  onChange={(e) => set("port", e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Database */}
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Database
            </label>
            <input
              className="w-full rounded-md border border-border bg-input px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              placeholder="my_database"
              value={form.database_name}
              onChange={(e) => set("database_name", e.target.value)}
            />
          </div>

          {/* Username + password */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Username
              </label>
              <input
                autoComplete="username"
                className="w-full rounded-md border border-border bg-input px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                value={form.username}
                onChange={(e) => set("username", e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                className="w-full rounded-md border border-border bg-input px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
              />
            </div>
          </div>

          {/* SSL */}
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border"
              checked={form.ssl}
              onChange={(e) => set("ssl", e.target.checked)}
            />
            <span>Use SSL / TLS</span>
          </label>
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

function TestBadge({ status, latency }: { status: TestStatus; latency: number | null }) {
  if (status === "idle") return null;
  if (status === "testing")
    return <Loader2 size={14} className="animate-spin text-muted-foreground" />;
  if (status === "ok")
    return (
      <span className="flex items-center gap-1 text-xs text-status-ok">
        <CheckCircle2 size={13} /> {latency}ms
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs text-status-critical">
      <XCircle size={13} /> Failed
    </span>
  );
}

export function ConnectionsView({ vsId }: { vsId: string }) {
  const connections = useList<DbConnection>("db_connections", { where: { value_stream_id: vsId } });
  const createConn = useCreate("db_connections");
  const updateConn = useUpdate("db_connections");
  const del = useSoftDelete("db_connections");

  const [showForm, setShowForm] = useState(false);
  const [editingConn, setEditingConn] = useState<DbConnection | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<Record<string, TestStatus>>({});
  const [testLatency, setTestLatency] = useState<Record<string, number | null>>({});
  const [testError, setTestError] = useState<Record<string, string | undefined>>({});

  const list = useMemo(() => connections.data ?? [], [connections.data]);

  useEffect(() => {
    if (!showForm && !editingConn) setFormError(null);
  }, [showForm, editingConn]);

  function handleCreate(form: ConnectionFormState) {
    setSaving(true);
    setFormError(null);
    createConn.mutate(formToPayload(form, vsId), {
      onSuccess: () => { setSaving(false); setShowForm(false); },
      onError: (e) => { setSaving(false); setFormError(String(e)); },
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
        onError: (e) => { setSaving(false); setFormError(String(e)); },
      },
    );
  }

  async function handleTest(conn: DbConnection) {
    setTestStatus((s) => ({ ...s, [conn.id]: "testing" }));
    try {
      const res = await fetch(`/api/db_connections/${conn.id}/test`, { method: "POST" });
      const result = await res.json() as { ok: boolean; latency_ms: number; error?: string };
      setTestStatus((s) => ({ ...s, [conn.id]: result.ok ? "ok" : "error" }));
      setTestLatency((s) => ({ ...s, [conn.id]: result.ok ? result.latency_ms : null }));
      setTestError((s) => ({ ...s, [conn.id]: result.error }));
    } catch (e) {
      setTestStatus((s) => ({ ...s, [conn.id]: "error" }));
      setTestError((s) => ({ ...s, [conn.id]: String(e) }));
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
          {list.map((conn) => (
            <div
              key={conn.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3"
            >
              <Database size={18} className={DRIVER_COLORS[conn.driver_type as DbDriverType]} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{conn.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {DRIVER_LABELS[conn.driver_type as DbDriverType]}
                  {conn.host && ` · ${conn.host}${conn.port ? `:${conn.port}` : ""}`}
                  {conn.database_name && ` · ${conn.database_name}`}
                </p>
                {testError[conn.id] && testStatus[conn.id] === "error" && (
                  <p className="mt-0.5 truncate text-xs text-status-critical">{testError[conn.id]}</p>
                )}
              </div>
              <TestBadge status={testStatus[conn.id] ?? "idle"} latency={testLatency[conn.id] ?? null} />
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={testStatus[conn.id] === "testing" || conn.driver_type === "other"}
                  onClick={() => handleTest(conn)}
                >
                  Test
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingConn(conn)}>
                  <Edit2 size={13} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-status-critical"
                  onClick={() => del.mutate(conn.id)}
                >
                  <Trash2 size={13} />
                </Button>
                <ChevronRight size={14} className="text-muted-foreground/40" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add connection modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Add Database Connection"
      >
        <ConnectionForm
          initial={emptyForm()}
          onSave={handleCreate}
          onCancel={() => setShowForm(false)}
          saving={saving}
          error={formError}
        />
      </Modal>

      {/* Edit connection modal */}
      {editingConn && (
        <Modal
          open
          onClose={() => setEditingConn(null)}
          title="Edit Connection"
        >
          <ConnectionForm
            initial={{
              name: editingConn.name,
              driver_type: editingConn.driver_type as DbDriverType,
              host: editingConn.host ?? "",
              port: editingConn.port != null ? String(editingConn.port) : "",
              database_name: editingConn.database_name ?? "",
              username: editingConn.username ?? "",
              password: editingConn.password ?? "",
              ssl: editingConn.ssl,
              extra_options: editingConn.extra_options ?? "",
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
