"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";
import { Tooltip } from "@/components/ui/Tooltip";
import { SessionAnalysisModal } from "@/components/dashboard/SessionAnalysisModal";
import { SessionDetailsModal } from "@/components/dashboard/SessionDetailsModal";
import {
  analyzeAgentChatSession,
  downloadAgentChatAttachment,
  generateAgentChatSessionReport,
  listAgentChatSessionIntelligence,
  type AgentChatAttachment,
  type AgentChatFindingSeverity,
  type AgentChatSessionIntelligence,
  type AgentChatSessionStatus,
} from "@/lib/agentChat";

const STATUS_LABELS: Record<AgentChatSessionStatus, string> = {
  IN_PROGRESS: "IN PROGRESS",
  COMPLETED: "COMPLETE",
  FAILED: "FAILED",
};

const SEVERITY_ORDER: AgentChatFindingSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

function sxId(sessionId: string): string {
  return `#SX-${sessionId.replace(/[^a-fA-F0-9]/g, "").slice(-5).toUpperCase() || "00000"}`;
}

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function statusClass(status: AgentChatSessionStatus): string {
  if (status === "COMPLETED") return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200";
  if (status === "FAILED") return "bg-red-50 text-red-800 ring-1 ring-red-100";
  return "bg-primary-container text-on-primary-container ring-1 ring-primary/20";
}

function severityChips(row: AgentChatSessionIntelligence): string[] {
  return SEVERITY_ORDER.flatMap((sev) => {
    const key = sev.toLowerCase() as keyof AgentChatSessionIntelligence["findings_count"];
    const n = Number(row.findings_count[key] ?? 0);
    if (n <= 0) return [];
    const label = sev === "CRITICAL" ? "CRIT" : sev.slice(0, 3);
    return [`${n} ${label}`];
  });
}

function reportAvailable(row: AgentChatSessionIntelligence): boolean {
  return Boolean(row.report_metadata?.available || row.findings.length > 0 || row.summary);
}

function latestReportAttachment(row: AgentChatSessionIntelligence): AgentChatAttachment | null {
  const latest = row.report_metadata?.latest_attachment;
  if (latest && typeof latest === "object") {
    const a = latest as Record<string, unknown>;
    if (typeof a.id === "string" && typeof a.filename === "string") {
      return {
        id: a.id,
        filename: a.filename,
        content_type: typeof a.content_type === "string" ? a.content_type : "application/pdf",
      };
    }
  }
  const attachments = row.report_metadata?.attachments;
  if (!Array.isArray(attachments)) return null;
  for (let i = attachments.length - 1; i >= 0; i--) {
    const raw = attachments[i];
    if (!raw || typeof raw !== "object") continue;
    const a = raw as Record<string, unknown>;
    if (typeof a.id === "string" && typeof a.filename === "string") {
      return {
        id: a.id,
        filename: a.filename,
        content_type: typeof a.content_type === "string" ? a.content_type : "application/pdf",
      };
    }
  }
  return null;
}

function sortRows(
  rows: AgentChatSessionIntelligence[],
  sortMode: "newest" | "oldest",
): AgentChatSessionIntelligence[] {
  return [...rows].sort((a, b) => {
    const da = new Date(a.started_at).getTime() || 0;
    const db = new Date(b.started_at).getTime() || 0;
    return sortMode === "newest" ? db - da : da - db;
  });
}

