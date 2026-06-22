import { AlertTriangle } from "lucide-react";
import { useGaps } from "@/lib/queries";
import { presenceTone } from "@/lib/display";
import { ViewShell, EmptyHint } from "@/components/ViewShell";
import { Badge, Card } from "@/components/ui/primitives";

function Stat({ label, value, tone }: { label: string; value: number; tone?: "gap" | "critical" | "accent" }) {
  return (
    <Card className="flex-1">
      <p className="text-2xl font-semibold tabular-nums">
        <span
          className={
            tone === "critical"
              ? "text-status-critical"
              : tone === "gap"
                ? "text-status-gap"
                : tone === "accent"
                  ? "text-primary"
                  : ""
          }
        >
          {value}
        </span>
      </p>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
    </Card>
  );
}

export function GapsView({ vsId }: { vsId: string }) {
  const gaps = useGaps(vsId);
  const report = gaps.data;

  return (
    <ViewShell
      title="Data Gap Report"
      subtitle="Where the Value Stream Model is blind — missing / partial and key data, grouped by step."
    >
      {!report ? (
        <EmptyHint>Loading…</EmptyHint>
      ) : report.total_gaps === 0 ? (
        <EmptyHint>No data gaps detected. Every key element is present.</EmptyHint>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-3">
            <Stat label="Total flagged" value={report.total_gaps} tone="accent" />
            <Stat label="Missing" value={report.missing_count} tone="critical" />
            <Stat label="Partial" value={report.partial_count} tone="gap" />
            <Stat label="Key elements" value={report.key_count} tone="accent" />
          </div>

          {report.steps.map((s) => (
            <Card key={s.step_id}>
              <div className="mb-2 flex items-center gap-2">
                <span className="mono grid h-5 w-5 place-items-center rounded bg-muted text-[10px]">
                  {s.sequence_index}
                </span>
                <h3 className="text-sm font-semibold">{s.step_name}</h3>
                <Badge tone="gap" className="ml-auto">
                  <AlertTriangle size={10} /> {s.gaps.length}
                </Badge>
              </div>
              <div className="space-y-1">
                {s.gaps.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center gap-2 rounded bg-muted/30 px-2 py-1 text-sm"
                  >
                    <Badge>{d.binding_point}</Badge>
                    <span className="font-medium">{d.name}</span>
                    {d.is_key && <Badge tone="accent">key</Badge>}
                    <Badge tone={presenceTone[d.presence]}>{d.presence}</Badge>
                    {d.quality_notes && (
                      <span className="ml-auto truncate text-xs text-muted-foreground">
                        {d.quality_notes}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </ViewShell>
  );
}
