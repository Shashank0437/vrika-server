"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Icon as BrandIcon } from "@iconify/react";
import { AlertTriangle, Box, CheckCircle2, Clock3, XCircle } from "lucide-react";
import { LoaderSvg } from "@/components/ui/LoaderSvg";
import {
  getAppIcon,
  getEngineStatus,
  platformOf,
  scoreGrade,
  type EngineStatus,
  type MobileScan,
  type MobileScanStatus,
  type Severity,
} from "@/lib/mobileSecurity";

export const primaryButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary shadow-sm transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 text-sm font-semibold text-on-surface transition hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50";
export const iconButton =
  "inline-flex size-9 items-center justify-center rounded-lg text-on-surface-variant transition hover:bg-surface-container hover:text-on-surface focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40";
export const card =
  "rounded-2xl border border-outline-variant/70 bg-surface-container-lowest shadow-sm";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
        <h1 className="truncate text-3xl font-bold tracking-tight text-on-surface">{title}</h1>
        {description && <p className="mt-2 text-sm text-on-surface-variant">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export const SEVERITY_META: Record<Severity, { label: string; chip: string; dot: string; bar: string }> = {
  high: { label: "High", chip: "bg-error/10 text-error ring-error/20", dot: "bg-error", bar: "bg-error" },
  warning: { label: "Medium", chip: "bg-amber-500/10 text-amber-700 ring-amber-500/25", dot: "bg-amber-500", bar: "bg-amber-500" },
  info: { label: "Info", chip: "bg-sky-500/10 text-sky-700 ring-sky-500/25", dot: "bg-sky-500", bar: "bg-sky-500" },
  secure: { label: "Secure", chip: "bg-tertiary/10 text-tertiary ring-tertiary/25", dot: "bg-tertiary", bar: "bg-tertiary" },
  hotspot: { label: "Hotspot", chip: "bg-primary/10 text-primary ring-primary/25", dot: "bg-primary", bar: "bg-primary" },
};

export function normalizeSeverity(raw: unknown): Severity {
  const v = String(raw ?? "").toLowerCase();
  if (v === "high" || v === "critical" || v === "dangerous" || v === "bad") return "high";
  if (v === "warning" || v === "medium") return "warning";
  if (v === "secure" || v === "good" || v === "normal") return "secure";
  if (v === "hotspot") return "hotspot";
  return "info";
}

export function SeverityChip({ severity, children }: { severity: Severity; children?: ReactNode }) {
  const meta = SEVERITY_META[severity];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${meta.chip}`}>
      <span className={`size-1.5 rounded-full ${meta.dot}`} />
      {children ?? meta.label}
    </span>
  );
}

export function SeverityBar({ counts }: { counts: Partial<Record<Severity, number>> }) {
  const order: Severity[] = ["high", "warning", "info", "hotspot", "secure"];
  const total = order.reduce((n, k) => n + (counts[k] ?? 0), 0);
  if (!total) return <div className="h-1.5 w-full rounded-full bg-surface-container-high" />;
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
      {order.map((k) =>
        counts[k] ? (
          <div key={k} className={SEVERITY_META[k].bar} style={{ width: `${((counts[k] ?? 0) / total) * 100}%` }} />
        ) : null,
      )}
    </div>
  );
}

const TONE_STROKE = { good: "#006d4b", ok: "#d97706", bad: "#a8364b", none: "#c6c5d0" } as const;

export function ScoreRing({ score, size = 112, label = "Security score" }: { score: number | null | undefined; size?: number; label?: string }) {
  const { grade, tone } = scoreGrade(score);
  const stroke = Math.max(6, Math.round(size / 12));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = typeof score === "number" ? Math.min(Math.max(score, 0), 100) / 100 : 0;
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${score ?? "unavailable"}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-container-high)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={TONE_STROKE[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-bold leading-none text-on-surface" style={{ fontSize: size < 72 ? size / 3 : size / 3.6 }}>
          {score ?? "–"}
        </span>
        {size >= 72 && (
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
            Grade {grade}
          </span>
        )}
      </div>
    </div>
  );
}

const STATUS_META: Record<MobileScanStatus, { label: string; cls: string; icon: ReactNode }> = {
  completed: { label: "Completed", cls: "bg-tertiary/10 text-tertiary", icon: <CheckCircle2 className="size-3.5" /> },
  scanning: { label: "Scanning", cls: "bg-primary/10 text-primary", icon: <Spinner className="size-3.5" /> },
  queued: { label: "Queued", cls: "bg-amber-500/10 text-amber-700", icon: <Clock3 className="size-3.5" /> },
  failed: { label: "Failed", cls: "bg-error/10 text-error", icon: <XCircle className="size-3.5" /> },
};

export function StatusBadge({ status }: { status: MobileScanStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.completed;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.cls}`}>
      {meta.icon}
      {meta.label}
    </span>
  );
}

