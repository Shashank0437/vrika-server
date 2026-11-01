"use client";

import Link from "next/link";
import { useState } from "react";
import { Download, RefreshCcw, Trash2 } from "lucide-react";
import { deleteScan, downloadPdf, isPending, rescan, timeAgo, type MobileScan } from "@/lib/mobileSecurity";
import { mobileScanHref } from "@/lib/mobile-security-nav";
import { iconButton, PlatformAvatar, ScoreRing, SeverityBar, SeverityChip, StatusBadge } from "./ui";

type Props = {
  scans: MobileScan[];
  canExecute: boolean;
  canEdit: boolean;
  onChanged: () => void;
  onError: (msg: string) => void;
  selectable?: boolean;
  selected?: string[];
  onToggle?: (hash: string) => void;
  compact?: boolean;
};

export function ScansTable({ scans, canExecute, canEdit, onChanged, onError, selectable, selected = [], onToggle, compact }: Props) {
  const [busy, setBusy] = useState<string | null>(null);

  async function run(hash: string, fn: () => Promise<unknown>) {
    setBusy(hash);
    try {
      await fn();
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul className="divide-y divide-outline-variant/50">
      {scans.map((scan) => {
        const pending = isPending(scan);
        const done = scan.status === "completed";
        const isSelected = selected.includes(scan.hash);
        return (
          <li
            key={scan.hash}
            className={`group flex items-center gap-4 px-5 py-3.5 transition-colors sm:px-6 ${isSelected ? "bg-primary-container/40" : "hover:bg-surface-container-low"}`}
          >
            {selectable && (
              <input
                type="checkbox"
                aria-label={`Select ${scan.file_name} for comparison`}
                checked={isSelected}
                disabled={!done || (!isSelected && selected.length >= 2)}
                onChange={() => onToggle?.(scan.hash)}
                className="size-4 shrink-0 accent-[var(--color-primary)]"
              />
            )}
            <Link href={mobileScanHref(scan.hash)} className="flex min-w-0 flex-1 items-center gap-3.5">
              <PlatformAvatar scan={scan} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-on-surface group-hover:text-primary">
                    {scan.app_name || scan.file_name}
                  </p>
                  {scan.version_name && (
                    <span className="shrink-0 rounded-md bg-surface-container px-1.5 py-0.5 text-[11px] font-medium text-on-surface-variant">
                      v{scan.version_name}
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-on-surface-variant">
                  {scan.package_name || scan.file_name} · {scan.scan_type.toUpperCase() || "APP"} · {timeAgo(scan.updated_at)}
                </p>
              </div>
            </Link>
            {!compact && (
              <div className="hidden w-48 shrink-0 flex-col gap-1.5 lg:flex">
                {done ? (
                  <>
                    <div className="flex flex-wrap gap-1">
                      {(scan.severity.high ?? 0) > 0 && <SeverityChip severity="high">{scan.severity.high} high</SeverityChip>}
                      {(scan.severity.warning ?? 0) > 0 && <SeverityChip severity="warning">{scan.severity.warning} med</SeverityChip>}
                      {!scan.severity.high && !scan.severity.warning && <SeverityChip severity="secure">No major issues</SeverityChip>}
                    </div>
                    <SeverityBar counts={scan.severity} />
                  </>
                ) : (
                  <p className="truncate text-xs text-on-surface-variant" title={scan.error ?? undefined}>
                    {scan.status === "failed" ? scan.error || "Analysis failed" : "Analysis in progress…"}
                  </p>
                )}
              </div>
            )}
            <div className="hidden shrink-0 sm:block">
              {done ? <ScoreRing score={scan.security_score} size={44} /> : <StatusBadge status={scan.status} />}
            </div>
            {!compact && (
              <div className="flex shrink-0 items-center gap-0.5 opacity-80 group-hover:opacity-100">
                <button
                  className={iconButton}
                  title="Download PDF"
                  aria-label="Download PDF"
                  disabled={!done || busy === scan.hash}
                  onClick={() => void run(scan.hash, () => downloadPdf(scan))}
                >
                  <Download className="size-4" />
                </button>
                {canExecute && (
                  <button
                    className={iconButton}
                    title="Rescan"
                    aria-label="Rescan"
                    disabled={pending || busy === scan.hash}
                    onClick={() => void run(scan.hash, () => rescan(scan.hash))}
                  >
                    <RefreshCcw className="size-4" />
                  </button>
                )}
                {canEdit && (
                  <button
                    className={`${iconButton} hover:!bg-error/10 hover:!text-error`}
                    title="Delete"
                    aria-label="Delete scan"
                    disabled={busy === scan.hash}
                    onClick={() => {
                      if (window.confirm(`Delete the scan for ${scan.file_name}? This cannot be undone.`))
                        void run(scan.hash, () => deleteScan(scan.hash));
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
