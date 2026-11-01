"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Activity, ArrowLeft, Download, FileWarning, RefreshCcw, ScrollText, Trash2 } from "lucide-react";
import { hasPermission } from "@/lib/access";
import { useAuth } from "@/lib/auth-context";
import {
  deleteScan,
  downloadPdf,
  getReport,
  getScan,
  getScanLogs,
  getScorecard,
  isPending,
  platformOf,
  rescan,
  timeAgo,
  type MobileReport,
  type MobileScan,
  type Scorecard,
  type Severity,
} from "@/lib/mobileSecurity";
import { MOBILE_SECURITY_HREF, mobileDynamicHref } from "@/lib/mobile-security-nav";
import { ExtrasSection, extraKeys, SuppressActions, SuppressionsSection } from "@/components/mobile-security/ReportExtras";
import {
  AppInfo,
  asArr,
  asObj,
  binaryRows,
  CertificateSection,
  codeRows,
  ComponentsSection,
  configRows,
  FindingList,
  NetworkPrivacySection,
  PermissionsSection,
  scorecardRows,
  Section,
  SourceViewer,
  str,
  StringList,
} from "@/components/mobile-security/ReportSections";
import {
  card,
  EmptyState,
  ErrorBanner,
  PlatformAvatar,
  primaryButton,
  ScoreRing,
  secondaryButton,
  SEVERITY_META,
  Skeleton,
  Spinner,
  PageLoader,
  StatusBadge,
} from "@/components/mobile-security/ui";

const ANDROID_SOURCE_TYPES = new Set(["apk", "studio", "eclipse"]);

type TabId = "summary" | "code" | "config" | "permissions" | "binary" | "certificate" | "network" | "secrets" | "components" | "more" | "suppressions" | "logs";

function useLogs(hash: string, active: boolean) {
  const [logs, setLogs] = useState<string[]>([]);
  useEffect(() => {
    if (!active) return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await getScanLogs(hash);
        if (!stop)
          setLogs(
            asArr(res.logs).map((l) => {
              if (typeof l === "string") return l;
              const o = asObj(l);
              return [str(o.timestamp), str(o.status), str(o.exception)].filter(Boolean).join("  ");
            }),
          );
      } catch {
        /* logs are best effort */
      }
    };
    void tick();
    const t = setInterval(tick, 4000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [hash, active]);
  return logs;
}

function LogPanel({ logs }: { logs: string[] }) {
  return (
    <div className="terminal-scroll max-h-80 overflow-auto rounded-xl bg-[#17151f] p-4 font-mono text-xs leading-relaxed text-[#d9d5ec]">
      {logs.length ? logs.map((l, i) => <div key={i}>{l}</div>) : <span className="text-white/50">Waiting for engine logs…</span>}
    </div>
  );
}

