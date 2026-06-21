import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Upload } from "lucide-react";
import { parseCsv } from "@shared/csv";
import { api } from "@/lib/api";
import { ViewShell } from "@/components/ViewShell";
import { Badge, Button, Card, Field, Select, Textarea } from "@/components/ui/primitives";

interface TemplateInfo {
  label: string;
  csv: string;
  hint: string;
}

const TEMPLATES: Record<string, TemplateInfo> = {
  process_steps: {
    label: "Process steps",
    csv: [
      "name,sequence_index,entry_criteria,action,exit_criteria,cycle_time,wait_time,pct_complete_accurate,pain_points",
      "Receive Order,1,Customer submits request,Review and validate order,Order confirmed in system,2,0.5,95,Manual validation slows throughput",
    ].join("\n"),
    hint: "cycle_time and wait_time are in hours. pct_complete_accurate is 0–100.",
  },
  personas: {
    label: "Personas",
    csv: [
      "name,role_title,function,scope_level,responsibilities,authority_notes",
      "Jane Smith,Operations Manager,Supply Chain,stream,Reviews and approves all orders,Can approve up to $50k",
    ].join("\n"),
    hint: "scope_level must be one of: local | stream | system",
  },
  data_elements: {
    label: "Data elements",
    csv: [
      "step_name,name,business_description,binding_point,presence,source_system,table_or_view,field_name,data_type,example_value,is_key,quality_notes",
      "Receive Order,Order ID,Unique identifier for each order,entry,present,SAP,orders,order_id,integer,ORD-12345,1,Always populated",
    ].join("\n"),
    hint: "step_name must match an existing step. binding_point: entry | action | exit. presence: present | partial | missing. is_key: 0 or 1.",
  },
  assumptions: {
    label: "Assumptions",
    csv: [
      "statement,status,evidence",
      "The process runs 5 days a week,unvalidated,",
      "All orders arrive by email,supported,Confirmed with ops team in kickoff",
    ].join("\n"),
    hint: "status must be one of: unvalidated | supported | refuted",
  },
  metrics: {
    label: "Metrics",
    csv: [
      "name,unit,source,metric_type,baseline_value,current_value,target_value,is_leading",
      "Order Cycle Time,hours,ERP System,lead_time,48,36,24,0",
      "Daily Throughput,orders/day,Dashboard,throughput,100,120,150,1",
    ].join("\n"),
    hint: "metric_type: throughput | inventory_wip | operating_expense | lead_time | quality | other. is_leading: 0 or 1.",
  },
  constraints: {
    label: "Constraints",
    csv: [
      "title,description,kind,severity,likelihood,toc_status,is_system_constraint",
      "Manual approval bottleneck,All orders require VP sign-off regardless of dollar amount,constraint,high,high,identified,0",
    ].join("\n"),
    hint: "kind: constraint | risk | breakdown | pain_point | seam. severity: low | medium | high | critical. likelihood: low | medium | high. toc_status: none | identified | exploit | subordinate | elevate | broken. is_system_constraint: 0 or 1.",
  },
};

export function IoView({ engagementId, vsId }: { engagementId: string; vsId: string }) {
  const qc = useQueryClient();
  const bundleFileRef = useRef<HTMLInputElement>(null);
  const csvFileRef = useRef<HTMLInputElement>(null);
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

  const downloadTemplate = () => {
    const { csv, label } = TEMPLATES[kind];
    const blob = new Blob([csv + "\n"], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `template-${kind}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    void label;
  };

  const runImport = async (rows: Record<string, unknown>[]) => {
    setStructuredMsg(null);
    if (rows.length === 0) {
      setStructuredMsg("No data rows found.");
      return;
    }
    try {
      const res = await api.importStructured({ value_stream_id: vsId, kind, rows });
      qc.invalidateQueries();
      const warn = res.warnings.length ? ` Warnings: ${res.warnings.join("; ")}` : "";
      setStructuredMsg(`Created ${res.created}, skipped ${res.skipped}.${warn}`);
      if (res.created > 0) setRaw("");
    } catch (e) {
      setStructuredMsg(`Import failed: ${(e as Error).message}`);
    }
  };

  const handleCsvUpload = async (file: File) => {
    const text = await file.text();
    await runImport(parseCsv(text));
    if (csvFileRef.current) csvFileRef.current.value = "";
  };

  const runStructured = async () => {
    const text = raw.trim();
    const rows = text.startsWith("[") ? JSON.parse(text) : parseCsv(text);
    await runImport(rows);
  };

  return (
    <ViewShell
      title="Import / Export"
      subtitle="Portable JSON is the v1 handoff mechanism. Bulk CSV import for all six entity types."
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
            <Button size="sm" variant="outline" onClick={() => bundleFileRef.current?.click()}>
              <Upload size={14} /> Import bundle
            </Button>
            <input
              ref={bundleFileRef}
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
            <h3 className="text-sm font-semibold">Bulk CSV import</h3>
            <Badge tone="info">Steps · Personas · Data · Assumptions · Metrics · Constraints</Badge>
          </div>

          <div className="space-y-3">
            <Field label="What are you importing?">
              <Select
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as never);
                  setStructuredMsg(null);
                }}
              >
                {Object.entries(TEMPLATES).map(([k, t]) => (
                  <option key={k} value={k}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="rounded border border-dashed border-muted-foreground/30 bg-muted/20 p-3">
              <p className="mb-2 text-xs font-medium">Step 1 — Download the blank template</p>
              <Button size="sm" variant="outline" onClick={downloadTemplate}>
                <Download size={14} /> Download {TEMPLATES[kind].label} template
              </Button>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Open in Excel or Google Sheets, fill it in, save as CSV.
              </p>
              <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-[10px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                Valid values — {TEMPLATES[kind].hint}
              </p>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium">Step 2 — Upload your filled-in CSV</p>
              <Button
                size="sm"
                onClick={() => csvFileRef.current?.click()}
              >
                <Upload size={14} /> Upload CSV file
              </Button>
              <input
                ref={csvFileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleCsvUpload(e.target.files[0])}
              />
            </div>

            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Or paste CSV / JSON text directly
              </summary>
              <div className="mt-2 space-y-2">
                <Textarea
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  placeholder={`Paste ${TEMPLATES[kind].label} rows…`}
                  className="min-h-[100px] font-mono text-xs"
                />
                <Button size="sm" onClick={runStructured} disabled={!raw.trim()}>
                  Import rows
                </Button>
              </div>
            </details>

            {structuredMsg && (
              <p
                className={`text-xs ${
                  structuredMsg.startsWith("Import failed")
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                {structuredMsg}
              </p>
            )}
          </div>
        </Card>
      </div>
    </ViewShell>
  );
}
