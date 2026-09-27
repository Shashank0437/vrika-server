"use client";

import { useId, useState } from "react";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";
import { AgentChatMarkdown } from "./AgentChatMarkdown";
import { SessionDialog } from "./SessionDialog";
import type {
  AgentChatFindingSeverity,
  AgentChatSessionIntelligence,
} from "@/lib/agentChat";

const SEVERITY_STYLES: Record<AgentChatFindingSeverity, string> = {
  CRITICAL: "bg-red-100 text-red-900",
  HIGH: "bg-orange-100 text-orange-900",
  MEDIUM: "bg-amber-100 text-amber-900",
  LOW: "bg-blue-100 text-blue-900",
  INFO: "bg-slate-100 text-slate-800",
};
const TABS = [
  "Overview & report",
  "Targets & tools",
  "Findings",
  "Activity",
] as const;
const STATUS_LABELS = {
  IN_PROGRESS: "In progress",
  COMPLETED: "Complete",
  FAILED: "Failed",
};
const contentClass =
  "min-w-0 text-sm leading-7 text-on-surface [overflow-wrap:anywhere]";

function formatDate(value?: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not recorded"
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

export function SessionDetailsModal({
  open,
  onClose,
  session,
  reportBusy,
  reportAvailable,
  reportError,
  onReport,
}: {
  open: boolean;
  onClose: () => void;
  session: AgentChatSessionIntelligence;
  reportBusy: boolean;
  reportAvailable: boolean;
  reportError: string | null;
  onReport: () => void;
}) {
  const id = useId();
  const [tab, setTab] = useState(0);

  return (
    <SessionDialog open={open} onClose={onClose} labelledBy={`${id}-title`}>
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-outline-variant px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-xl font-bold">
            Command CTL
          </h2>
          <p className="mt-1 break-words text-sm text-on-surface-variant">
            {session.title}
          </p>
          <p className="mt-2 text-sm font-semibold text-primary">
            {STATUS_LABELS[session.status]}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Command CTL"
          className="shrink-0 rounded-lg p-2 hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-primary"
        >
          <MaterialSymbol name="close" />
        </button>
      </header>
      <div
        role="tablist"
        aria-label="Session details"
        className="flex shrink-0 overflow-x-auto border-b border-outline-variant px-3"
      >
        {TABS.map((label, index) => (
          <button
            key={label}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-selected={tab === index}
            aria-controls={`${id}-panel`}
            tabIndex={tab === index ? 0 : -1}
            onClick={() => setTab(index)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % TABS.length
                  : event.key === "ArrowLeft"
                    ? (index + TABS.length - 1) % TABS.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? TABS.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              setTab(next);
              document.getElementById(`${id}-tab-${next}`)?.focus();
            }}
            className={`shrink-0 border-b-2 px-3 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary ${
              tab === index
                ? "border-primary text-primary"
                : "border-transparent text-on-surface-variant hover:bg-surface-container"
            }`}
          >
            {label}
            {index === 2 ? ` (${session.findings.length})` : ""}
          </button>
        ))}
      </div>
      <div
        key={tab}
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${tab}`}
        tabIndex={0}
        className="min-h-0 overflow-y-auto p-5 focus-visible:outline-primary sm:p-6"
      >
        {tab === 0 && (
          <div className="space-y-6">
            <section>
              <h3 className="mb-3 text-base font-semibold">Session overview</h3>
              <AgentChatMarkdown
                text={
                  session.summary ||
                  "No summary is available yet. Run AI Analysis from Session History to review the recorded evidence."
                }
                className={contentClass}
              />
            </section>
            <dl className="grid gap-4 rounded-xl border border-outline-variant bg-surface-container-low p-4 text-sm sm:grid-cols-2">
              {[
                ["Executed by", session.executed_by || "Not recorded"],
                ["Started", formatDate(session.started_at)],
                [
                  "Completed",
                  session.status === "IN_PROGRESS"
                    ? "Still running"
                    : formatDate(session.completed_at),
                ],
                ["Session ID", session.session_id],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-on-surface-variant">{label}</dt>
                  <dd className="mt-1 font-medium [overflow-wrap:anywhere]">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <section className="rounded-xl border border-outline-variant p-4">
              <h3 className="text-base font-semibold">PDF report</h3>
              <p className="mt-1 text-sm leading-6 text-on-surface-variant">
                {reportAvailable
                  ? "Download the latest saved report for this session."
                  : "Generate and download a report from the recorded session findings."}
              </p>
              <button
                type="button"
                disabled={reportBusy}
                onClick={onReport}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary disabled:cursor-wait disabled:opacity-60"
              >
                <MaterialSymbol
                  name={reportBusy ? "progress_activity" : "picture_as_pdf"}
                  className={reportBusy ? "animate-spin" : ""}
                />
                {reportBusy
                  ? "Preparing report..."
                  : reportAvailable
                    ? "Download PDF report"
                    : "Generate PDF report"}
              </button>
              {reportError && (
                <p role="alert" className="mt-3 text-sm text-error">
                  {reportError}
                </p>
              )}
            </section>
          </div>
        )}
        {tab === 1 && (
          <div className="grid gap-6 sm:grid-cols-2">
            <section className="min-w-0">
              <h3 className="text-base font-semibold">
                Scan targets ({session.targets.length})
              </h3>
              <p className="mt-1 text-sm text-on-surface-variant">
                Targets recorded by this session.
              </p>
              <ul className="mt-3 space-y-2">
                {session.targets.map((target, index) => (
                  <li
                    key={`${target}-${index}`}
                    className="rounded-lg border border-outline-variant bg-surface-container-low p-3 font-mono text-sm [overflow-wrap:anywhere]"
                  >
                    {target}
                  </li>
                ))}
              </ul>
              {!session.targets.length && (
                <p className="mt-3 text-sm text-on-surface-variant">
                  No targets recorded.
                </p>
              )}
            </section>
            <section className="min-w-0">
              <h3 className="text-base font-semibold">
                Tools used ({session.tools_used.length})
              </h3>
              <p className="mt-1 text-sm text-on-surface-variant">
                Tools that contributed to the session.
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {session.tools_used.map((tool, index) => (
                  <li
                    key={`${tool}-${index}`}
                    className="max-w-full rounded-lg bg-primary-container px-3 py-2 text-sm font-medium text-on-primary-container [overflow-wrap:anywhere]"
                  >
                    {tool}
                  </li>
                ))}
              </ul>
              {!session.tools_used.length && (
                <p className="mt-3 text-sm text-on-surface-variant">
                  No tools recorded.
                </p>
              )}
            </section>
          </div>
        )}
        {tab === 2 && (
          <section className="space-y-4">
            <h3 className="text-base font-semibold">
              Evidence-backed findings
            </h3>
            {!session.findings.length && (
              <p className="text-sm leading-6 text-on-surface-variant">
                No evidence-backed findings have been recorded. This does not
                confirm that the target is free of vulnerabilities.
              </p>
            )}
            {session.findings.map((finding) => (
              <article
                key={finding.id}
                className="min-w-0 rounded-xl border border-outline-variant p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-md px-2 py-1 text-xs font-bold ${SEVERITY_STYLES[finding.severity]}`}
                  >
                    {finding.severity === "INFO"
                      ? "Informational"
                      : finding.severity}
                  </span>
                  <h4 className="min-w-0 text-base font-semibold [overflow-wrap:anywhere]">
                    {finding.name}
                  </h4>
                </div>
                <dl className="my-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="text-on-surface-variant">Affected target</dt>
                    <dd className="font-mono [overflow-wrap:anywhere]">
                      {finding.affected_target || "Not recorded"}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-on-surface-variant">Source tool</dt>
                    <dd className="[overflow-wrap:anywhere]">
                      {finding.source_tool || "Not recorded"}
                    </dd>
                  </div>
                </dl>
                <AgentChatMarkdown
                  text={
                    finding.details || "No additional description recorded."
                  }
                  className={contentClass}
                />
                <details className="mt-4 rounded-lg border border-outline-variant bg-surface-container-low">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
                    View full evidence
                  </summary>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap border-t border-outline-variant p-4 font-mono text-sm leading-6 [overflow-wrap:anywhere]">
                    {finding.evidence || "No evidence text recorded."}
                  </pre>
                </details>
              </article>
            ))}
          </section>
        )}
        {tab === 3 && (
          <section>
            <h3 className="mb-4 text-base font-semibold">
              Session activity ({session.timeline.length})
            </h3>
            {!session.timeline.length && (
              <p className="text-sm text-on-surface-variant">
                No activity recorded.
              </p>
            )}
            <ol className="space-y-4">
              {session.timeline.map((event, index) => (
                <li
                  key={`${event.timestamp}-${event.type}-${index}`}
                  className="border-l-2 border-primary/30 pl-4"
                >
                  <p className="text-sm text-on-surface-variant">
                    {formatDate(event.timestamp)}
                  </p>
                  <h4 className="mt-1 text-sm font-semibold [overflow-wrap:anywhere]">
                    {event.title}
                  </h4>
                  {event.details && (
                    <AgentChatMarkdown
                      text={event.details}
                      className={`mt-2 ${contentClass}`}
                    />
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
      <footer className="flex shrink-0 justify-end border-t border-outline-variant px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-sm font-semibold hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-primary"
        >
          Close
        </button>
      </footer>
    </SessionDialog>
  );
}
