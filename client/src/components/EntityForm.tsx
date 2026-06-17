import { useState } from "react";
import type { FieldDef } from "@/lib/entityConfig";
import { titleCase } from "@/lib/display";
import { Field, Input, Select, Textarea } from "@/components/ui/primitives";

export interface DynamicOption {
  value: string;
  label: string;
}

type Values = Record<string, unknown>;

function coerce(field: FieldDef, raw: string | boolean): unknown {
  if (field.type === "boolean") return Boolean(raw);
  if (field.type === "number") {
    if (raw === "" || raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  // text / textarea / select
  const s = String(raw);
  if (field.type !== "select" && s.trim() === "") return field.required ? "" : null;
  return s;
}

export function EntityForm({
  fields,
  initial,
  dynamicOptions = {},
  onSubmit,
  formId,
}: {
  fields: FieldDef[];
  initial?: Values;
  dynamicOptions?: Record<string, DynamicOption[]>;
  onSubmit: (values: Values) => void;
  formId: string;
}) {
  const [values, setValues] = useState<Values>(() => {
    const v: Values = {};
    for (const f of fields) {
      const init = initial?.[f.name];
      if (f.type === "boolean") v[f.name] = Boolean(init);
      else v[f.name] = init ?? "";
    }
    return v;
  });

  const set = (name: string, val: unknown) => setValues((s) => ({ ...s, [name]: val }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const out: Values = {};
    for (const f of fields) out[f.name] = coerce(f, values[f.name] as string | boolean);
    onSubmit(out);
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
      {fields.map((f) => {
        const span = f.full ? "col-span-2" : "col-span-1";
        if (f.type === "boolean") {
          return (
            <label
              key={f.name}
              className={`${span} flex items-center gap-2 rounded-md border border-border bg-input px-2.5 py-2 text-sm`}
            >
              <input
                type="checkbox"
                checked={Boolean(values[f.name])}
                onChange={(e) => set(f.name, e.target.checked)}
                className="accent-[hsl(var(--primary))]"
              />
              {f.label}
            </label>
          );
        }
        return (
          <Field key={f.name} label={f.label + (f.required ? " *" : "")} className={span}>
            {f.type === "textarea" ? (
              <Textarea
                value={String(values[f.name] ?? "")}
                onChange={(e) => set(f.name, e.target.value)}
                placeholder={f.placeholder}
                required={f.required}
              />
            ) : f.type === "select" ? (
              <Select
                value={String(values[f.name] ?? "")}
                onChange={(e) => set(f.name, e.target.value)}
                required={f.required}
              >
                {!f.required && <option value="">—</option>}
                {(f.optionsKey ? dynamicOptions[f.optionsKey] ?? [] : (f.options ?? []).map((o) => ({ value: o, label: titleCase(o) }))).map(
                  (opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ),
                )}
              </Select>
            ) : (
              <Input
                type={f.type === "number" ? "number" : "text"}
                step="any"
                value={String(values[f.name] ?? "")}
                onChange={(e) => set(f.name, e.target.value)}
                placeholder={f.placeholder}
                required={f.required}
              />
            )}
          </Field>
        );
      })}
    </form>
  );
}
