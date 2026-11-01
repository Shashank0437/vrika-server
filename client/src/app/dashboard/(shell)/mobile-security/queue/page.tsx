"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ListChecks, RefreshCcw } from "lucide-react";
import { engineAction, timeAgo, type EngineTask } from "@/lib/mobileSecurity";
import { mobileScanHref } from "@/lib/mobile-security-nav";
import { card, EmptyState, EngineStatusBanner, ErrorBanner, PageHeader, secondaryButton, Skeleton } from "@/components/mobile-security/ui";

function statusTone(s: string) {
  const v = s.toLowerCase();
  if (v.includes("success") || v.includes("complete")) return "bg-tertiary/10 text-tertiary";
  if (v.includes("fail") || v.includes("error")) return "bg-error/10 text-error";
  if (v.includes("queue") || v.includes("pending")) return "bg-amber-500/10 text-amber-700";
  return "bg-primary/10 text-primary";
}

export default function ScanQueuePage() {
  const [tasks, setTasks] = useState<EngineTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await engineAction<EngineTask[]>("static.tasks");
      setTasks(Array.isArray(r) ? r : []);
      setError(null);
    } catch (e) {
      // The engine answers "Scan queue empty" with an error status.
      const msg = e instanceof Error ? e.message : "Could not load the scan queue";
      if (/queue empty/i.test(msg)) {
        setTasks([]);
        setError(null);
      } else setError(msg);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <section className="mx-auto w-full max-w-6xl space-y-7 px-5 py-8 sm:px-8 lg:py-10">
      <PageHeader
        eyebrow="Mobile Security / Scan Queue"
        title="Scan Queue"
        description="Background analysis tasks for your organization. Refreshes every few seconds."
        actions={
          <button className={secondaryButton} onClick={() => void load()}>
            <RefreshCcw className="size-4" /> Refresh
          </button>
        }
      />
      <EngineStatusBanner />
      {error && <ErrorBanner message={error} onRetry={() => void load()} />}
      <div className={`${card} overflow-hidden`}>
        {tasks === null ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : tasks.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-container-low text-xs uppercase tracking-wider text-on-surface-variant">
                <tr>
                  <th className="px-6 py-3 font-semibold">App</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Queued</th>
                  <th className="px-3 py-3 font-semibold">Started</th>
                  <th className="px-3 py-3 font-semibold">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/40">
                {tasks.map((t) => (
                  <tr key={t.task_id} className="hover:bg-surface-container-low/60">
                    <td className="px-6 py-3">
                      <Link href={mobileScanHref(t.checksum)} className="font-semibold text-on-surface hover:text-primary">
                        {t.app_name || t.file_name}
                      </Link>
                      <p className="font-mono text-xs text-on-surface-variant">{t.checksum}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone(t.status)}`}>{t.status}</span>
                    </td>
                    <td className="px-3 py-3 text-xs text-on-surface-variant">{timeAgo(t.created_at)}</td>
                    <td className="px-3 py-3 text-xs text-on-surface-variant">{timeAgo(t.started_at)}</td>
                    <td className="px-3 py-3 text-xs text-on-surface-variant">{timeAgo(t.completed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={<ListChecks className="size-6" />} title="Scan queue is empty" description="Queued and running analyses will appear here." />
        )}
      </div>
    </section>
  );
}
