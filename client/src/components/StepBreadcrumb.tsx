import { ChevronRight, Home } from "lucide-react";
import { useUi } from "@/store";
import { cn } from "@/lib/utils";

/**
 * Drill-down breadcrumb: Value Stream › Step › Sub-step › … Each crumb is
 * clickable to pop back up to that level. Renders only the root crumb when at
 * the top level.
 */
export function StepBreadcrumb({ valueStreamName }: { valueStreamName: string }) {
  const { stepPath, setStepPath, clearStepPath } = useUi();

  return (
    <nav
      data-testid="step-breadcrumb"
      className="flex items-center gap-1 text-xs"
      aria-label="Drill-down path"
    >
      <button
        onClick={clearStepPath}
        className={cn(
          "flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted",
          stepPath.length === 0 ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <Home size={12} />
        <span className="max-w-[180px] truncate">{valueStreamName}</span>
      </button>
      {stepPath.map((crumb, i) => {
        const last = i === stepPath.length - 1;
        return (
          <span key={crumb.id} className="flex items-center gap-1">
            <ChevronRight size={12} className="text-muted-foreground/50" />
            <button
              onClick={() => setStepPath(stepPath.slice(0, i + 1))}
              className={cn(
                "max-w-[180px] truncate rounded px-1.5 py-0.5 hover:bg-muted",
                last ? "font-medium text-primary" : "text-muted-foreground",
              )}
            >
              {crumb.name}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