export default function MobileScanReportPage() {
  const { hash } = useParams<{ hash: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const canExecute = hasPermission(user, "execute", { module: "mobile_security" });
  const canEdit = hasPermission(user, "edit", { module: "mobile_security" });

  const [scan, setScan] = useState<MobileScan | null>(null);
  const [report, setReport] = useState<MobileReport | null>(null);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"pdf" | "rescan" | "delete" | null>(null);
  const [tab, setTab] = useState<TabId>("summary");
  const [source, setSource] = useState<{ file: string; lines: string } | null>(null);
  const [reportVersion, setReportVersion] = useState(0);

  const loadScan = useCallback(async () => {
    try {
      setScan(await getScan(hash));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load scan");
    }
  }, [hash]);

  useEffect(() => {
    void loadScan();
  }, [loadScan]);

  useEffect(() => {
    if (!scan || !isPending(scan)) return;
    const t = setTimeout(() => void loadScan(), 4000);
    return () => clearTimeout(t);
  }, [scan, loadScan]);

  const completed = scan?.status === "completed";
  useEffect(() => {
    if (!completed) return;
    if (!reportVersion) setReport(null);
    Promise.all([getReport(hash), getScorecard(hash).catch(() => null)])
      .then(([r, c]) => {
        setReport(r);
        setScorecard(c);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load report"));
  }, [completed, hash, reportVersion]);

  const logs = useLogs(hash, Boolean(scan && (isPending(scan) || scan.status === "failed" || tab === "logs")));

  async function act(kind: "pdf" | "rescan" | "delete") {
    if (!scan) return;
    if (kind === "delete" && !window.confirm(`Delete the scan for ${scan.file_name}? This cannot be undone.`)) return;
    setBusy(kind);
    try {
      if (kind === "pdf") await downloadPdf(scan);
      if (kind === "rescan") {
        setScan(await rescan(scan.hash));
        setReport(null);
        setTab("summary");
      }
      if (kind === "delete") {
        await deleteScan(scan.hash);
        router.push(`${MOBILE_SECURITY_HREF}/scans`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  const sourceType = useMemo(() => {
    if (!report || !scan || platformOf(scan) !== "android") return null;
    const t = str(report.app_type).toLowerCase();
    return ANDROID_SOURCE_TYPES.has(t) ? t : "apk";
  }, [report, scan]);

  const sections = useMemo(() => {
    if (!report) return null;
    const onView = sourceType ? (file: string, lines: string) => setSource({ file, lines }) : undefined;
    const suppress = (type: "code" | "manifest") =>
      canEdit
        ? (rule: string) => <SuppressActions hash={hash} rule={rule} type={type} onDone={() => setReportVersion((v) => v + 1)} />
        : undefined;
    return {
      summary: scorecardRows(scorecard),
      code: codeRows(report.code_analysis, onView, suppress("code")),
      api: codeRows({ findings: report.android_api }, onView),
      behaviour: codeRows({ findings: report.behaviour }, onView),
      config: configRows(report, suppress("manifest")),
      binary: binaryRows(report),
      secrets: asArr(report.secrets).map(str),
      extras: extraKeys(report).length + (report.malware_permissions ? 1 : 0),
    };
  }, [report, scorecard, sourceType, canEdit, hash]);

  const tabs = useMemo(() => {
    if (!report || !sections) return [];
    const isAndroid = scan ? platformOf(scan) === "android" : false;
    const list: { id: TabId; label: string; count?: number; show: boolean }[] = [
      { id: "summary", label: "Summary", show: true },
      { id: "code", label: "Code", count: sections.code.length, show: true },
      { id: "config", label: "Configuration", count: sections.config.length, show: true },
      { id: "permissions", label: "Permissions", count: Object.keys(asObj(report.permissions)).length, show: true },
      { id: "binary", label: "Binary", count: sections.binary.length, show: Boolean(report.binary_analysis) },
      { id: "certificate", label: "Certificate", show: Boolean(report.certificate_analysis) },
      { id: "network", label: "Network & Privacy", show: true },
      { id: "secrets", label: "Secrets", count: sections.secrets.length, show: true },
      { id: "components", label: "Components", show: isAndroid },
      { id: "more", label: "More analysis", count: sections.extras, show: true },
      { id: "suppressions", label: "Suppressions", show: true },
      { id: "logs", label: "Logs", show: true },
    ];
    return list.filter((t) => t.show);
  }, [report, sections, scan]);

  if (error && !scan) {
    return (
      <section className="mx-auto w-full max-w-6xl space-y-6 px-5 py-8 sm:px-8 lg:py-10">
        <Link href={`${MOBILE_SECURITY_HREF}/scans`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-primary">
          <ArrowLeft className="size-4" /> All scans
        </Link>
        <ErrorBanner message={error} onRetry={() => void loadScan()} />
      </section>
    );
  }

  const counts: Partial<Record<Severity, number>> = scan?.severity ?? {};

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6 px-5 py-8 sm:px-8 lg:py-10">
      <Link href={`${MOBILE_SECURITY_HREF}/scans`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-primary">
        <ArrowLeft className="size-4" /> All scans
      </Link>

      {/* Hero */}
      <div className={`${card} relative overflow-hidden`}>
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-container/60 via-transparent to-tertiary-container/20" />
        <div className="relative flex flex-col gap-6 p-6 md:flex-row md:items-center">
          {scan ? <PlatformAvatar scan={scan} size="lg" /> : <Skeleton className="size-16 rounded-2xl" />}
          <div className="min-w-0 flex-1">
            {scan ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-2xl font-bold tracking-tight text-on-surface">{scan.app_name || scan.file_name}</h1>
                  <StatusBadge status={scan.status} />
                </div>
                <p className="mt-1 truncate font-mono text-xs text-on-surface-variant">{scan.package_name || scan.file_name}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {[
                    scan.version_name && `v${scan.version_name}`,
                    scan.scan_type.toUpperCase(),
                    report && str(report.target_sdk) && `Target SDK ${str(report.target_sdk)}`,
                    report && str(report.min_sdk) && `Min SDK ${str(report.min_sdk)}`,
                    `Scanned ${timeAgo(scan.updated_at)}`,
                    scan.uploaded_by && `by ${scan.uploaded_by}`,
                  ]
                    .filter(Boolean)
                    .map((t) => (
                      <span key={t as string} className="rounded-lg bg-surface-container-lowest/80 px-2 py-1 font-medium text-on-surface-variant ring-1 ring-outline-variant/50">
                        {t}
                      </span>
                    ))}
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Skeleton className="h-7 w-64" />
                <Skeleton className="h-4 w-40" />
              </div>
            )}
          </div>
          {completed && (
            <div className="flex items-center gap-5">
              <ScoreRing score={scan?.security_score} size={112} />
              <dl className="grid grid-cols-2 gap-x-5 gap-y-2">
                {(["high", "warning", "hotspot", "secure"] as Severity[]).map((s) => (
                  <div key={s}>
                    <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                      <span className={`size-1.5 rounded-full ${SEVERITY_META[s].dot}`} />
                      {SEVERITY_META[s].label}
                    </dt>
                    <dd className="text-xl font-bold text-on-surface">{counts[s] ?? 0}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
        {scan && (
          <div className="relative flex flex-wrap items-center gap-2 border-t border-outline-variant/50 bg-surface-container-lowest/70 px-6 py-3">
            <button className={primaryButton} disabled={!completed || busy !== null} onClick={() => void act("pdf")}>
              {busy === "pdf" ? <Spinner /> : <Download className="size-4" />}
              Download PDF
            </button>
            {canExecute && (
              <button className={secondaryButton} disabled={isPending(scan) || busy !== null} onClick={() => void act("rescan")}>
                {busy === "rescan" ? <Spinner /> : <RefreshCcw className="size-4" />}
                Rescan
              </button>
            )}
            {completed && platformOf(scan) === "android" && (
              <Link href={mobileDynamicHref(scan.hash)} className={secondaryButton}>
                <Activity className="size-4" />
                Dynamic analysis
              </Link>
            )}
            {canEdit && (
              <button className={`${secondaryButton} ml-auto hover:!border-error/40 hover:!bg-error/8 hover:!text-error`} disabled={busy !== null} onClick={() => void act("delete")}>
                <Trash2 className="size-4" />
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void loadScan()} />}

      {/* In progress */}
      {scan && isPending(scan) && (
        <div className={`${card} space-y-5 p-6`}>
          <div className="flex items-center gap-4">
            <span className="relative flex size-12 items-center justify-center rounded-2xl bg-primary-container text-primary">
              <Spinner className="size-8" label="Analysing" />
            </span>
            <div>
              <p className="text-base font-semibold text-on-surface">{scan.status === "queued" ? "Queued for analysis" : "Analysing application"}</p>
              <p className="text-sm text-on-surface-variant">Decompiling, scanning code and checking reputation. This page refreshes automatically.</p>
            </div>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-container-high">
            <div className="mobile-scan-progress h-full w-1/3 rounded-full bg-gradient-to-r from-primary/40 via-primary to-primary/40" />
          </div>
          <LogPanel logs={logs} />
        </div>
      )}

      {/* Failed */}
      {scan?.status === "failed" && (
        <div className={`${card} space-y-4 p-6`}>
          <EmptyState icon={<FileWarning className="size-6" />} title="Analysis failed" description={scan.error || "The engine could not analyse this file."} />
          <LogPanel logs={logs} />
        </div>
      )}

      {/* Report */}
      {completed && !report && !error && <PageLoader label="Loading report…" />}

      {completed && report && sections && (
        <>
          <nav className="flex flex-wrap gap-1" aria-label="Report sections">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition ${
                  tab === t.id ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                }`}
              >
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className={`rounded px-1 text-[10.5px] ${tab === t.id ? "bg-on-primary/20" : "bg-surface-container-high"}`}>{t.count}</span>
                )}
              </button>
            ))}
          </nav>

          {tab === "summary" && (
            <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
              <FindingList title="Security findings" rows={sections.summary} emptyText="Scorecard unavailable for this scan." />
              <AppInfo report={report} />
            </div>
          )}
          {tab === "code" && (
            <div className="space-y-5">
              <FindingList title="Code analysis" rows={sections.code} />
              {sections.behaviour.length > 0 && <FindingList title="Behaviour analysis" rows={sections.behaviour} />}
              {sections.api.length > 0 && <FindingList title="Sensitive API usage" rows={sections.api} />}
            </div>
          )}
          {tab === "config" && <FindingList title="Configuration findings" rows={sections.config} />}
          {tab === "permissions" && <PermissionsSection report={report} />}
          {tab === "binary" && <FindingList title="Binary hardening" rows={sections.binary} emptyText="No binary hardening issues found." />}
          {tab === "certificate" && <CertificateSection report={report} />}
          {tab === "network" && <NetworkPrivacySection report={report} />}
          {tab === "secrets" && <StringList title="Possible hardcoded secrets" items={sections.secrets} />}
          {tab === "components" && <ComponentsSection report={report} />}
          {tab === "more" && <ExtrasSection report={report} />}
          {tab === "suppressions" && (
            <SuppressionsSection hash={hash} canEdit={canEdit} version={reportVersion} onChanged={() => setReportVersion((v) => v + 1)} />
          )}
          {tab === "logs" && (
            <Section title="Scan logs" actions={<ScrollText className="size-4 text-on-surface-variant" />}>
              <div className="p-4">
                <LogPanel logs={logs} />
              </div>
            </Section>
          )}
        </>
      )}

      {source && sourceType && (
        <SourceViewer hash={hash} file={source.file} lines={source.lines} type={sourceType} onClose={() => setSource(null)} />
      )}
    </section>
  );
}
