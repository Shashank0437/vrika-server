"use client";

import { useCallback, useEffect, useState } from "react";
import { EyeOff, Trash2 } from "lucide-react";
import { engineAction, type MobileReport } from "@/lib/mobileSecurity";
import { ResultView } from "./dynamic";
import { asArr, asObj, Section, str, StringList } from "./ReportSections";
import { ErrorBanner, iconButton, PageLoader, secondaryButton, Spinner } from "./ui";

type SuppressType = "code" | "manifest";

export function SuppressActions({ hash, rule, type, onDone }: { hash: string; rule: string; type: SuppressType; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function act(kind: "rule" | "files") {
    setBusy(kind);
    setError(null);
    try {
      await engineAction(kind === "rule" ? "static.suppress_by_rule" : "static.suppress_by_files", { hash, rule, type }, false);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suppression failed");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <button className={`${secondaryButton} h-8 px-3 text-xs`} disabled={busy !== null} onClick={() => void act("rule")}>
        {busy === "rule" ? <Spinner className="size-3.5" /> : <EyeOff className="size-3.5" />}
        Suppress rule
      </button>
      {type === "code" && (
        <button className={`${secondaryButton} h-8 px-3 text-xs`} disabled={busy !== null} onClick={() => void act("files")}>
          {busy === "files" ? <Spinner className="size-3.5" /> : <EyeOff className="size-3.5" />}
          Suppress in these files
        </button>
      )}
      {error && <span className="text-xs text-error">{error}</span>}
    </div>
  );
}

type SuppressionRow = { SUPPRESS_TYPE: string; SUPPRESS_RULE_ID: string[]; SUPPRESS_FILES: Record<string, string[]> };

export function SuppressionsSection({ hash, canEdit, version, onChanged }: { hash: string; canEdit: boolean; version: number; onChanged: () => void }) {
  const [rows, setRows] = useState<SuppressionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await engineAction<{ message?: unknown }>("static.list_suppressions", { hash });
      setRows(asArr(r.message) as SuppressionRow[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load suppressions");
    }
  }, [hash]);
  useEffect(() => {
    void load();
  }, [load, version]);

  async function remove(rule: string, kind: "rule" | "file", type: string) {
    try {
      await engineAction("static.delete_suppression", { hash, rule, kind, type }, false);
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete suppression");
    }
  }

  const items = (rows ?? []).flatMap((r) => [
    ...asArr(r.SUPPRESS_RULE_ID).map((rule) => ({ type: str(r.SUPPRESS_TYPE), rule: str(rule), kind: "rule" as const, files: [] as string[] })),
    ...Object.entries(asObj(r.SUPPRESS_FILES)).map(([rule, files]) => ({ type: str(r.SUPPRESS_TYPE), rule, kind: "file" as const, files: asArr(files).map(str) })),
  ]);

  return (
    <Section title="Suppressed findings" count={items.length}>
      {error && (
        <div className="p-5">
          <ErrorBanner message={error} onRetry={() => void load()} />
        </div>
      )}
      {rows === null ? (
        <PageLoader label="Loading suppressions…" className="py-8" />
      ) : items.length ? (
        <ul className="divide-y divide-outline-variant/40">
          {items.map((it) => (
            <li key={`${it.type}-${it.kind}-${it.rule}`} className="flex items-start gap-3 px-5 py-3 sm:px-6">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs font-semibold text-on-surface">{it.rule}</p>
                <p className="mt-0.5 text-xs text-on-surface-variant">
                  {it.type} · {it.kind === "rule" ? "entire rule" : `${it.files.length} file(s)`}
                </p>
                {it.files.length > 0 && <p className="mt-1 break-all font-mono text-[11px] text-on-surface-variant">{it.files.join(", ")}</p>}
              </div>
              {canEdit && (
                <button className={iconButton} aria-label="Remove suppression" onClick={() => void remove(it.rule, it.kind, it.type)}>
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-6 py-6 text-sm text-on-surface-variant">No findings are suppressed for this app.</p>
      )}
    </Section>
  );
}

const COVERED = new Set([
  "code_analysis", "android_api", "behaviour", "manifest_analysis", "network_security", "ats_analysis", "permissions",
  "binary_analysis", "certificate_analysis", "domains", "urls", "emails", "trackers", "firebase_urls", "secrets",
  "activities", "services", "receivers", "providers", "libraries", "exported_count", "malware_permissions",
  "file_name", "size", "md5", "sha1", "sha256", "app_name", "package_name", "bundle_id", "version_name", "app_version",
  "version_code", "build", "main_activity", "target_sdk", "min_sdk", "max_sdk", "min_os_version", "platform", "sdk_name",
  "title", "version", "icon_path", "app_type", "average_cvss", "appsec", "virus_total", "timestamp",
]);

const LABELS: Record<string, string> = {
  apkid: "APKiD (packers, obfuscators, anti-VM)",
  playstore_details: "Play Store details",
  appstore_details: "App Store details",
  sbom: "Software bill of materials (SBOM)",
  niap_analysis: "NIAP analysis",
  file_analysis: "File analysis",
  strings: "Strings",
  macho_analysis: "Mach-O analysis",
  dylib_analysis: "Dynamic libraries",
  framework_analysis: "Frameworks",
  browsable_activities: "Browsable activities (deep links)",
  exported_activities: "Exported activities",
  permission_mapping: "Permission → code mapping",
  logs: "Analysis logs",
  malware_permissions: "Malware permissions",
};

function isEmpty(v: unknown) {
  if (v === null || v === undefined || v === "" || v === false) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

export function extraKeys(report: MobileReport): string[] {
  return Object.keys(report).filter((k) => !COVERED.has(k) && !isEmpty(report[k]));
}

/** Every remaining engine report section, so nothing the engine produces is hidden. */
export function ExtrasSection({ report }: { report: MobileReport }) {
  const keys = extraKeys(report);
  const malware = asObj(report.malware_permissions);
  return (
    <div className="space-y-5">
      {!isEmpty(malware) && (
        <Section title="Malware permissions">
          <div className="grid gap-5 p-5 sm:px-6 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-error">
                Top malware permissions · {str(malware.total_malware_permissions) || asArr(malware.top_malware_permissions).length}
              </p>
              <ResultView value={asArr(malware.top_malware_permissions)} maxHeight="max-h-60" />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                Other abused permissions · {str(malware.total_other_permissions) || asArr(malware.other_abused_permissions).length}
              </p>
              <ResultView value={asArr(malware.other_abused_permissions)} maxHeight="max-h-60" />
            </div>
          </div>
        </Section>
      )}
      {keys.map((key) => {
        const value = report[key];
        const label = LABELS[key] ?? key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
        if (Array.isArray(value) && value.every((v) => typeof v === "string")) return <StringList key={key} title={label} items={value as string[]} />;
        return (
          <Section key={key} title={label} count={Array.isArray(value) ? value.length : undefined}>
            <div className="p-5">
              <ResultView value={value} maxHeight="max-h-[32rem]" />
            </div>
          </Section>
        );
      })}
      {!keys.length && isEmpty(malware) && <p className="text-sm text-on-surface-variant">No additional sections for this report.</p>}
    </div>
  );
}
