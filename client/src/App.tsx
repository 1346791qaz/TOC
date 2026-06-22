import { useEffect } from "react";
import {
  Activity,
  AlertTriangle,
  Boxes,
  Command,
  Database,
  GitBranch,
  ListChecks,
  Network,
  Share2,
  Trash2,
  Users,
  Workflow,
} from "lucide-react";
import { useUi, type ViewKey } from "./store";
import { useList } from "./lib/queries";
import type { Engagement, ValueStream } from "@shared/schemas";
import { LeftRail } from "./components/LeftRail";
import { CommandPalette } from "./components/CommandPalette";
import { useAgreement, UserAgreementModal } from "./components/UserAgreementModal";
import { useAuth, PasswordModal } from "./components/PasswordModal";
import { Overview } from "./views/Overview";
import { StepsView } from "./views/StepsView";
import { PersonasView } from "./views/PersonasView";
import { DataView } from "./views/DataView";
import { GapsView } from "./views/GapsView";
import { ConstraintsView } from "./views/ConstraintsView";
import { CandidatesView } from "./views/CandidatesView";
import { MetricsView } from "./views/MetricsView";
import { AssumptionsView } from "./views/AssumptionsView";
import { TrashView } from "./views/TrashView";
import { IoView } from "./views/IoView";
import { CanvasView } from "./views/CanvasView";

export interface NavItem {
  view: ViewKey;
  label: string;
  icon: React.ComponentType<{ size?: number | string }>;
  group: "analysis" | "model" | "system";
}

export const NAV: NavItem[] = [
  { view: "overview", label: "Overview", icon: Activity, group: "analysis" },
  { view: "canvas", label: "VS Graph", icon: Network, group: "analysis" },
  { view: "candidates", label: "Constraint Candidates", icon: GitBranch, group: "analysis" },
  { view: "gaps", label: "Data Gap Report", icon: AlertTriangle, group: "analysis" },
  { view: "steps", label: "Process Steps", icon: Workflow, group: "model" },
  { view: "personas", label: "Personas", icon: Users, group: "model" },
  { view: "data", label: "Data Elements", icon: Database, group: "model" },
  { view: "constraints", label: "Constraint Register", icon: ListChecks, group: "model" },
  { view: "metrics", label: "Metrics", icon: Boxes, group: "model" },
  { view: "assumptions", label: "Assumptions", icon: ListChecks, group: "model" },
  { view: "io", label: "Import / Export", icon: Share2, group: "system" },
  { view: "trash", label: "Trash", icon: Trash2, group: "system" },
];

export default function App() {
  const { showModal, checking: checkingAgreement, accept } = useAgreement();
  const { needsPassword, login, error: loginError, loading: loginLoading } = useAuth();
  const { engagementId, valueStreamId, view, setEngagement, setValueStream, setCommandOpen } =
    useUi();

  const engagements = useList<Engagement>("engagements");
  const valueStreams = useList<ValueStream>(
    "value_streams",
    engagementId ? { where: { engagement_id: engagementId }, orderBy: "created_at ASC" } : undefined,
    !!engagementId,
  );

  // Bootstrap: default to the first engagement / value stream.
  useEffect(() => {
    if (!engagementId && engagements.data?.length) setEngagement(engagements.data[0].id);
  }, [engagementId, engagements.data, setEngagement]);
  useEffect(() => {
    if (engagementId && !valueStreamId && valueStreams.data?.length)
      setValueStream(valueStreams.data[0].id);
  }, [engagementId, valueStreamId, valueStreams.data, setValueStream]);

  // Cmd/Ctrl-K command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCommandOpen]);

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
        <img src="/icon no bg.png" alt="Nexum Solutions" className="h-8 w-auto" />
        <img src="/name and slogan trimmed no bg.png" alt="Nexum Solutions — Guiding Success Through Connection" className="h-7 w-auto" />
        <div className="mx-2 h-6 w-px bg-border" />
        <span className="text-sm font-semibold tracking-tight text-foreground">
          Value Stream Model Engine
        </span>
        <button
          onClick={() => setCommandOpen(true)}
          className="ml-auto flex items-center gap-1.5 rounded-md border border-border bg-input px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Command size={12} /> Jump to… <span className="mono ml-1 opacity-70">⌘K</span>
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <LeftRail
          engagements={engagements.data ?? []}
          valueStreams={valueStreams.data ?? []}
        />
        <main className="min-w-0 flex-1 overflow-hidden">
          {!valueStreamId ? (
            <EmptyState />
          ) : (
            <ViewRouter view={view} valueStreamId={valueStreamId} engagementId={engagementId!} />
          )}
        </main>
      </div>

      <CommandPalette />
      {showModal && <UserAgreementModal onAccept={accept} />}
      {!checkingAgreement && !showModal && needsPassword && (
        <PasswordModal onLogin={login} error={loginError} loading={loginLoading} />
      )}
    </div>
  );
}

function ViewRouter({
  view,
  valueStreamId,
  engagementId,
}: {
  view: ViewKey;
  valueStreamId: string;
  engagementId: string;
}) {
  switch (view) {
    case "overview":
      return <Overview vsId={valueStreamId} />;
    case "canvas":
      return <CanvasView vsId={valueStreamId} />;
    case "candidates":
      return <CandidatesView vsId={valueStreamId} />;
    case "gaps":
      return <GapsView vsId={valueStreamId} />;
    case "steps":
      return <StepsView vsId={valueStreamId} />;
    case "personas":
      return <PersonasView vsId={valueStreamId} />;
    case "data":
      return <DataView vsId={valueStreamId} />;
    case "constraints":
      return <ConstraintsView vsId={valueStreamId} />;
    case "metrics":
      return <MetricsView vsId={valueStreamId} />;
    case "assumptions":
      return <AssumptionsView vsId={valueStreamId} />;
    case "trash":
      return <TrashView vsId={valueStreamId} />;
    case "io":
      return <IoView engagementId={engagementId} vsId={valueStreamId} />;
    default:
      return null;
  }
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
      <img src="/icon no bg.png" alt="" className="h-16 w-auto opacity-40" />
      <p className="text-sm">Select or create an engagement and value stream to begin mapping.</p>
      <p className="text-xs opacity-70">The left rail is your entry point.</p>
    </div>
  );
}
