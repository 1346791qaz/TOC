import { useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import type { Engagement, ValueStream } from "@shared/schemas";
import { NAV } from "@/App";
import { useUi } from "@/store";
import { cn, shortId } from "@/lib/utils";
import { engagementFields, valueStreamFields } from "@/lib/entityConfig";
import { Button, Select } from "@/components/ui/primitives";
import { EntityModalForm } from "./EntityModalForm";

const GROUP_LABELS: Record<string, string> = {
  analysis: "Analysis",
  model: "Model",
  system: "System",
};

export function LeftRail({
  engagements,
  valueStreams,
}: {
  engagements: Engagement[];
  valueStreams: ValueStream[];
}) {
  const { engagementId, valueStreamId, view, setEngagement, setValueStream, setView } = useUi();
  const [newEngagement, setNewEngagement] = useState(false);
  const [newStream, setNewStream] = useState(false);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-surface">
      {/* Engagement selector */}
      <div className="space-y-2 border-b border-border p-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Engagement
          </span>
          <Button variant="ghost" size="icon" onClick={() => setNewEngagement(true)} aria-label="New engagement">
            <Plus size={14} />
          </Button>
        </div>
        <Select
          value={engagementId ?? ""}
          onChange={(e) => setEngagement(e.target.value || null)}
        >
          {engagements.length === 0 && <option value="">No engagements</option>}
          {engagements.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </Select>
      </div>

      {/* Value streams */}
      <div className="space-y-1.5 border-b border-border p-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Value Streams
          </span>
          <Button
            variant="ghost"
            size="icon"
            disabled={!engagementId}
            onClick={() => setNewStream(true)}
            aria-label="New value stream"
          >
            <Plus size={14} />
          </Button>
        </div>
        <div className="space-y-0.5">
          {valueStreams.map((vs) => (
            <button
              key={vs.id}
              onClick={() => setValueStream(vs.id)}
              className={cn(
                "flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm transition-colors",
                vs.id === valueStreamId
                  ? "bg-primary/15 text-primary"
                  : "text-foreground/80 hover:bg-muted",
              )}
            >
              <ChevronRight size={12} className="shrink-0 opacity-60" />
              <span className="truncate">{vs.name}</span>
              <span className="mono ml-auto opacity-40">{shortId(vs.id)}</span>
            </button>
          ))}
          {valueStreams.length === 0 && (
            <p className="px-2 py-1 text-xs text-muted-foreground">No value streams yet.</p>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2">
        {(["analysis", "model", "system"] as const).map((group) => (
          <div key={group} className="mb-2">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              {GROUP_LABELS[group]}
            </p>
            {NAV.filter((n) => n.group === group).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.view}
                  onClick={() => setView(item.view)}
                  disabled={!valueStreamId}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors disabled:opacity-40",
                    view === item.view
                      ? "bg-muted text-foreground"
                      : "text-foreground/70 hover:bg-muted/60",
                  )}
                >
                  <Icon size={15} />
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <EntityModalForm
        open={newEngagement}
        onClose={() => setNewEngagement(false)}
        entityKey="engagements"
        title="New Engagement"
        fields={engagementFields}
      />
      {engagementId && (
        <EntityModalForm
          open={newStream}
          onClose={() => setNewStream(false)}
          entityKey="value_streams"
          title="New Value Stream"
          fields={valueStreamFields}
          extra={{ engagement_id: engagementId }}
        />
      )}
    </aside>
  );
}
