import * as React from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Button, Input } from "./ui/primitives";

const SESSION_KEY = "vsme_session";
const SESSION_MS = 2 * 60 * 60 * 1000; // 2 hours

function isSessionValid(): boolean {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const { expiresAt } = JSON.parse(raw) as { expiresAt: number };
    return Date.now() < expiresAt;
  } catch {
    return false;
  }
}

export function useAuth() {
  const [needsPassword, setNeedsPassword] = React.useState(() => !isSessionValid());
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const login = React.useCallback(async (password: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ expiresAt: Date.now() + SESSION_MS }));
        setNeedsPassword(false);
      } else {
        setError("Incorrect password. Please try again.");
      }
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  return { needsPassword, login, error, loading };
}

export function PasswordModal({
  onLogin,
  error,
  loading,
}: {
  onLogin: (password: string) => void;
  error: string;
  loading: boolean;
}) {
  const [value, setValue] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);

  // Block Escape key.
  React.useEffect(() => {
    const block = (e: KeyboardEvent) => {
      if (e.key === "Escape") e.preventDefault();
    };
    window.addEventListener("keydown", block, { capture: true });
    return () => window.removeEventListener("keydown", block, { capture: true });
  }, []);

  const submit = () => {
    if (value.trim() && !loading) onLogin(value);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") submit();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm">
      <div className="panel w-full max-w-sm bg-surface-raised shadow-2xl">
        {/* Header */}
        <div className="border-b border-border px-6 py-4">
          <div className="mb-1 flex items-center gap-3">
            <img src="/icon no bg.png" alt="" className="h-7 w-auto opacity-90" />
            <h2 className="text-base font-semibold tracking-tight">Session Access</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Enter the access password to begin your session.
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Access Password</label>
            <div className="relative">
              <Lock size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                type={showPw ? "text" : "password"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={onKey}
                placeholder="Enter password…"
                className="pl-8 pr-9"
                autoFocus
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {error && <p className="text-xs text-status-critical">{error}</p>}
          </div>

          <Button onClick={submit} disabled={!value.trim() || loading} className="w-full">
            {loading ? "Checking…" : "Continue"}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Your session will expire after <strong>2 hours</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}
