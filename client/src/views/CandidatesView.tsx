import { useState } from "react";
import { Crosshair, Info } from "lucide-react";
import type { ConstraintCandidate } from "@shared/scoring";
import { useCandidates } from "@/lib/queries";
import { ViewShell, EmptyHint } from "@/components/ViewShell";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { ConstraintForm, type ConstraintPrefill } from "./ConstraintsView";

export function CandidatesView({ vsId }: { vsId: string }) {
  const candidates = useCandidates(vsId);
  const [prefill, setPrefill] = useState<ConstraintPrefill | null>(null);

  const data = candidates.data ?? [];
  const max = data[0]?.score ?? 1;

  return (
    <ViewShell
      title="Constraint Candidates"
      subtitle="Decision support, not a verdict. These are ranked candidates and the evidence behind each — you confirm the system constraint."
    >
      <div className="mb-3 flex items-start gap-2 rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-muted-foreground">
        <Info size={14} className="mt-0.5 shrink-0 text-accent" />
        <span>
          Scoring is deterministic and transparent — every contributing factor is listed. The
          Theory of Constraints <em>Identify</em> step is a judgment call; promote the candidate you
          confirm to set its Five Focusing Steps lifecycle.
        </span>
      </div>

      {data.length === 0 ? (
        <EmptyHint>
          No candidate signals yet. Add data gaps, dependency edges, timings, or constraints to
          generate evidence.
        </EmptyHint>
      ) : (
        <div className="space-y-3">
          {data.map((c, i) => (
            <CandidateCard
              key={`${c.target_type}:${c.target_id}`}
              candidate={c}
              rank={i + 1}
              max={max}
              onPromote={() =>
                setPrefill({
                  title: `System constraint: ${c.label}`,
                  target_type: c.target_type,
                  target_id: c.target_id,
                  is_system_constraint: true,
                  toc_status: "identified",
                })
              }
            />
          ))}
        </div>
      )}

      {prefill && (
        <ConstraintForm vsId={vsId} prefill={prefill} onClose={() => setPrefill(null)} />
      )}
    </ViewShell>
  );
}

function CandidateCard({
  candidate,
  rank,
  max,
  onPromote,
}: {
  candidate: ConstraintCandidate;
  rank: number;
  max: number;
  onPromote: () => void;
}) {
  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <span className="mono grid h-6 w-6 place-items-center rounded bg-muted text-xs">#{rank}</span>
        <h3 className="text-sm font-semibold">{candidate.label}</h3>
        <Badge tone={candidate.target_type === "persona" ? "info" : "neutral"}>
          {candidate.target_type}
        </Badge>
        <span className="mono ml-auto text-lg font-semibold tabular-nums text-primary">
          {candidate.score}
        </span>
        <Button size="sm" variant="outline" onClick={onPromote}>
          <Crosshair size={13} /> Set as system constraint
        </Button>
      </div>
      {/* Score bar */}
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.max(4, (candidate.score / max) * 100)}%` }}
        />
      </div>
      {/* Transparent factors */}
      <div className="space-y-1.5">
        {candidate.factors.map((f, idx) => (
          <div key={idx} className="flex items-start gap-2 text-sm">
            <Badge tone="accent" className="mt-0.5 shrink-0">
              +{f.points}
            </Badge>
            <div>
              <span className="font-medium">{f.label}</span>
              <span className="text-muted-foreground"> — {f.detail}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
