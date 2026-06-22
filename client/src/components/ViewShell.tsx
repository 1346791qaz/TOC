import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function ViewShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold">{title}</h1>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
    </div>
  );
}

export function SearchBar({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative flex items-center">
      <Search size={12} className="absolute left-2 text-muted-foreground pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-7 w-44 rounded-md border border-border bg-input pl-6 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    </div>
  );
}

export type SortDir = "asc" | "desc";

export function Table({
  columns,
  sortCol,
  sortDir,
  onSort,
  children,
}: {
  columns: string[];
  sortCol?: string;
  sortDir?: SortDir;
  onSort?: (col: string) => void;
  children: React.ReactNode;
}) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-border text-left">
          {columns.map((c) => {
            const sortable = onSort && c !== "";
            const active = sortCol === c;
            return (
              <th
                key={c}
                onClick={sortable ? () => onSort(c) : undefined}
                className={cn(
                  "px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground select-none",
                  sortable && "cursor-pointer hover:text-foreground",
                  active && "text-foreground",
                )}
              >
                {c}
                {active && (
                  <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export function Tr({
  onClick,
  active,
  children,
}: {
  onClick?: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "border-b border-border/60 align-top",
        onClick && "cursor-pointer hover:bg-muted/40",
        active && "bg-primary/10",
      )}
    >
      {children}
    </tr>
  );
}

export function Td({ className, children }: { className?: string; children: React.ReactNode }) {
  return <td className={cn("px-2 py-1.5", className)}>{children}</td>;
}

export function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
