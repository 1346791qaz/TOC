import * as React from "react";
import { Button } from "./ui/primitives";

const STORAGE_KEY = "vsme_agreement_v1";

export function useAgreement() {
  const [showModal, setShowModal] = React.useState(false);
  const [checking, setChecking] = React.useState(
    () => localStorage.getItem(STORAGE_KEY) !== "accepted",
  );

  React.useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === "accepted") {
      setChecking(false);
      return;
    }
    fetch("/api/agreement/status")
      .then((r) => r.json())
      .then((data: { accepted: boolean }) => {
        if (data.accepted) {
          localStorage.setItem(STORAGE_KEY, "accepted");
        } else {
          setShowModal(true);
        }
      })
      .catch(() => setShowModal(true))
      .finally(() => setChecking(false));
  }, []);

  const accept = React.useCallback(() => {
    fetch("/api/agreement/accept", { method: "POST" }).catch(() => {});
    localStorage.setItem(STORAGE_KEY, "accepted");
    setShowModal(false);
    setChecking(false);
  }, []);

  return { showModal, checking, accept };
}

export function UserAgreementModal({ onAccept }: { onAccept: () => void }) {
  const [canAccept, setCanAccept] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Block Escape key — this modal cannot be dismissed without accepting.
  React.useEffect(() => {
    const block = (e: KeyboardEvent) => {
      if (e.key === "Escape") e.preventDefault();
    };
    window.addEventListener("keydown", block, { capture: true });
    return () => window.removeEventListener("keydown", block, { capture: true });
  }, []);

  const handleScroll = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Allow a 24px tolerance so the button unlocks just before the absolute bottom.
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
      setCanAccept(true);
    }
  }, []);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm">
      <div
        className="panel flex w-full max-w-2xl flex-col bg-surface-raised shadow-2xl"
        style={{ maxHeight: "88vh" }}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-border px-6 py-4">
          <div className="mb-1 flex items-center gap-3">
            <img src="/icon no bg.png" alt="" className="h-7 w-auto opacity-90" />
            <h2 className="text-base font-semibold tracking-tight">
              Nexum Solutions — User Agreement
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            This is a <strong>proof-of-concept demonstration</strong>. You must read and accept
            this agreement before proceeding. Do NOT use for actual business operations.
          </p>
        </div>

        {/* Scrollable body */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="min-h-0 flex-1 overflow-y-auto px-6 py-5 text-sm leading-relaxed text-foreground"
        >
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Please read carefully
          </p>

          <section className="space-y-4">
            <p>
              This User Agreement ("Agreement") governs your access to and use of the{" "}
              <strong>Value Stream Model Engine</strong> (the "Application"), a{" "}
              <strong>proof-of-concept demonstration</strong> developed by{" "}
              <strong>Nexum Solutions</strong> and its creator ("Owner"). By clicking "I Accept"
              you agree to be legally bound by every term below. If you do not agree, you must not
              use the Application.
            </p>

            <div>
              <h3 className="mb-1 font-semibold">1. Permitted Use — Demo / POC Only</h3>
              <p>
                Nexum Solutions grants you a limited, non-exclusive, non-transferable right to
                access and use the Application <strong>solely as a proof-of-concept or
                demonstration</strong> for evaluation purposes. You acknowledge and agree that
                this Application is in early/experimental stages and is{" "}
                <strong>NOT approved, certified, or intended for actual business operations</strong>.
              </p>
              <p className="mt-2 text-foreground/90">
                Any reliance on analysis, output, or decisions made using this Application for
                actual business purposes is entirely at your own risk and is explicitly
                unauthorized. Nexum Solutions bears no responsibility for any business decisions
                made based on this demo.
              </p>
            </div>

            <div>
              <h3 className="mb-1 font-semibold">2. Confidentiality and Non-Disclosure</h3>
              <p>
                All information, data, analyses, reports, outputs, methods, and any other content
                accessed through or generated by the Application is strictly confidential. You
                agree that you will not, directly or indirectly:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/90">
                <li>
                  Disclose, communicate, or reveal any content from or about the Application to
                  any third party;
                </li>
                <li>Share access to the Application with any unauthorized person;</li>
                <li>
                  Publish, post, transmit, or otherwise distribute any output or content derived
                  from the Application in any medium or form.
                </li>
              </ul>
            </div>

            <div>
              <h3 className="mb-1 font-semibold">3. Intellectual Property</h3>
              <p>
                The Application and all of its components — including but not limited to its
                software code, design, logic, analytical frameworks, methodologies, user
                interface, and documentation — are the exclusive intellectual property of Nexum
                Solutions and its creator. All rights are reserved. Nothing in this Agreement
                transfers any ownership interest to you. Any unauthorized use, reproduction, or
                distribution of the Application or its contents constitutes an infringement of
                the Owner's rights and may result in legal action.
              </p>
            </div>

            <div>
              <h3 className="mb-1 font-semibold">4. Prohibited Uses</h3>
              <p>You agree that you will not:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/90">
                <li>
                  Use the Application for any actual business operations, financial decisions, or
                  production work;
                </li>
                <li>
                  Copy, reproduce, reverse-engineer, decompile, disassemble, or create derivative
                  works from the Application or any part of it;
                </li>
                <li>
                  Use the Application for any purpose other than the specific authorized
                  proof-of-concept evaluation for which access was granted;
                </li>
                <li>
                  Remove, alter, or obscure any proprietary notices, trademarks, or branding
                  within the Application;
                </li>
                <li>
                  Circumvent or attempt to circumvent any security, access controls, or usage
                  tracking within the Application.
                </li>
              </ul>
            </div>

            <div>
              <h3 className="mb-1 font-semibold">5. No Warranties; Experimental Status</h3>
              <p>
                <strong>
                  The Application is provided "as is" without warranty of any kind, express or
                  implied.
                </strong>{" "}
                As an experimental proof-of-concept, Nexum Solutions makes no warranty that the
                Application will be reliable, uninterrupted, error-free, or that results will be
                accurate, complete, or fit for any business purpose whatsoever. Data loss,
                corruption, or unavailability may occur without notice.
              </p>
            </div>

            <div>
              <h3 className="mb-1 font-semibold">6. Limitation of Liability</h3>
              <p>
                In no event shall Nexum Solutions or its creator be liable for any direct,
                indirect, incidental, special, or consequential damages, including but not limited
                to lost profits, lost data, or business interruption, arising out of or in
                connection with your use of, or inability to use, the Application.
              </p>
            </div>

            <div>
              <h3 className="mb-1 font-semibold">7. Revocation of Access</h3>
              <p>
                Nexum Solutions reserves the right to revoke your access to the Application at
                any time without notice or cause. Upon revocation, all data generated or stored
                may be permanently deleted.
              </p>
            </div>

            <div>
              <h3 className="mb-1 font-semibold">8. Entire Agreement</h3>
              <p>
                This Agreement constitutes the entire understanding between you and Nexum
                Solutions regarding your use of the Application and supersedes any prior
                agreements or communications on this subject.
              </p>
            </div>

            <p className="rounded-md border border-status-critical/20 bg-status-critical/5 px-4 py-3 text-xs text-status-critical/90">
              <strong>⚠ Critical:</strong> This is a proof-of-concept demonstration only. Do NOT
              use for actual business decisions, operations, or as a production system. Unauthorized
              business use, disclosure, copying, or distribution may subject you to civil and
              criminal penalties under applicable law.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              {canAccept ? (
                <>
                  By clicking <strong>"I Accept"</strong> you confirm that you have read,
                  understood, and agree to be bound by this Agreement.
                </>
              ) : (
                <span className="flex items-center gap-1.5">
                  <span>↓</span>
                  <span>Scroll to the bottom to enable acceptance.</span>
                </span>
              )}
            </p>
            <Button
              onClick={onAccept}
              disabled={!canAccept}
              size="md"
              className="shrink-0 px-6"
            >
              I Accept
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
