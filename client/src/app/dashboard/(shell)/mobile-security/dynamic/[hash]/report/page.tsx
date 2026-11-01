"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { engineAction, getScan, type MobileScan } from "@/lib/mobileSecurity";
import { mobileDynamicHref } from "@/lib/mobile-security-nav";
import { ResultView } from "@/components/mobile-security/dynamic";
import { asArr, asObj, Section, str, StringList } from "@/components/mobile-security/ReportSections";
import { ErrorBanner, PageHeader, secondaryButton, Skeleton } from "@/components/mobile-security/ui";

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

export default function DynamicReportPage() {
  const { hash } = useParams<{ hash: string }>();
  const [scan, setScan] = useState<MobileScan | null>(null);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [shots, setShots] = useState<{ name: string; data: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getScan(hash).then(setScan).catch(() => null);
    engineAction("dynamic.report_json", { hash })
      .then(setReport)
      .catch((e) => setError(e instanceof Error ? e.message : "Dynamic report unavailable — run and stop a dynamic session first."));
    engineAction<{ screenshots?: { name: string; data: string }[] }>("android.screenshots", { hash })
      .then((r) => setShots(asArr(r.screenshots) as { name: string; data: string }[]))
      .catch(() => null);
  }, [hash]);

  function downloadJson() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${hash}-dynamic-report.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6 px-5 py-8 sm:px-8 lg:py-10">
      <Link href={mobileDynamicHref(hash)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-primary">
        <ArrowLeft className="size-4" /> Dynamic session
      </Link>
      <PageHeader
        eyebrow="Mobile Security / Dynamic Analysis / Report"
        title={`${scan?.app_name || scan?.file_name || "App"} — dynamic report`}
        description={str(report?.package)}
        actions={
          report && (
            <button className={secondaryButton} onClick={downloadJson}>
              <Download className="size-4" /> JSON
            </button>
          )
        }
      />
      {error && <ErrorBanner message={error} />}
      {!report && !error && <Skeleton className="h-64 rounded-2xl" />}

      {shots.length > 0 && (
        <Section title="Screenshots" count={shots.length}>
          <div className="terminal-scroll flex gap-3 overflow-x-auto p-5">
            {shots.map((s) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={s.name} src={s.data} alt={s.name} className="h-72 shrink-0 rounded-xl border border-outline-variant/60 object-contain" />
            ))}
          </div>
        </Section>
      )}

      {report &&
        SECTIONS.filter(([key]) => !isEmpty(report[key])).map(([key, label]) => {
          const value = report[key];
          const list = Array.isArray(value) ? value : null;
          if (list && list.every((v) => typeof v === "string")) return <StringList key={key} title={label} items={list as string[]} />;
          if (key === "domains" && typeof value === "object")
            return <StringList key={key} title={label} items={Object.keys(asObj(value))} />;
          return (
            <Section key={key} title={label} count={list ? list.length : undefined}>
              <div className="p-5">
                <ResultView value={value} maxHeight="max-h-[32rem]" />
              </div>
            </Section>
          );
        })}
    </section>
  );
}