export function DashboardSessionsHome() {
  const [rows, setRows] = useState<AgentChatSessionIntelligence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<AgentChatSessionStatus | "ALL">("ALL");
  const [severityFilter, setSeverityFilter] = useState<AgentChatFindingSeverity | "ALL">("ALL");
  const [sortMode, setSortMode] = useState<"newest" | "oldest">("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reportBusyId, setReportBusyId] = useState<string | null>(null);
  const [analyzeBusyId, setAnalyzeBusyId] = useState<string | null>(null);
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  const [analysisSummary, setAnalysisSummary] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisTitle, setAnalysisTitle] = useState("");
  const [reportError, setReportError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, statusFilter, severityFilter, sortMode]);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    try {
      const data = await listAgentChatSessionIntelligence();
      setRows(data);
      setError(null);
      setSelectedId((current) => (current && data.some((row) => row.session_id === current) ? current : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(true), 5000);
    return () => window.clearInterval(timer);
  }, []);

  async function downloadReport(sessionId: string, attachment: AgentChatAttachment) {
    const { blob, filename } = await downloadAgentChatAttachment(sessionId, attachment.id);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || attachment.filename || "penetration-report.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  async function generateReport(row: AgentChatSessionIntelligence, { downloadAfter = false } = {}) {
    setReportBusyId(row.session_id);
    setReportError(null);
    try {
      const result = await generateAgentChatSessionReport(row.session_id);
      await load(true);
      if (downloadAfter && result.attachment) {
        await downloadReport(row.session_id, result.attachment);
      }
    } catch (e) {
      setReportError(e instanceof Error ? e.message : String(e));
    } finally {
      setReportBusyId(null);
    }
  }

  async function handleReportAction(row: AgentChatSessionIntelligence) {
    const attachment = latestReportAttachment(row);
    setReportError(null);
    if (attachment) {
      try {
        await downloadReport(row.session_id, attachment);
      } catch (e) {
        setReportError(e instanceof Error ? e.message : String(e));
      }
      return;
    }
    await generateReport(row);
  }

  async function handleAnalyze(row: AgentChatSessionIntelligence) {
    setAnalyzeBusyId(row.session_id);
    setAnalysisModalOpen(true);
    setAnalysisSummary(null);
    setAnalysisError(null);
    setAnalysisTitle(row.title);
    setReportError(null);
    try {
      const res = await analyzeAgentChatSession(row.session_id);
      if (res.success && res.result) {
        try {
          const parsed = JSON.parse(res.result);
          setAnalysisSummary(parsed.summary || "No summary provided by AI.");
        } catch {
          setAnalysisSummary(res.result);
        }
      }
      await load(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAnalysisError(msg);
      setReportError(msg);
    } finally {
      setAnalyzeBusyId(null);
    }
  }

  const metrics = useMemo(() => {
    const totalSessions = rows.length;
    const totalFindings = rows.reduce((sum, row) => sum + Number(row.findings_count.total ?? 0), 0);
    const critical = rows.reduce((sum, row) => sum + Number(row.findings_count.critical ?? 0), 0);
    const withSeconds = rows.filter((row) => Number(row.average_time_to_breach_seconds ?? 0) > 0);
    const avgSeconds =
      withSeconds.length > 0
        ? withSeconds.reduce((sum, row) => sum + Number(row.average_time_to_breach_seconds ?? 0), 0) / withSeconds.length
        : 0;
    return [
      {
        label: "Total scans",
        value: String(totalSessions),
        sub: totalSessions === 1 ? "+1 intelligence session" : `+${totalSessions} intelligence sessions`,
        trend: "up" as const,
        icon: "description",
      },
      {
        label: "Vulnerabilities found",
        value: String(totalFindings),
        sub: critical > 0 ? `${critical} critical active` : "Evidence-backed findings",
        trend: null,
        icon: "verified_user",
      },
      {
        label: "Avg. time to breach",
        value: formatDuration(avgSeconds),
        sub: "Unique active tool time",
        trend: null,
        icon: "schedule",
      },
    ];
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (statusFilter !== "ALL" && row.status !== statusFilter) return false;
      if (severityFilter !== "ALL") {
        const key = severityFilter.toLowerCase() as keyof AgentChatSessionIntelligence["findings_count"];
        if (Number(row.findings_count[key] ?? 0) <= 0) return false;
      }
      if (!q) return true;
      const haystack = [
        row.title,
        row.summary,
        sxId(row.session_id),
        row.session_id,
        row.executed_by || "",
        ...row.targets,
        ...row.tools_used,
        ...row.findings.map((f) => `${f.name} ${f.affected_target} ${f.source_tool}`),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
    return sortRows(filtered, sortMode);
  }, [query, rows, severityFilter, sortMode, statusFilter]);

  const totalItems = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validPage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedRows = useMemo(() => {
    const start = (validPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, validPage, pageSize]);
  const startItem = totalItems === 0 ? 0 : (validPage - 1) * pageSize + 1;
  const endItem = Math.min(validPage * pageSize, totalItems);

  const selected = selectedId ? rows.find((row) => row.session_id === selectedId) ?? null : null;

  return (
    <div className="mx-auto max-w-[1360px] px-8 py-6">
      <header className="mb-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Web Security</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-on-surface">Session History</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Manage and review offensive security operations and automated breach reports.
        </p>
      </header>

      {/* KPI Cards matching Figma */}
      <div className="grid gap-5 md:grid-cols-3">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="flex items-center gap-4 rounded-2xl border border-outline-variant/60 bg-surface px-6 py-5 shadow-xs transition-shadow hover:shadow-sm"
          >
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <MaterialSymbol name={m.icon} className="text-2xl" filled />
            </div>
            <div>
              <p className="text-xs font-medium text-on-surface-variant">{m.label}</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-on-surface">{m.value}</p>
              <p className="mt-1 flex items-center gap-1 text-xs text-on-surface-variant font-medium">
                {m.trend === "up" ? (
                  <span className="text-emerald-600 font-semibold flex items-center gap-0.5">
                    <MaterialSymbol name="trending_up" className="text-base" filled />
                    {m.sub}
                  </span>
                ) : (
                  m.sub
                )}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-outline-variant/70 bg-surface shadow-xs">
        <div className="flex flex-col gap-4 border-b border-outline-variant/70 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block max-w-xl flex-1">
            <MaterialSymbol
              name="search"
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              placeholder="Search by target or session ID…"
              className="h-10 w-full rounded-xl border border-outline-variant/70 bg-surface-container-lowest py-2 pr-3 pl-10 text-sm text-on-surface outline-none transition-[border-color,box-shadow] placeholder:text-on-surface-variant focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </label>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-outline-variant/70 px-4 text-xs font-semibold text-on-surface hover:bg-surface-container-high transition-colors"
            >
              <MaterialSymbol name="filter_list" className="text-base text-on-surface-variant" /> Filter
            </button>
            <button
              type="button"
              onClick={() => setSortMode((v) => (v === "newest" ? "oldest" : "newest"))}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-outline-variant/70 px-4 text-xs font-semibold text-on-surface hover:bg-surface-container-high transition-colors"
            >
              <span>Sort: {sortMode === "newest" ? "Newest" : "Oldest"}</span>
              <MaterialSymbol name="expand_more" className="text-base text-on-surface-variant" />
            </button>
          </div>
        </div>

        {showFilters ? (
          <div className="flex flex-wrap gap-2 border-b border-outline-variant/70 px-6 py-3 text-xs">
            {(["ALL", "IN_PROGRESS", "COMPLETED", "FAILED"] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-full px-3 py-1 font-bold transition-colors ${
                  statusFilter === status ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface-variant"
                }`}
              >
                {status === "ALL" ? "All statuses" : STATUS_LABELS[status]}
              </button>
            ))}
            {(["ALL", ...SEVERITY_ORDER] as const).map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => setSeverityFilter(sev)}
                className={`rounded-full px-3 py-1 font-bold transition-colors ${
                  severityFilter === sev ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface-variant"
                }`}
              >
                {sev === "ALL" ? "All severities" : sev}
              </button>
            ))}
          </div>
        ) : null}

        {error ? (
          <div className="border-b border-outline-variant px-6 py-3 text-xs font-semibold text-red-700">
            {error}
          </div>
        ) : null}
        {reportError ? (
          <div className="border-b border-outline-variant px-6 py-3 text-xs font-semibold text-red-700">
            {reportError}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-outline-variant/70 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                <th className="px-6 py-3.5">
                  <div className="flex items-center gap-1.5 cursor-pointer select-none" onClick={() => setSortMode((v) => (v === "newest" ? "oldest" : "newest"))}>
                    <span>Target</span>
                    <MaterialSymbol name="unfold_more" className="text-sm text-on-surface-variant/60" />
                  </div>
                </th>
                <th className="px-6 py-3.5">
                  <div className="flex items-center gap-1.5 cursor-pointer select-none">
                    <span>Status</span>
                    <MaterialSymbol name="unfold_more" className="text-sm text-on-surface-variant/60" />
                  </div>
                </th>
                <th className="px-6 py-3.5">
                  <div className="flex items-center gap-1.5 cursor-pointer select-none" onClick={() => setSortMode((v) => (v === "newest" ? "oldest" : "newest"))}>
                    <span>Date started</span>
                    <MaterialSymbol name="unfold_more" className="text-sm text-on-surface-variant/60" />
                  </div>
                </th>
                <th className="px-6 py-3.5">
                  <div className="flex items-center gap-1.5 cursor-pointer select-none">
                    <span>Executed By</span>
                    <MaterialSymbol name="unfold_more" className="text-sm text-on-surface-variant/60" />
                  </div>
                </th>
                <th className="px-6 py-3.5">
                  <div className="flex items-center gap-1.5 cursor-pointer select-none">
                    <span>Findings</span>
                    <MaterialSymbol name="unfold_more" className="text-sm text-on-surface-variant/60" />
                  </div>
                </th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-on-surface-variant">
                    Loading session intelligence…
                  </td>
                </tr>
              ) : paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="mx-auto max-w-md">
                      <MaterialSymbol name="travel_explore" className="text-4xl text-primary" />
                      <p className="mt-3 text-sm font-bold text-on-surface">No completed tool sessions yet</p>
                      <p className="mt-1 text-xs text-on-surface-variant">
                        Sessions appear here after a chat thread successfully executes at least one tool.
                      </p>
                      <Link
                        href="/dashboard/scan?new=1"
                        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-on-primary hover:opacity-90 transition-opacity"
                      >
                        <MaterialSymbol name="add" className="text-base text-on-primary" filled />
                        Start scan
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedRows.map((r) => {
                  const chips = severityChips(r);
                  const reportAttachment = latestReportAttachment(r);
                  const reportBusy = reportBusyId === r.session_id;
                  const isHttp = r.targets[0]?.startsWith("http");
                  return (
                    <tr key={r.session_id} className="border-b border-outline-variant/60 hover:bg-primary-container/[0.08] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <MaterialSymbol name={isHttp ? "language" : "computer"} className="text-base" filled />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-on-surface text-sm leading-snug">{r.title}</p>
                            <p className="text-xs text-on-surface-variant font-mono mt-0.5">
                              {sxId(r.session_id)}{r.targets[0] ? ` · ${r.targets[0]}` : ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          r.status === "COMPLETED"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                            : r.status === "FAILED"
                              ? "bg-red-50 text-red-700 border border-red-200/80"
                              : "bg-primary-container text-on-primary-container border border-primary/20"
                        }`}>
                          <span className={`size-1.5 rounded-full ${
                            r.status === "COMPLETED"
                              ? "bg-emerald-500"
                              : r.status === "FAILED"
                                ? "bg-red-500"
                                : "bg-primary"
                          }`} />
                          {STATUS_LABELS[r.status]}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-on-surface-variant">{formatDate(r.started_at)}</td>
                      <td className="px-6 py-4 text-xs text-on-surface-variant font-medium whitespace-nowrap">{r.executed_by || "—"}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {chips.length === 0 ? (
                            <span className="text-on-surface-variant text-xs">—</span>
                          ) : (
                            chips.map((f) => (
                              <span
                                key={f}
                                className="rounded-md bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-semibold"
                              >
                                {f}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex gap-1 text-on-surface-variant">
                          <Tooltip content={reportAvailable(r) ? "Description and report" : "Description"} align="right">
                            <button
                              type="button"
                              onClick={() => setSelectedId((current) => (current === r.session_id ? null : r.session_id))}
                              className="rounded-lg p-1.5 hover:bg-surface-container hover:text-primary transition-colors"
                            >
                              <MaterialSymbol name="description" filled className="text-lg" />
                            </button>
                          </Tooltip>

                          <Tooltip content="Scan Target" align="right">
                            <button
                              type="button"
                              onClick={() => setSelectedId((current) => (current === r.session_id ? null : r.session_id))}
                              className="rounded-lg p-1.5 hover:bg-surface-container hover:text-primary transition-colors"
                            >
                              <MaterialSymbol name="radar" filled className="text-lg" />
                            </button>
                          </Tooltip>

                          <Tooltip content={analyzeBusyId === r.session_id ? "Analyzing session…" : "Run AI Analysis"} align="right">
                            <button
                              type="button"
                              disabled={analyzeBusyId === r.session_id}
                              onClick={() => handleAnalyze(r)}
                              className="rounded-lg p-1.5 hover:bg-surface-container hover:text-primary transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <MaterialSymbol
                                name={analyzeBusyId === r.session_id ? "progress_activity" : "analytics"}
                                className={analyzeBusyId === r.session_id ? "animate-spin text-lg" : "text-lg"}
                                filled
                              />
                            </button>
                          </Tooltip>

                          <Tooltip content="Terminal" align="right">
                            <Link
                              href={`/dashboard/scan?chat_id=${encodeURIComponent(r.session_id)}`}
                              className="rounded-lg p-1.5 hover:bg-surface-container hover:text-primary transition-colors"
                            >
                              <MaterialSymbol name="terminal" filled className="text-lg" />
                            </Link>
                          </Tooltip>

                          <Tooltip
                            align="right"
                            content={
                              reportBusy
                                ? "Generating PDF report…"
                                : reportAttachment
                                  ? "Download PDF report"
                                  : "Generate PDF report"
                            }
                          >
                            <button
                              type="button"
                              disabled={reportBusy}
                              onClick={() => handleReportAction(r)}
                              className={`rounded-lg p-1.5 hover:bg-surface-container transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                                reportAttachment
                                  ? "text-emerald-700 hover:text-emerald-800"
                                  : "text-primary hover:text-primary"
                              }`}
                            >
                              <MaterialSymbol
                                name={reportBusy ? "progress_activity" : reportAttachment ? "picture_as_pdf" : "note_add"}
                                className={reportBusy ? "animate-spin text-lg" : "text-lg"}
                                filled
                              />
                            </button>
                          </Tooltip>

                          <button
                            type="button"
                            onClick={() => setSelectedId((current) => (current === r.session_id ? null : r.session_id))}
                            className="rounded-lg p-1.5 hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors"
                          >
                            <MaterialSymbol name="more_vert" className="text-lg" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination matching Figma */}
        <div className="flex flex-col gap-3 border-t border-outline-variant/70 px-6 py-4 text-xs text-on-surface-variant sm:flex-row sm:items-center sm:justify-between">
          <span>
            Showing {startItem}–{endItem} of {totalItems} sessions
          </span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={validPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="flex size-8 items-center justify-center rounded-lg border border-outline-variant/60 text-on-surface-variant hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Previous page"
              >
                <MaterialSymbol name="chevron_left" className="text-lg" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .slice(0, 5)
                .map((page) => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setCurrentPage(page)}
                    className={`flex size-8 items-center justify-center rounded-lg text-xs font-bold transition-colors ${
                      page === validPage
                        ? "bg-primary text-on-primary shadow-xs"
                        : "text-on-surface-variant hover:bg-surface-container"
                    }`}
                  >
                    {page}
                  </button>
                ))}
              <button
                type="button"
                disabled={validPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="flex size-8 items-center justify-center rounded-lg border border-outline-variant/60 text-on-surface-variant hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Next page"
              >
                <MaterialSymbol name="chevron_right" className="text-lg" />
              </button>
            </div>

            <div className="relative">
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="h-8 appearance-none rounded-lg border border-outline-variant/70 bg-surface pl-3 pr-7 text-xs font-medium text-on-surface outline-none cursor-pointer hover:bg-surface-container-low transition-colors"
              >
                <option value={5}>5 per page</option>
                <option value={10}>10 per page</option>
                <option value={20}>20 per page</option>
                <option value={50}>50 per page</option>
              </select>
              <MaterialSymbol
                name="expand_more"
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant"
              />
            </div>
          </div>
        </div>
      </div>

      <SessionDetailsModal
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
        session={selected}
      />

      <SessionAnalysisModal
        open={analysisModalOpen}
        onClose={() => setAnalysisModalOpen(false)}
        loading={!!analyzeBusyId}
        summary={analysisSummary}
        error={analysisError}
        title={analysisTitle}
      />
    </div>
  );
}
