import { useMemo, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import type { Constraint, Persona, ProcessStep } from "@shared/schemas";
import { NAV } from "@/App";
import { useUi, type ViewKey } from "@/store";
import { useList } from "@/lib/queries";
import { buildStepPath } from "@/views/canvas/hierarchy";
import { Modal } from "@/components/ui/modal";

interface Cmd {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

export function CommandPalette() {
  const { commandOpen, setCommandOpen, valueStreamId, setView, select, setStepPath } = useUi();
  const [q, setQ] = useState("");

  const steps = useList<ProcessStep>(
    "process_steps",
    valueStreamId ? { where: { value_stream_id: valueStreamId } } : undefined,
    !!valueStreamId && commandOpen,
  );
  const personas = useList<Persona>(
    "personas",
    valueStreamId ? { where: { value_stream_id: valueStreamId } } : undefined,
    !!valueStreamId && commandOpen,
  );
  const constraints = useList<Constraint>(
    "constraints",
    valueStreamId ? { where: { value_stream_id: valueStreamId } } : undefined,
    !!valueStreamId && commandOpen,
  );

  const close = () => {
    setCommandOpen(false);
    setQ("");
  };
  const go = (view: ViewKey) => {
    setView(view);
    close();
  };

  const commands = useMemo<Cmd[]>(() => {
    const navCmds: Cmd[] = NAV.map((n) => ({
      id: `nav-${n.view}`,
      label: n.label,
      hint: "View",
      run: () => go(n.view),
    }));
    const stepCmds: Cmd[] = (steps.data ?? []).map((s) => ({
      id: `step-${s.id}`,
      label: s.name,
      hint: "Step",
      run: () => {
        // Drill to the step's parent level so it appears in the list, then select it.
        setStepPath(s.parent_step_id ? buildStepPath(s.parent_step_id, steps.data ?? []) : []);
        select({ key: "process_steps", id: s.id });
        go("steps");
      },
    }));
    const personaCmds: Cmd[] = (personas.data ?? []).map((p) => ({
      id: `persona-${p.id}`,
      label: p.name,
      hint: "Persona",
      run: () => {
        select({ key: "personas", id: p.id });
        go("personas");
      },
    }));
    const constraintCmds: Cmd[] = (constraints.data ?? []).map((c) => ({
      id: `constraint-${c.id}`,
      label: c.title,
      hint: "Constraint",
      run: () => go("constraints"),
    }));
    return [...navCmds, ...stepCmds, ...personaCmds, ...constraintCmds];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.data, personas.data, constraints.data]);

  const filtered = commands.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()));

  return (
    <Modal open={commandOpen} onClose={close} title="Command Palette" className="max-w-xl">
      <div className="mb-3 flex items-center gap-2 rounded-md border border-border bg-input px-2.5">
        <Search size={14} className="text-muted-foreground" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && filtered[0]) filtered[0].run();
          }}
          placeholder="Jump to a view or entity…"
          className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="max-h-80 space-y-0.5 overflow-y-auto">
        {filtered.map((c) => (
          <button
            key={c.id}
            onClick={c.run}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
          >
            <span className="truncate">{c.label}</span>
            <span className="mono ml-auto text-[10px] uppercase text-muted-foreground">{c.hint}</span>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">No matches.</p>
        )}
      </div>
      <p className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground">
        <CornerDownLeft size={11} /> Enter to run the top result
      </p>
    </Modal>
  );
}
