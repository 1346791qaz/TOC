import * as React from "react";
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

export function Table({
  columns,
  children,
}: {
  columns: string[];
  children: React.ReactNode;
}) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-border text-left">
          {columns.map((c) => (
            <th
              key={c}
              className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {c}
            </th>
          ))}
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
