"use client";

import type { ReactNode } from "react";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";

type SettingsCardProps = {
  icon: string;
  title: string;
  description?: string;
  /** Optional status pill rendered on the right of the header (e.g. "Custom"). */
  badge?: ReactNode;
  children: ReactNode;
  /** Optional actions/notes rendered under a divider at the bottom of the card. */
  footer?: ReactNode;
};

/**
 * Shared shell for every settings section so all configuration blocks
 * (branding, SMTP, …) share one consistent layout, spacing and header style.
 */
export function SettingsCard({
  icon,
  title,
  description,
  badge,
  children,
  footer,
}: SettingsCardProps) {
  return (
    <section className="rounded-xl border border-outline-variant bg-surface-container-low">
      <header className="flex items-start gap-3 border-b border-outline-variant p-5">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-container text-on-primary-container">
          <MaterialSymbol name={icon} className="text-xl" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-on-surface">{title}</h2>
            {badge}
          </div>
          {description && (
            <p className="mt-1 text-sm text-on-surface-variant">{description}</p>
          )}
        </div>
      </header>

      <div className="p-5">{children}</div>

      {footer && (
        <div className="border-t border-outline-variant px-5 py-3">{footer}</div>
      )}
    </section>
  );
}

/** Small status pill used in section headers. */
export function SettingsBadge({
  tone,
  children,
}: {
  tone: "active" | "muted";
  children: ReactNode;
}) {
  const cls =
    tone === "active"
      ? "bg-primary-container text-on-primary-container ring-primary/25"
      : "bg-surface-container-high text-on-surface-variant ring-outline-variant";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ring-1 ${cls}`}
    >
      {children}
    </span>
  );
}

/** Inline success/error feedback shared by all settings sections. */
export function SettingsStatus({
  message,
  error,
}: {
  message?: string | null;
  error?: string | null;
}) {
  if (!message && !error) return null;
  return (
    <p
      className={`flex items-center gap-1.5 text-xs ${
        error ? "text-error" : "text-primary"
      }`}
    >
      <MaterialSymbol
        name={error ? "error" : "check_circle"}
        className="text-sm"
      />
      {error ?? message}
    </p>
  );
}
