"use client";
import { useAuth } from "@/lib/auth-context";
import { canStartScan, hasPermission } from "@/lib/access";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProjectScope } from "@/lib/use-project-scope";
import { matchesProject, projectHref, UNASSIGNED_PROJECT } from "@/lib/projects";
import { ProjectScopePicker } from "./ProjectScopePicker";
import { ApiError } from "@/lib/api";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";
import { Tooltip } from "@/components/ui/Tooltip";
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

function SessionPanelLoading() {
  return <p role="status" className="fixed bottom-4 right-4 z-50 rounded-lg border border-outline-variant bg-surface px-4 py-3 text-sm shadow-lg">Loading session details...</p>;
}

const SessionDetailsModal = dynamic(
  () => import("./SessionDetailsModal").then((module) => module.SessionDetailsModal),
  { loading: SessionPanelLoading },
);
const SessionAnalysisModal = dynamic(
  () => import("./SessionAnalysisModal").then((module) => module.SessionAnalysisModal),
  { loading: SessionPanelLoading },
);

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

function severityChips(row: AgentChatSessionIntelligence): string[] {
  return SEVERITY_ORDER.flatMap((sev) => {
    const key = sev.toLowerCase() as keyof AgentChatSessionIntelligence["findings_count"];
    const n = Number(row.findings_count[key] ?? 0);
    if (n <= 0) return [];
    const label = sev === "CRITICAL" ? "CRIT" : sev.slice(0, 3);
    return [`${n} ${label}`];
  });
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
  const { user } = useAuth();
  const project = useProjectScope(user, "web_security");
  const [rowsByProject, setRowsByProject] = useState<Record<string, AgentChatSessionIntelligence[]>>({});
  const requestId = useRef(0);
  const pendingRequest = useRef<{ scope: string; id: number } | null>(null);
  const invalidateRequests = useCallback(() => { requestId.current++; pendingRequest.current = null; }, []);
  const canExecute = (row: AgentChatSessionIntelligence) => hasPermission(user, "execute", { module: "web_security", projectId: row.project_id });
  const rows = useMemo(() => (rowsByProject[project.scope] ?? []).filter((row) => matchesProject(row.project_id, project.scope)), [rowsByProject, project.scope]);
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
    setSelectedId(null);
  }, [query, statusFilter, severityFilter, sortMode, project.scope]);

  const load = useCallback(async (silent = false) => {
    if (!project.ready) return;
    if (pendingRequest.current?.scope === project.scope) return;
    const id = ++requestId.current;
    pendingRequest.current = { scope: project.scope, id };
    if (!silent) setLoading(true);
    try {
      const data = await listAgentChatSessionIntelligence(project.scope);
      if (id !== requestId.current) return;
      setRowsByProject((previous) => ({ ...previous, [project.scope]: data }));
      setError(null);
      setSelectedId((current) => (current && data.some((row) => row.session_id === current) ? current : null));
    } catch (e) {
      if (id === requestId.current) {
        setError(e instanceof Error ? e.message : String(e));
        if (e instanceof ApiError && (e.status === 403 || e.status === 404)) {
          setRowsByProject((previous) => ({ ...previous, [project.scope]: [] }));
          setSelectedId(null);
        }
      }
    } finally {
      if (id === requestId.current) setLoading(false);
      if (pendingRequest.current?.id === id) pendingRequest.current = null;
    }
  }, [project.ready, project.scope]);

  useEffect(() => {
    setError(null);
    void load();
    const timer = window.setInterval(() => load(true), 5000);
    return () => { window.clearInterval(timer); invalidateRequests(); };
  }, [load, invalidateRequests]);

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

  async function handleReportAction(row: AgentChatSessionIntelligence) {
    if (!latestReportAttachment(row) && !canExecute(row)) return;
    if (reportBusyId) return;
    setReportBusyId(row.session_id);
    setReportError(null);
    try {
      let attachment = latestReportAttachment(row);
      if (!attachment) {
        const result = await generateAgentChatSessionReport(row.session_id);
        await load(true);
        attachment = result.attachment ?? null;
        if (!attachment) throw new Error("The report did not return a downloadable file. Please try again.");
      }
      await downloadReport(row.session_id, attachment);
    } catch (e) {
      setReportError(e instanceof Error ? e.message : String(e));
    } finally {
      setReportBusyId(null);
    }
  }

  async function handleAnalyze(row: AgentChatSessionIntelligence) {
    if (!canExecute(row)) return;
    if (analyzeBusyId) return;
    setAnalyzeBusyId(row.session_id);
    setAnalysisModalOpen(true);
    setAnalysisSummary(null);
    setAnalysisError(null);
    setAnalysisTitle(row.title);
    setReportError(null);
    try {
      const res = await analyzeAgentChatSession(row.session_id);
      if (!res.success || !res.result) throw new Error("No analysis was returned. Please try again.");
      let summary = res.result;
      try {
        const parsed: unknown = JSON.parse(res.result);
        if (parsed && typeof parsed === "object" && "summary" in parsed && typeof parsed.summary === "string") {
          summary = parsed.summary;
        }
      } catch {
        // The analysis endpoint also returns plain Markdown.
      }
      setAnalysisSummary(summary);
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
      <ProjectScopePicker context={project} label="Web project" portal />
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
              <p className="mt-1 text-2xl font-bold tracking-tight text-on-surface">{loading && !rows.length ? "—" : m.value}</p>
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
          <div role="alert" className="border-b border-outline-variant px-6 py-3 text-xs font-semibold text-red-700">
            {error} <button type="button" className="ml-2 underline" onClick={() => void load(true)}>Retry</button>
          </div>
        ) : null}
        {reportError ? (
          <div role="alert" className="border-b border-outline-variant px-6 py-3 text-sm font-semibold text-red-700">
            {reportError}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-[1000px] w-full table-fixed border-collapse text-left text-sm">
            <colgroup>
              <col />
              <col className="w-[110px]" />
              <col className="w-[125px]" />
              <col className="w-[150px]" />
              <col className="w-[110px]" />
              <col className="w-[280px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-outline-variant/70 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">
                <th className="px-4 py-3.5 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 cursor-pointer select-none" onClick={() => setSortMode((v) => (v === "newest" ? "oldest" : "newest"))}>
                    <span className="whitespace-nowrap">Target</span>
                    <MaterialSymbol name="unfold_more" className="text-sm text-on-surface-variant/60" />
                  </div>
                </th>
                <th className="px-4 py-3.5 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 cursor-pointer select-none">
                    <span className="whitespace-nowrap">Status</span>
                    <MaterialSymbol name="unfold_more" className="text-sm text-on-surface-variant/60" />
                  </div>
                </th>
                <th className="px-4 py-3.5 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 cursor-pointer select-none" onClick={() => setSortMode((v) => (v === "newest" ? "oldest" : "newest"))}>
                    <span className="whitespace-nowrap">Date started</span>
                    <MaterialSymbol name="unfold_more" className="text-sm text-on-surface-variant/60" />
                  </div>
                </th>
                <th className="px-4 py-3.5 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 cursor-pointer select-none">
                    <span className="whitespace-nowrap">Executed By</span>
                    <MaterialSymbol name="unfold_more" className="text-sm text-on-surface-variant/60" />
                  </div>
                </th>
                <th className="px-4 py-3.5 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 cursor-pointer select-none">
                    <span className="whitespace-nowrap">Findings</span>
                    <MaterialSymbol name="unfold_more" className="text-sm text-on-surface-variant/60" />
                  </div>
                </th>
                <th className="px-4 py-3.5 whitespace-nowrap text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!project.ready || loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-on-surface-variant">
                    Loading session intelligence…
                  </td>
                </tr>
              ) : error && rows.length === 0 ? <tr><td colSpan={6} className="px-6 py-12 text-center text-on-surface-variant">Session history is unavailable. Retry the request above.</td></tr>
              : paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="mx-auto max-w-md">
                      <MaterialSymbol name="travel_explore" className="text-4xl text-primary" />
                      <p className="mt-3 text-sm font-bold text-on-surface">{query || statusFilter !== "ALL" || severityFilter !== "ALL" ? "No sessions match these filters" : project.scope === UNASSIGNED_PROJECT ? "No unassigned tool sessions" : project.scope ? "No completed tool sessions in this project" : "No completed tool sessions yet"}</p>
                      <p className="mt-1 text-xs text-on-surface-variant">
                        Sessions appear here after a chat thread successfully executes at least one tool.
                      </p>
                      {canStartScan(user) && <Link
                        href={projectHref("/dashboard/scan?new=1", project.scope)}
                        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-on-primary hover:opacity-90 transition-opacity"
                      >
                        <MaterialSymbol name="add" className="text-base text-on-primary" filled />
                        Start scan
                      </Link>}
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
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <MaterialSymbol name={isHttp ? "language" : "computer"} className="text-base" filled />
                          </div>
                          <div className="min-w-0">
                            <p className="max-w-xs font-semibold text-on-surface text-sm leading-snug [overflow-wrap:anywhere]">{r.title}</p>
                            <p title={r.targets[0]} className="max-w-xs truncate text-xs text-on-surface-variant font-mono mt-0.5">
                              {sxId(r.session_id)}{r.targets[0] ? ` · ${r.targets[0]}` : ""}
                            </p>
                            <p className="mt-1 text-[11px] font-medium text-primary">{r.project_id ? project.projects.find((item) => item.id === r.project_id)?.name ?? "Project" : "Unassigned"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
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
                      <td className="px-4 py-4 text-xs text-on-surface-variant">{formatDate(r.started_at)}</td>
                      <td className="px-4 py-4 text-xs text-on-surface-variant font-medium [overflow-wrap:anywhere]">{r.executed_by || "—"}</td>
                      <td className="px-4 py-4">
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
                      <td className="px-4 py-4 text-right">
                        <div role="group" aria-label={`Actions for ${r.title}`} className="inline-flex items-center gap-1 text-on-surface-variant">
                          <Tooltip content="Command CTL: overview, targets, findings and activity" align="right">
                            <button
                              type="button"
                              aria-label="Command CTL"
                              aria-haspopup="dialog"
                              onClick={() => { setReportError(null); setSelectedId(r.session_id); }}
                              className="inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-xs font-semibold text-primary hover:bg-primary-container focus-visible:outline-2 focus-visible:outline-primary"
                            >
                              <MaterialSymbol name="space_dashboard" filled className="text-lg" />
                              Command CTL
                            </button>
                          </Tooltip>

                          <Tooltip content={analyzeBusyId === r.session_id ? "Analyzing session…" : "Run AI Analysis"} align="right">
                            <button
                              type="button"
                              aria-label={analyzeBusyId === r.session_id ? "Analyzing session" : "Run AI Analysis"}
                              aria-haspopup="dialog"
                              disabled={!!analyzeBusyId || !canExecute(r)}
                              onClick={() => handleAnalyze(r)}
                              className="rounded-lg p-2.5 hover:bg-surface-container hover:text-primary transition-colors focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40"
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
                              href={projectHref(`/dashboard/scan?chat_id=${encodeURIComponent(r.session_id)}`, r.project_id ?? UNASSIGNED_PROJECT)}
                              aria-label="Open session terminal"
                              className="rounded-lg p-2.5 hover:bg-surface-container hover:text-primary transition-colors focus-visible:outline-2 focus-visible:outline-primary"
                            >
                              <MaterialSymbol name="terminal" filled className="text-lg" />
                            </Link>
                          </Tooltip>

                          <Tooltip
                            align="right"
                            content={
                              reportBusy
                                ? "Preparing PDF report…"
                                : reportAttachment
                                  ? "Download PDF report"
                                  : "Generate PDF report"
                            }
                          >
                            <button
                              type="button"
                              aria-label={reportBusy ? "Preparing PDF report" : reportAttachment ? "Download PDF report" : "Generate PDF report"}
                              disabled={!!reportBusyId || (!latestReportAttachment(r) && !canExecute(r))}
                              onClick={() => handleReportAction(r)}
                              className={`rounded-lg p-2.5 hover:bg-surface-container transition-colors focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 ${
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

      {selected && <SessionDetailsModal
        key={selected.session_id}
        open
        onClose={() => setSelectedId(null)}
        session={selected}
        reportBusy={!!reportBusyId}
        reportAvailable={!!latestReportAttachment(selected)}
        canGenerate={canExecute(selected)}
        reportError={reportError}
        onReport={() => void handleReportAction(selected)}
      />}

      {analysisModalOpen && <SessionAnalysisModal
        open={analysisModalOpen}
        onClose={() => setAnalysisModalOpen(false)}
        loading={!!analyzeBusyId}
        summary={analysisSummary}
        error={analysisError}
        title={analysisTitle}
      />}
    </div>
  );
}
