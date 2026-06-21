import { useMemo, useState } from "react";
import { Plus, TrendingDown, TrendingUp } from "lucide-react";
import type { Metric } from "@shared/schemas";
import { useList } from "@/lib/queries";
import { metricFields } from "@/lib/entityConfig";
import { fmtNum } from "@/lib/utils";
import { titleCase } from "@/lib/display";
import { ViewShell, SearchBar, Table, Tr, Td, EmptyHint, type SortDir } from "@/components/ViewShell";
import { Badge, Button } from "@/components/ui/primitives";
import { EntityModalForm } from "@/components/EntityModalForm";
import { RowActions } from "@/components/RowActions";

function Delta({ m }: { m: Metric }) {
  if (m.baseline_value == null || m.current_value == null) return <span>—</span>;
  const diff = m.current_value - m.baseline_value;
  if (diff === 0) return <span className="text-muted-foreground">0</span>;
  const up = diff > 0;
  return (
    <span className={up ? "text-status-healthy" : "text-status-critical"}>
      {up ? <TrendingUp size={12} className="inline" /> : <TrendingDown size={12} className="inline" />}{" "}
      {diff > 0 ? "+" : ""}
      {fmtNum(diff)}
    </span>
  );
}

const COLS = ["Metric", "Type", "Baseline", "Current", "Δ", "Target", "Ind.", ""] as const;

function getVal(m: Metric, col: string): string {
  switch (col) {
    case "Metric": return [m.name, m.unit].filter(Boolean).join(" ");
    case "Type": return m.metric_type ?? "";
    case "Baseline": return String(m.baseline_value ?? "");
    case "Current": return String(m.current_value ?? "");
    case "Target": return String(m.target_value ?? "");
    case "Ind.": return m.is_leading ? "leading" : "lagging";
    default: return "";
  }
}

function numericSort(a: Metric, b: Metric, col: string, dir: SortDir): number {
  const numCols = ["Baseline", "Current", "Target"];
  if (!numCols.includes(col)) return 0;
  const key = col === "Baseline" ? "baseline_value" : col === "Current" ? "current_value" : "target_value";
  const av = (a as Record<string, unknown>)[key] as number | null ?? -Infinity;
  const bv = (b as Record<string, unknown>)[key] as number | null ?? -Infinity;
  return dir === "asc" ? av - bv : bv - av;
}

export function MetricsView({ vsId }: { vsId: string }) {
  const metrics = useList<Metric>("metrics", { where: { value_stream_id: vsId } });
  const [editing, setEditing] = useState<Metric | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [sortCol, setSortCol] = useState<string>("");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(col: string) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  const rows = useMemo(() => {
    let data = metrics.data ?? [];
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      data = data.filter((m) =>
        COLS.slice(0, -1).some((col) => getVal(m, col).toLowerCase().includes(q))
      );
    }
    if (sortCol) {
      const numericCols = ["Baseline", "Current", "Target"];
      data = [...data].sort((a, b) =>
        numericCols.includes(sortCol)
          ? numericSort(a, b, sortCol, sortDir)
          : (sortDir === "asc"
              ? getVal(a, sortCol).toLowerCase().localeCompare(getVal(b, sortCol).toLowerCase())
              : getVal(b, sortCol).toLowerCase().localeCompare(getVal(a, sortCol).toLowerCase()))
      );
    }
    return data;
  }, [metrics.data, query, sortCol, sortDir]);

  return (
    <ViewShell
      title="Metrics"
      subtitle="Baseline → current → target, so flow improvement is measurable."
      actions={
        <>
          <SearchBar value={query} onChange={setQuery} placeholder="Search metrics…" />
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} /> Metric
          </Button>
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyHint>{query ? `No metrics matching "${query}".` : "No metrics captured yet."}</EmptyHint>
      ) : (
        <Table columns={[...COLS]} sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>
          {rows.map((m) => (
            <Tr key={m.id}>
              <Td className="font-medium">
                {m.name} <span className="text-xs text-muted-foreground">{m.unit ?? ""}</span>
              </Td>
              <Td>
                <Badge>{titleCase(m.metric_type)}</Badge>
              </Td>
              <Td className="mono">{fmtNum(m.baseline_value)}</Td>
              <Td className="mono">{fmtNum(m.current_value)}</Td>
              <Td className="mono">
                <Delta m={m} />
              </Td>
              <Td className="mono">{fmtNum(m.target_value)}</Td>
              <Td>
                <Badge tone={m.is_leading ? "accent" : "neutral"}>
                  {m.is_leading ? "leading" : "lagging"}
                </Badge>
              </Td>
              <Td>
                <RowActions entityKey="metrics" id={m.id} onEdit={() => setEditing(m)} />
              </Td>
            </Tr>
          ))}
        </Table>
      )}

      <EntityModalForm
        open={creating}
        onClose={() => setCreating(false)}
        entityKey="metrics"
        title="New Metric"
        fields={metricFields}
        extra={{ value_stream_id: vsId }}
      />
      {editing && (
        <EntityModalForm
          open
          onClose={() => setEditing(null)}
          entityKey="metrics"
          title="Edit Metric"
          fields={metricFields}
          initial={editing}
        />
      )}
    </ViewShell>
  );
}
