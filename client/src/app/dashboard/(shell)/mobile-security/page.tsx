"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Bug, Gauge, Loader2, Radar, Smartphone, Upload } from "lucide-react";
import { hasPermission } from "@/lib/access";
import { useAuth } from "@/lib/auth-context";
import { isPending } from "@/lib/mobileSecurity";
import { MOBILE_SECURITY_HREF } from "@/lib/mobile-security-nav";
import { ScansTable } from "@/components/mobile-security/ScansTable";
import { useMobileScans } from "@/components/mobile-security/useMobileScans";
import {
  card,
  EmptyState,
  EngineStatusBanner,
  ErrorBanner,
  PageHeader,
  primaryButton,
  Skeleton,
} from "@/components/mobile-security/ui";

function StatCard({ icon, label, value, hint, accent }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string; accent: string }) {
  return (
    <div className={`${card} relative overflow-hidden p-5`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-on-surface">{value}</p>
          {hint && <p className="mt-1 text-xs text-on-surface-variant">{hint}</p>}
        </div>
        <span className={`flex size-10 items-center justify-center rounded-xl ${accent}`}>{icon}</span>
      </div>
    </div>
  );
}

export default function MobileSecurityOverviewPage() {
  const { user } = useAuth();
  const canExecute = hasPermission(user, "execute", { module: "mobile_security" });
  const canEdit = hasPermission(user, "edit", { module: "mobile_security" });
  const { items, total, loading, error, reload } = useMobileScans({ pageSize: 100 });
  const [actionError, setActionError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const done = items.filter((s) => s.status === "completed");
    const scored = done.filter((s) => typeof s.security_score === "number");
    const avg = scored.length ? Math.round(scored.reduce((n, s) => n + (s.security_score ?? 0), 0) / scored.length) : null;
    return {
      avg,
      high: done.reduce((n, s) => n + (s.severity.high ?? 0), 0),
      running: items.filter(isPending).length,
      atRisk: done.filter((s) => (s.security_score ?? 100) < 40).length,
    };
  }, [items]);

  return (
    <section className="mx-auto w-full max-w-6xl space-y-7 px-5 py-8 sm:px-8 lg:py-10">
      <PageHeader
        eyebrow="Mobile Security / Overview"
        title="Mobile Security"
        description="Analyse Android, iOS and Windows apps for vulnerabilities, insecure configuration, secrets, trackers and malware."
        actions={
          canExecute && (
            <Link href={`${MOBILE_SECURITY_HREF}/scans?upload=1`} className={primaryButton}>
              <Upload className="size-4" />
              New scan
            </Link>
          )
        }
      />
      <EngineStatusBanner />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[110px] rounded-2xl" />)
        ) : (
          <>
            <StatCard icon={<Smartphone className="size-5" />} label="Apps analysed" value={total} accent="bg-primary-container text-primary" />
            <StatCard
              icon={<Gauge className="size-5" />}
              label="Avg. security score"
              value={stats.avg ?? "–"}
              hint={stats.atRisk ? `${stats.atRisk} app${stats.atRisk > 1 ? "s" : ""} at high risk` : "Across completed scans"}
              accent="bg-tertiary-container/60 text-tertiary"
            />
            <StatCard icon={<Bug className="size-5" />} label="High findings" value={stats.high} hint="Open across all apps" accent="bg-error/10 text-error" />
            <StatCard
              icon={stats.running ? <Loader2 className="size-5 animate-spin" /> : <Radar className="size-5" />}
              label="In progress"
              value={stats.running}
              hint={stats.running ? "Updating automatically" : "No active analysis"}
              accent="bg-amber-500/10 text-amber-700"
            />
          </>
        )}
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="flex items-center justify-between gap-4 border-b border-outline-variant/60 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-semibold">Recent scans</h2>
            <span className="rounded-md bg-primary/8 px-2 py-0.5 text-xs font-semibold text-primary">{total}</span>
          </div>
          <Link href={`${MOBILE_SECURITY_HREF}/scans`} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
            View all <ArrowRight className="size-4" />
          </Link>
        </div>
        {(error || actionError) && (
          <div className="p-5">
            <ErrorBanner message={(error || actionError) as string} onRetry={() => { setActionError(null); void reload(); }} />
          </div>
        )}
        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : items.length ? (
          <ScansTable
            scans={items.slice(0, 6)}
            canExecute={canExecute}
            canEdit={canEdit}
            onChanged={() => { setActionError(null); void reload(true); }}
            onError={setActionError}
          />
        ) : (
          !error && (
            <EmptyState
              icon={<Smartphone className="size-6" />}
              title="No apps analysed yet"
              description="Start a new scan from Static Analysis to get a full security report in minutes."
            />
          )
        )}
      </div>
    </section>
  );
}
