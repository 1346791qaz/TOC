import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Upload } from "lucide-react";
import { parseCsv } from "@shared/csv";
import { api } from "@/lib/api";
import { ViewShell } from "@/components/ViewShell";
import { Badge, Button, Card, Field, Select, Textarea } from "@/components/ui/primitives";

const TEMPLATES: Record<string, string> = {
  process_steps:
    "name,sequence_index,entry_criteria,action,exit_criteria,cycle_time,wait_time,pct_complete_accurate",
  personas: "name,role_title,function,scope_level,responsibilities,authority_notes",
  data_elements:
    "step_name,name,binding_point,presence,data_type,source_system,is_key,quality_notes",
};

export function IoView({ engagementId, vsId }: { engagementId: string; vsId: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const [kind, setKind] = useState<keyof typeof TEMPLATES>("process_steps");
  const [raw, setRaw] = useState("");
  const [structuredMsg, setStructuredMsg] = useState<string | null>(null);

  const exportNow = async () => {
    const bundle = await api.exportEngagement(engagementId);
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `engagement-${engagementId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File) => {
    try {
      const bundle = JSON.parse(await file.text());
      const res = await api.importEngagement(bundle);
      qc.invalidateQueries();
      setImportMsg(
        `Imported engagement ${res.engagement_id.slice(0, 8)}${
          res.remapped ? " (ids remapped to avoid collision)" : ""
        }.`,
      );
    } catch (e) {
      setImportMsg(`Import failed: ${(e as Error).message}`);
    }
  };

  const runStructured = async () => {
    setStructuredMsg(null);
    try {
      const text = raw.trim();
      const rows = text.startsWith("[") ? JSON.parse(text) : parseCsv(text);
      const res = await api.importStructured({ value_stream_id: vsId, kind, rows });
      qc.invalidateQueries();
      const warn = res.warnings.length ? ` Warnings: ${res.warnings.join("; ")}` : "";
      setStructuredMsg(`Created ${res.created}, skipped ${res.skipped}.${warn}`);
      if (res.created > 0) setRaw("");
    } catch (e) {
      setStructuredMsg(`Import failed: ${(e as Error).message}`);
    }
  };

  return (
    <ViewShell
      title="Import / Export"
      subtitle="Portable JSON is the v1 handoff mechanism. Structured CSV/JSON import for bulk entry."
    >
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <h3 className="mb-1 text-sm font-semibold">Engagement bundle</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Export the whole engagement as a portable JSON file, or import one into this database
            (re-importing a bundle that already exists remaps ids automatically).
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={exportNow}>
              <Download size={14} /> Export engagement
            </Button>
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload size={14} /> Import bundle
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
            />
          </div>
          {importMsg && <p className="mt-2 text-xs text-muted-foreground">{importMsg}</p>}
        </Card>

        <Card>
          <div className="mb-1 flex items-center gap-2">
            <h3 className="text-sm font-semibold">Structured import</h3>
            <Badge tone="info">CSV or JSON</Badge>
          </div>
          <p className="mb-2 text-xs text-muted-foreground">
            Paste CSV (with header row) or a JSON array of objects. Scope boundary: v1 supports
            structured rows only — no Visio / Lucidchart / BPMN parsing.
          </p>
          <div className="space-y-2">
            <Field label="Entity">
              <Select value={kind} onChange={(e) => setKind(e.target.value as never)}>
                <option value="process_steps">Process steps</option>
                <option value="personas">Personas</option>
                <option value="data_elements">Data elements (by step_name)</option>
              </Select>
            </Field>
            <p className="mono rounded bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground">
              {TEMPLATES[kind]}
            </p>
            <Textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={`Paste ${kind} rows…`}
              className="min-h-[120px] font-mono text-xs"
            />
            <Button size="sm" onClick={runStructured} disabled={!raw.trim()}>
              Import rows
            </Button>
            {structuredMsg && <p className="text-xs text-muted-foreground">{structuredMsg}</p>}
          </div>
        </Card>
      </div>
    </ViewShell>
  );
}
