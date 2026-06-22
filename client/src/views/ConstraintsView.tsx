import { useMemo, useCallback, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import type {
  Constraint,
  DataElement,
  FlowEdge,
  Persona,
  ProcessStep,
} from "@shared/schemas";
import {
  CONSTRAINT_KINDS,
  CONSTRAINT_TARGET_TYPES,
  LIKELIHOODS,
  SEVERITIES,
  TOC_STATUSES,
  type ConstraintTargetType,
} from "@shared/enums";
import { useCreate, useList, useSystemConstraintCheck, useUpdate } from "@/lib/queries";
import { ApiError } from "@/lib/api";
import { severityTone, titleCase, tocLabels } from "@/lib/display";
import { ViewShell, SearchBar, Table, Tr, Td, EmptyHint, type SortDir } from "@/components/ViewShell";
import { Badge, Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { RowActions } from "@/components/RowActions";

const kindTone = {
  constraint: "critical",
  risk: "gap",
  breakdown: "critical",
  pain_point: "gap",
  seam: "info",
} as const;

const COLS = ["Title", "Kind", "Target", "Severity", "ToC stage", "System", ""] as const;

function getVal(c: Constraint, col: string): string {
  switch (col) {
    case "Title": return c.title ?? "";
    case "Kind": return c.kind ?? "";
    case "Target": return c.target_type ?? "";
    case "Severity": return c.severity ?? "";
    case "ToC stage": return tocLabels[c.toc_status] ?? "";
    case "System": return c.is_system_constraint ? "system" : "";
    default: return "";
  }
}

export function ConstraintsView({ vsId }: { vsId: string }) {
  const constraints = useList<Constraint>("constraints", { where: { value_stream_id: vsId } });
  const check = useSystemConstraintCheck(vsId);
  const [editing, setEditing] = useState<Constraint | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [sortCol, setSortCol] = useState<string>("");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = useCallback((col: string) => {
    setSortCol((prev) => {
      if (prev === col) { setSortDir((d) => (d === "asc" ? "desc" : "asc")); return prev; }
      setSortDir("asc"); return col;
    });
  }, []);

  const rows = useMemo(() => {
    let data = constraints.data ?? [];
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      data = data.filter((c) =>
        COLS.slice(0, -1).some((col) => getVal(c, col).toLowerCase().includes(q))
      );
    }
    if (sortCol) {
      data = [...data].sort((a, b) => {
        const av = getVal(a, sortCol).toLowerCase();
        const bv = getVal(b, sortCol).toLowerCase();
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    return data;
  }, [constraints.data, query, sortCol, sortDir]);

  return (
    <ViewShell
      title="Constraint Register"
      subtitle="Constraints, risks, breakdowns, pain points and seams — attachable to any node or edge."
      actions={
        <>
          <SearchBar value={query} onChange={setQuery} placeholder="Search constraints…" />
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} /> Constraint
          </Button>
        </>
      }
    >
      {check.data?.warning && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-status-gap/40 bg-status-gap/10 px-3 py-2 text-sm text-status-gap">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{check.data.warning}</span>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyHint>{query ? `No constraints matching "${query}".` : "No constraints logged yet."}</EmptyHint>
      ) : (
        <Table columns={[...COLS]} sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>
          {rows.map((c) => (
            <Tr key={c.id} active={c.is_system_constraint}>
              <Td className="max-w-xs font-medium">{c.title}</Td>
              <Td>
                <Badge tone={kindTone[c.kind]}>{titleCase(c.kind)}</Badge>
              </Td>
              <Td className="text-xs text-muted-foreground">{titleCase(c.target_type)}</Td>
              <Td>
                <Badge tone={severityTone[c.severity]}>{c.severity}</Badge>
              </Td>
              <Td className="text-xs">{tocLabels[c.toc_status]}</Td>
              <Td>{c.is_system_constraint ? <Badge tone="critical">system</Badge> : "—"}</Td>
              <Td>
                <RowActions entityKey="constraints" id={c.id} onEdit={() => setEditing(c)} />
              </Td>
            </Tr>
          ))}
        </Table>
      )}

      {(creating || editing) && (
        <ConstraintForm
          vsId={vsId}
          initial={editing ?? undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </ViewShell>
  );
}

export interface ConstraintPrefill {
  title?: string;
  target_type?: ConstraintTargetType;
  target_id?: string;
  is_system_constraint?: boolean;
  toc_status?: Constraint["toc_status"];
}

export function ConstraintForm({
  vsId,
  initial,
  prefill,
  onClose,
}: {
  vsId: string;
  initial?: Constraint;
  prefill?: ConstraintPrefill;
  onClose: () => void;
}) {
  const steps = useList<ProcessStep>("process_steps", { where: { value_stream_id: vsId } });
  const personas = useList<Persona>("personas", { where: { value_stream_id: vsId } });
  const dataEls = useList<DataElement>("data_elements", { where: { value_stream_id: vsId } });
  const edges = useList<FlowEdge>("flow_edges", { where: { value_stream_id: vsId } });
  const create = useCreate("constraints");
  const update = useUpdate("constraints");

  const [form, setForm] = useState(() => ({
    title: initial?.title ?? prefill?.title ?? "",
    description: initial?.description ?? "",
    kind: initial?.kind ?? "constraint",
    target_type: initial?.target_type ?? prefill?.target_type ?? "step",
    target_id: initial?.target_id ?? prefill?.target_id ?? "",
    severity: initial?.severity ?? "high",
    likelihood: initial?.likelihood ?? "",
    toc_status: initial?.toc_status ?? prefill?.toc_status ?? "none",
    is_system_constraint: initial?.is_system_constraint ?? prefill?.is_system_constraint ?? false,
  }));
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  const targetOptions = useMemo(() => {
    switch (form.target_type as ConstraintTargetType) {
      case "step":
        return (steps.data ?? []).map((s) => ({ value: s.id, label: s.name }));
      case "persona":
        return (personas.data ?? []).map((p) => ({ value: p.id, label: p.name }));
      case "data_element":
        return (dataEls.data ?? [])
          .map((d) => ({ value: d.id, label: d.name }));
      case "edge":
        return (edges.data ?? []).map((e) => ({
          value: e.id,
          label: `${e.edge_type}: ${e.from_id.slice(0, 6)}→${e.to_id.slice(0, 6)}`,
        }));
      case "value_stream":
        return [{ value: vsId, label: "This value stream" }];
      default:
        return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.target_type, steps.data, personas.data, dataEls.data, edges.data]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const payload = {
      value_stream_id: vsId,
      title: form.title,
      description: form.description || null,
      kind: form.kind,
      target_type: form.target_type,
      target_id: form.target_type === "value_stream" ? vsId : form.target_id || null,
      severity: form.severity,
      likelihood: form.kind === "risk" ? form.likelihood || null : null,
      toc_status: form.toc_status,
      is_system_constraint: form.is_system_constraint,
    };
    const opts = {
      onSuccess: () => onClose(),
      onError: (err: unknown) =>
        setError(err instanceof ApiError ? err.message : "Save failed."),
    };
    if (initial) update.mutate({ id: initial.id, data: payload }, opts);
    else create.mutate(payload, opts);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? "Edit Constraint" : "New Constraint"}
      footer={
        <>
          {error && <span className="mr-auto text-xs text-status-critical">{error}</span>}
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="constraint-form">
            {initial ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <form id="constraint-form" onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Title *" className="col-span-2">
          <Input
            data-testid="cf-title"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            required
          />
        </Field>
        <Field label="Kind">
          <Select data-testid="cf-kind" value={form.kind} onChange={(e) => set("kind", e.target.value as never)}>
            {CONSTRAINT_KINDS.map((k) => (
              <option key={k} value={k}>
                {titleCase(k)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Severity">
          <Select data-testid="cf-severity" value={form.severity} onChange={(e) => set("severity", e.target.value as never)}>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Target type">
          <Select
            data-testid="cf-target_type"
            value={form.target_type}
            onChange={(e) => {
              set("target_type", e.target.value as never);
              set("target_id", "");
            }}
          >
            {CONSTRAINT_TARGET_TYPES.map((t) => (
              <option key={t} value={t}>
                {titleCase(t)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Target">
          <Select
            data-testid="cf-target_id"
            value={form.target_id}
            onChange={(e) => set("target_id", e.target.value)}
            disabled={form.target_type === "value_stream"}
          >
            <option value="">{form.target_type === "value_stream" ? "This value stream" : "—"}</option>
            {targetOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        {form.kind === "risk" && (
          <Field label="Likelihood">
            <Select data-testid="cf-likelihood" value={form.likelihood} onChange={(e) => set("likelihood", e.target.value as never)}>
              <option value="">—</option>
              {LIKELIHOODS.map((l) => (
                <option key={l} value={l}>
                  {titleCase(l)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Five Focusing Steps stage" className="col-span-2">
          <Select value={form.toc_status} onChange={(e) => set("toc_status", e.target.value as never)}>
            {TOC_STATUSES.map((t) => (
              <option key={t} value={t}>
                {tocLabels[t]}
              </option>
            ))}
          </Select>
        </Field>
        <label className="col-span-2 flex items-center gap-2 rounded-md border border-border bg-input px-2.5 py-2 text-sm">
          <input
            data-testid="cf-system"
            type="checkbox"
            checked={form.is_system_constraint}
            onChange={(e) => set("is_system_constraint", e.target.checked)}
            className="accent-[hsl(var(--primary))]"
          />
          This is the system constraint
        </label>
        <Field label="Description" className="col-span-2">
          <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
