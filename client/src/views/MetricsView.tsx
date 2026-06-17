import { useState } from "react";
import { Plus, TrendingDown, TrendingUp } from "lucide-react";
import type { Metric } from "@shared/schemas";
import { useList } from "@/lib/queries";
import { metricFields } from "@/lib/entityConfig";
import { fmtNum } from "@/lib/utils";
import { titleCase } from "@/lib/display";
import { ViewShell, Table, Tr, Td, EmptyHint } from "@/components/ViewShell";
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

export function MetricsView({ vsId }: { vsId: string }) {
  const metrics = useList<Metric>("metrics", { where: { value_stream_id: vsId } });
  const [editing, setEditing] = useState<Metric | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <ViewShell
      title="Metrics"
      subtitle="Baseline → current → target, so flow improvement is measurable."
      actions={
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus size={14} /> Metric
        </Button>
      }
    >
      {(metrics.data ?? []).length === 0 ? (
        <EmptyHint>No metrics captured yet.</EmptyHint>
      ) : (
        <Table columns={["Metric", "Type", "Baseline", "Current", "Δ", "Target", "Ind.", ""]}>
          {metrics.data!.map((m) => (
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
