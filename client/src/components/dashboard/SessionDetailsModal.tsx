"use client";

import { MaterialSymbol } from "@/components/ui/MaterialSymbol";
import { formatDate } from "@/lib/utils"; // Assuming a common util exists or just use internal helper
import type { AgentChatSessionIntelligence } from "@/lib/agentChat";

type SessionDetailsModalProps = {
  open: boolean;
  onClose: () => void;
  session: AgentChatSessionIntelligence | null;
};

export function SessionDetailsModal({ open, onClose, session }: SessionDetailsModalProps) {
  if (!open || !session) return null;

  const formatDateHelper = (value: string) => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-2xl border border-outline-variant/60 bg-surface-container-lowest shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-outline-variant/50 px-6 py-5 bg-surface-container-lowest">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Session Intelligence</p>
            <h2 className="mt-1 text-xl font-bold text-on-surface">{session.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-high transition-colors"
            aria-label="Close"
          >
            <MaterialSymbol name="close" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[min(80vh,800px)] overflow-y-auto px-8 py-6 space-y-8 bg-surface">
          {/* Executive Summary */}
          <section>
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/30 pb-2">Overview</h3>
            <p className="mt-4 text-[15px] leading-[1.7] text-on-surface font-medium whitespace-pre-wrap">
              {session.summary || "No executive summary available."}
            </p>
          </section>

          {/* Tools & Targets */}
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-[13px] font-bold uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/30 pb-2">Tools Used</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {session.tools_used.length > 0 ? (
                  session.tools_used.map((tool) => (
                    <span key={tool} className="rounded-lg bg-surface-container-high px-3 py-1.5 text-[12px] font-bold text-on-surface-variant ring-1 ring-outline-variant/20">
                      {tool}
                    </span>
                  ))
                ) : (
                  <span className="text-[13px] text-on-surface-variant italic">No tools recorded.</span>
                )}
              </div>
            </div>
            <div>
              <h3 className="text-[13px] font-bold uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/30 pb-2">Targets</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {session.targets.length > 0 ? (
                  session.targets.map((target) => (
                    <span key={target} className="rounded-lg bg-surface-container-low px-3 py-1.5 text-[12px] font-bold text-on-surface-variant ring-1 ring-outline-variant/20">
                      {target}
                    </span>
                  ))
                ) : (
                  <span className="text-[13px] text-on-surface-variant italic">No targets identified.</span>
                )}
              </div>
            </div>
          </div>

          {/* Findings */}
          <section>
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/30 pb-2">Findings Summary</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {session.findings.length === 0 ? (
                <p className="text-[13px] text-on-surface-variant italic py-2">No evidence-backed vulnerabilities were extracted.</p>
              ) : (
                session.findings.map((finding) => (
                  <div key={finding.id} className="rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-5 py-4 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-lg px-2 py-0.5 text-[10px] font-black uppercase ring-1 ${
                        finding.severity === "CRITICAL" ? "bg-red-100 text-red-800 ring-red-200" :
                        finding.severity === "HIGH" ? "bg-orange-100 text-orange-800 ring-orange-200" :
                        "bg-surface-container-high text-on-surface-variant ring-outline-variant"
                      }`}>
                        {finding.severity}
                      </span>
                      <p className="text-[14px] font-bold text-on-surface">{finding.name}</p>
                    </div>
                    <p className="mt-3 text-[13px] leading-relaxed text-on-surface-variant">{finding.details}</p>
                    <div className="mt-3 pt-3 border-t border-outline-variant/30">
                      <p className="text-[11px] font-bold text-on-surface-variant/70 uppercase tracking-tighter">Evidence</p>
                      <p className="mt-1 line-clamp-3 text-[12px] text-on-surface-variant/80 font-mono bg-surface-container-low p-2 rounded-md">
                        {finding.evidence}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Timeline */}
          <section>
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/30 pb-2">Timeline</h3>
            <div className="mt-6 space-y-0 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[1px] before:bg-outline-variant/50">
              {session.timeline.slice(-12).map((event, idx) => (
                <div key={`${event.timestamp}-${event.type}-${idx}`} className="relative pl-8 pb-6 last:pb-0">
                  <div className="absolute left-0 top-1.5 size-[23px] rounded-full bg-surface border border-outline-variant flex items-center justify-center z-10">
                    <div className="size-2 rounded-full bg-primary" />
                  </div>
                  <p className="text-[11px] font-bold text-primary/70 tabular-nums">{formatDateHelper(event.timestamp)}</p>
                  <p className="mt-1 text-[14px] font-bold text-on-surface">{event.title}</p>
                  {event.details ? <p className="mt-1 text-[13px] text-on-surface-variant leading-snug">{event.details}</p> : null}
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-outline-variant/50 px-6 py-4 bg-surface-container-lowest">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-6 py-2.5 text-[14px] font-bold text-on-surface hover:bg-surface-container-high transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
