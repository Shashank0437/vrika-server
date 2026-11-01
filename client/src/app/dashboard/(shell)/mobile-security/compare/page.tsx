"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftRight, GitCompareArrows } from "lucide-react";
import { WorkspaceSelect } from "@/components/ui/WorkspaceSelect";
import { compareScans, listScans, plain, platformOf, type CompareResult, type MobileScan } from "@/lib/mobileSecurity";
import { MOBILE_SECURITY_HREF } from "@/lib/mobile-security-nav";
import { asArr, asObj, Section, str } from "@/components/mobile-security/ReportSections";
import {
  card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  PageLoader,
  PlatformAvatar,
  primaryButton,
  ScoreRing,
  SeverityBar,
} from "@/components/mobile-security/ui";

const DIFF_SECTIONS: { key: string; label: string }[] = [
  { key: "permissions", label: "Permissions" },
  { key: "android_api", label: "Sensitive APIs" },
  { key: "browsable_activities", label: "Browsable activities" },
  { key: "urls", label: "URLs" },
];

const itemLabel = (item: unknown) => plain(Array.isArray(item) ? item[0] : item);

function ScanPicker({ label, value, onChange, scans, exclude }: { label: string; value: string; onChange: (v: string) => void; scans: MobileScan[]; exclude: string }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">{label}</span>
      <WorkspaceSelect
        label={label}
        value={value}
        placeholder="Select an Android scan…"
        options={scans
          .filter((s) => s.hash !== exclude)
          .map((s) => ({ value: s.hash, label: (s.app_name || s.file_name) + (s.version_name ? ` · v${s.version_name}` : ""), description: s.package_name || s.file_name }))}
        onChange={onChange}
      />
    </label>
  );
}

function AppCard({ scan, tone }: { scan: MobileScan | undefined; tone: "first" | "second" }) {
  if (!scan) return <div className={`${card} h-28`} />;
  return (
    <div className={`${card} flex items-center gap-4 p-5 ${tone === "first" ? "ring-2 ring-primary/20" : "ring-2 ring-tertiary/20"}`}>
      <PlatformAvatar scan={scan} />
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="truncate text-sm font-semibold text-on-surface">{scan.app_name || scan.file_name}</p>
          <p className="truncate font-mono text-xs text-on-surface-variant">{scan.package_name || scan.file_name}</p>
        </div>
        <SeverityBar counts={scan.severity} />
      </div>
      <ScoreRing score={scan.security_score} size={64} />
    </div>
  );
}

function DiffColumn({ title, items, tone }: { title: string; items: unknown[]; tone: string }) {
  return (
    <div className="min-w-0">
      <p className={`mb-2 text-xs font-semibold uppercase tracking-wider ${tone}`}>
        {title} · {items.length}
      </p>
      <ul className="terminal-scroll max-h-72 space-y-1 overflow-auto pr-1">
        {items.length ? (
          items.map((it, i) => (
            <li key={i} className="break-all rounded-lg bg-surface-container-low px-2.5 py-1.5 font-mono text-[11.5px] text-on-surface">
              {itemLabel(it)}
            </li>
          ))
        ) : (
          <li className="text-xs text-on-surface-variant">None</li>
        )}
      </ul>
    </div>
  );
}

function ComparePageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [scans, setScans] = useState<MobileScan[]>([]);
  const [a, setA] = useState(params.get("a") ?? "");
  const [b, setB] = useState(params.get("b") ?? "");
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listScans({ pageSize: 100 })
      .then((r) => setScans(r.items.filter((s) => s.status === "completed" && platformOf(s) === "android")))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load scans"));
  }, []);

  useEffect(() => {
    if (!a || !b || a === b) {
      setResult(null);
      return;
    }
    router.replace(`${MOBILE_SECURITY_HREF}/compare?${new URLSearchParams({ a, b })}`, { scroll: false });
    setLoading(true);
    setError(null);
    compareScans(a, b)
      .then(setResult)
      .catch((e) => {
        setResult(null);
        setError(e instanceof Error ? e.message : "Comparison failed");
      })
      .finally(() => setLoading(false));
  }, [a, b, router]);

  const first = useMemo(() => scans.find((s) => s.hash === a), [scans, a]);
  const second = useMemo(() => scans.find((s) => s.hash === b), [scans, b]);

  return (
    <section className="mx-auto w-full max-w-6xl space-y-7 px-5 py-8 sm:px-8 lg:py-10">
      <PageHeader
        eyebrow="Mobile Security / Compare"
        title="Compare builds"
        description="Diff two Android scans to spot new permissions, APIs, endpoints and deep links between releases."
      />

      <div className={`${card} flex flex-col items-stretch gap-4 p-5 sm:flex-row sm:items-end`}>
        <ScanPicker label="Baseline" value={a} onChange={setA} scans={scans} exclude={b} />
        <button
          className="mx-auto inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-outline-variant text-on-surface-variant transition hover:bg-surface-container hover:text-primary disabled:opacity-40"
          aria-label="Swap scans"
          disabled={!a && !b}
          onClick={() => {
            setA(b);
            setB(a);
          }}
        >
          <ArrowLeftRight className="size-4" />
        </button>
        <ScanPicker label="Compared with" value={b} onChange={setB} scans={scans} exclude={a} />
      </div>

      {error && <ErrorBanner message={error} />}

      {!a || !b ? (
        <div className={card}>
          <EmptyState
            icon={<GitCompareArrows className="size-6" />}
            title="Pick two completed Android scans"
            description="Comparison is available for APK and Android source scans."
            action={
              <button className={primaryButton} onClick={() => router.push(`${MOBILE_SECURITY_HREF}/scans`)}>
                Browse scans
              </button>
            }
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <AppCard scan={first} tone="first" />
            <AppCard scan={second} tone="second" />
          </div>
          {loading && <PageLoader label="Comparing…" />}
          {result &&
            !loading &&
            DIFF_SECTIONS.map(({ key, label }) => {
              const sec = asObj(result[key]);
              const onlyFirst = asArr(sec.only_first);
              const onlySecond = asArr(sec.only_second);
              const common = asArr(sec.common);
              return (
                <Section key={key} title={label} count={onlyFirst.length + onlySecond.length + common.length}>
                  <div className="grid gap-5 p-5 sm:px-6 md:grid-cols-3">
                    <DiffColumn title={`Only in ${str(asObj(result.first_app).name_ver) || "baseline"}`} items={onlyFirst} tone="text-primary" />
                    <DiffColumn title="In both" items={common} tone="text-on-surface-variant" />
                    <DiffColumn title={`Only in ${str(asObj(result.second_app).name_ver) || "compared"}`} items={onlySecond} tone="text-tertiary" />
                  </div>
                </Section>
              );
            })}
        </>
      )}
    </section>
  );
}

export default function MobileComparePage() {
  return (
    <Suspense fallback={null}>
      <ComparePageInner />
    </Suspense>
  );
}