export function PlatformAvatar({
  scan,
  size = "md",
}: {
  scan: Pick<MobileScan, "scan_type" | "file_name"> & { hash?: string; status?: MobileScanStatus };
  size?: "md" | "lg";
}) {
  const [icon, setIcon] = useState<string | null>(null);
  const iconHash = scan.hash && (scan.status === undefined || scan.status === "completed") ? scan.hash : null;
  useEffect(() => {
    let live = true;
    setIcon(null);
    if (iconHash) getAppIcon(iconHash).then((url) => live && setIcon(url));
    return () => {
      live = false;
    };
  }, [iconHash]);
  const platform = platformOf(scan);
  const box = size === "lg" ? "size-16 rounded-2xl" : "size-10 rounded-xl";
  const icon_ = size === "lg" ? "size-8" : "size-5";
  if (icon) {
    return (
      <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden bg-surface-container-lowest ring-1 ring-outline-variant/50 ${box}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={icon} alt="" className="size-full object-cover" onError={() => setIcon(null)} />
      </span>
    );
  }
  const styles = {
    android: "bg-gradient-to-br from-tertiary-container/40 to-surface-container-low",
    ios: "bg-gradient-to-br from-surface-container-highest to-surface-container",
    windows: "bg-gradient-to-br from-sky-100 to-sky-50",
    other: "bg-gradient-to-br from-primary-container to-surface-container-low text-primary",
  }[platform];
  const brand = { android: "logos:android-icon", ios: "logos:apple", windows: "logos:microsoft-windows-icon", other: null }[platform];
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${box} ${styles}`} aria-label={platform}>
      {brand ? <BrandIcon icon={brand} className={icon_} aria-hidden /> : <Box className={icon_} />}
    </span>
  );
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-container text-primary">{icon}</span>
      <div>
        <p className="text-sm font-semibold text-on-surface">{title}</p>
        {description && <p className="mt-1 max-w-sm text-sm text-on-surface-variant">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl bg-error/8 p-4 text-sm text-error">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button className="font-semibold underline" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function EngineStatusBanner() {
  const [status, setStatus] = useState<EngineStatus | null>(null);
  useEffect(() => {
    getEngineStatus().then(setStatus).catch(() => setStatus(null));
  }, []);
  if (!status || status.reachable) return null;
  return (
    <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/8 p-4 text-sm text-amber-800">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-semibold">
          {status.configured ? "Mobile analysis engine is unreachable" : "Mobile analysis engine is not configured"}
        </p>
        <p className="mt-0.5 text-amber-800/80">
          {status.configured
            ? "Existing results stay available once the engine is back. New uploads will fail until then."
            : "Ask an administrator to set MOBILE_SECURITY_API_URL and MOBILE_SECURITY_API_KEY on the Vrika API."}
        </p>
      </div>
    </div>
  );
}

export function Spinner({ className = "size-4", label = "Loading" }: { className?: string; label?: string }) {
  return <LoaderSvg label={label} className={`inline-block shrink-0 ${className}`} />;
}

export function PageLoader({ label = "Loading…", className = "py-16" }: { label?: string; className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 text-on-surface-variant ${className}`}>
      <LoaderSvg label={label} className="size-12" />
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface-container-high ${className}`} />;
}
