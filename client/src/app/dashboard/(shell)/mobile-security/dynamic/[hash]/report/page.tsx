"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Download, FileBarChart2, Trash2 } from "lucide-react";
import { hasPermission } from "@/lib/access";
import { useAuth } from "@/lib/auth-context";
import {
  deleteDynamicReport,
  getDynamicReport,
  getScan,
  listDynamicReports,
  type DynamicReportDetail,
  type DynamicReportMeta,
  type MobileScan,
} from "@/lib/mobileSecurity";
import { mobileDynamicHref } from "@/lib/mobile-security-nav";
import { ResultView } from "@/components/mobile-security/dynamic";
import { asObj, Section, str, StringList } from "@/components/mobile-security/ReportSections";
import { EmptyState, ErrorBanner, PageHeader, PageLoader, secondaryButton } from "@/components/mobile-security/ui";
import { WorkspaceSelect } from "@/components/ui/WorkspaceSelect";

const SECTIONS: [string, string][] = [
  ["tls_tests", "TLS / SSL security tests"],
  ["exported_activity_tester", "Exported activity tester"],
  ["activity_tester", "Activity tester"],
  ["apimon", "API monitor"],
  ["droidmon", "Droidmon"],
  ["frida_logs", "Frida logs"],
  ["runtime_dependencies", "Runtime dependencies"],
  ["urls", "URLs"],
  ["domains", "Domains"],
  ["emails", "Emails"],
  ["trackers", "Trackers"],
  ["clipboard", "Clipboard"],
  ["sqlite", "SQLite databases"],
  ["xml", "XML files"],
  ["others", "Other files"],
];

function isEmpty(v: unknown) {
  if (v === null || v === undefined || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

const when = (iso: string | null) => (iso ? new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`).toLocaleString() : "–");

function DynamicReportInner() {
  const { hash } = useParams<{ hash: string }>();
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth();
  const canEdit = hasPermission(user, "edit", { module: "mobile_security" });
  const [scan, setScan] = useState<MobileScan | null>(null);
  const [runs, setRuns] = useState<DynamicReportMeta[] | null>(null);
  const [selected, setSelected] = useState(params.get("id") ?? "");
  const [detail, setDetail] = useState<DynamicReportDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    try {
      const r = await listDynamicReports(hash);
      setRuns(r.items);
      setSelected((cur) => (cur && r.items.some((i) => i.id === cur) ? cur : (r.items[0]?.id ?? "")));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load reports");
      setRuns([]);
    }
  }, [hash]);

  useEffect(() => {
    getScan(hash).then(setScan).catch(() => null);
    void loadRuns();
  }, [hash, loadRuns]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    router.replace(`${mobileDynamicHref(hash)}/report?id=${encodeURIComponent(selected)}`, { scroll: false });
    setLoading(true);
    getDynamicReport(selected)
      .then((d) => {
        setDetail(d);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load report"))
      .finally(() => setLoading(false));
  }, [selected, hash, router]);

  function downloadJson() {
    if (!detail) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(detail.report, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${hash}-dynamic-report-${detail.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function remove() {
    if (!detail || !window.confirm("Delete this dynamic report run?")) return;
    try {
      await deleteDynamicReport(detail.id);
      setSelected("");
      await loadRuns();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete report");
    }
  }

  const report = detail?.report ?? null;

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6 px-5 py-8 sm:px-8 lg:py-10">
      <Link href={mobileDynamicHref(hash)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-primary">
        <ArrowLeft className="size-4" /> Dynamic session
      </Link>
      <PageHeader
        eyebrow="Mobile Security / Dynamic Analysis / Reports"
        title={`${scan?.app_name || scan?.file_name || "App"} — dynamic reports`}
        description={str(asObj(report).package) || "Every Stop & generate report creates a new run; earlier runs stay here."}
        actions={
          detail && (
            <>
              <button className={secondaryButton} onClick={downloadJson}>
                <Download className="size-4" /> JSON
              </button>
              {canEdit && (
                <button className={`${secondaryButton} hover:!bg-error/8 hover:!text-error`} onClick={() => void remove()}>
                  <Trash2 className="size-4" /> Delete run
                </button>
              )}
            </>
          )
        }
      />
      {error && <ErrorBanner message={error} />}

      {runs === null ? (
        <PageLoader label="Loading report history…" />
      ) : runs.length === 0 ? (
        <EmptyState
          icon={<FileBarChart2 className="size-6" />}
          title="No dynamic reports yet"
          description="Start a dynamic session, exercise the app, then use Stop & generate report. Each run is archived here."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-4 shadow-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Run</span>
            <WorkspaceSelect
              className="min-w-72 flex-1"
              label="Report run"
              value={selected}
              options={runs.map((r, i) => ({
                value: r.id,
                label: `Run ${runs.length - i} — ${when(r.created_at)}`,
                description: `${r.screenshot_count} screenshots${r.created_by ? ` · by ${r.created_by}` : ""}`,
              }))}
              onChange={setSelected}
            />
            <span className="text-xs text-on-surface-variant">{runs.length} run{runs.length > 1 ? "s" : ""}</span>
          </div>

          {loading || !detail ? (
            <PageLoader label="Loading report…" />
          ) : (
            <>
              {detail.screenshots.length > 0 && (
                <Section title="Screenshots" count={detail.screenshots.length}>
                  <div className="flex flex-wrap gap-3 p-5">
                    {detail.screenshots.map((s) => (
                      <a key={s.name} href={s.data} download={s.name}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.data} alt={s.name} className="h-56 rounded-xl border border-outline-variant/60 object-contain" />
                      </a>
                    ))}
                  </div>
                </Section>
              )}
              {SECTIONS.filter(([key]) => !isEmpty(report?.[key])).map(([key, label]) => {
                const value = report?.[key];
                const list = Array.isArray(value) ? value : null;
                if (list && list.every((v) => typeof v === "string")) return <StringList key={key} title={label} items={list as string[]} />;
                if (key === "domains" && typeof value === "object") return <StringList key={key} title={label} items={Object.keys(asObj(value))} />;
                return (
                  <Section key={key} title={label} count={list ? list.length : undefined}>
                    <div className="p-5">
                      <ResultView value={value} maxHeight="max-h-[32rem]" />
                    </div>
                  </Section>
                );
              })}
            </>
          )}
        </>
      )}
    </section>
  );
}

export default function DynamicReportPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <DynamicReportInner />
    </Suspense>
  );
}
