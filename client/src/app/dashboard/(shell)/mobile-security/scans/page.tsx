"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, GitCompareArrows, Search, Smartphone, Upload, X } from "lucide-react";
import { hasPermission } from "@/lib/access";
import { useAuth } from "@/lib/auth-context";
import { MOBILE_SECURITY_HREF } from "@/lib/mobile-security-nav";
import { ScansTable } from "@/components/mobile-security/ScansTable";
import { UploadDropzone } from "@/components/mobile-security/UploadDropzone";
import { useMobileScans } from "@/components/mobile-security/useMobileScans";
import {
  card,
  EmptyState,
  EngineStatusBanner,
  ErrorBanner,
  PageHeader,
  primaryButton,
  secondaryButton,
  PageLoader,
} from "@/components/mobile-security/ui";

const PAGE_SIZE = 15;

export default function MobileScansPage() {
  return (
    <Suspense fallback={null}>
      <MobileScansPageInner />
    </Suspense>
  );
}

function MobileScansPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const canExecute = hasPermission(user, "execute", { module: "mobile_security" });
  const canEdit = hasPermission(user, "edit", { module: "mobile_security" });
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [showUpload, setShowUpload] = useState(searchParams.get("upload") === "1");
  const [actionError, setActionError] = useState<string | null>(null);
  const { items, total, loading, error, reload } = useMobileScans({ page, pageSize: PAGE_SIZE, q: debounced });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(query);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  function toggle(hash: string) {
    setSelected((cur) => (cur.includes(hash) ? cur.filter((h) => h !== hash) : [...cur, hash].slice(-2)));
  }

  return (
    <section className="mx-auto w-full max-w-6xl space-y-7 px-5 py-8 sm:px-8 lg:py-10">
      <PageHeader
        eyebrow="Mobile Security / Static Analysis"
        title="Static Analysis"
        description="Upload builds and review every static analysis report for your organization. Select two Android scans to compare them."
        actions={
          <>
            <button
              className={secondaryButton}
              disabled={selected.length !== 2}
              onClick={() => router.push(`${MOBILE_SECURITY_HREF}/compare?a=${selected[0]}&b=${selected[1]}`)}
            >
              <GitCompareArrows className="size-4" />
              Compare{selected.length ? ` (${selected.length}/2)` : ""}
            </button>
            {canExecute && (
              <button className={primaryButton} onClick={() => setShowUpload((v) => !v)}>
                {showUpload ? <X className="size-4" /> : <Upload className="size-4" />}
                {showUpload ? "Close" : "New scan"}
              </button>
            )}
          </>
        }
      />
      <EngineStatusBanner />
      {showUpload && <UploadDropzone onUploaded={() => void reload(true)} />}

      <div className={`${card} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-outline-variant/60 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-semibold">All scans</h2>
            <span className="rounded-md bg-primary/8 px-2 py-0.5 text-xs font-semibold text-primary">{total}</span>
          </div>
          <label className="flex h-10 w-full items-center gap-2 rounded-xl border border-outline-variant/70 bg-surface px-3 sm:w-72">
            <Search className="size-4 text-on-surface-variant" />
            <input
              type="search"
              aria-label="Search scans"
              placeholder="Search by app, package, file or hash…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="no-search-cancel w-full bg-transparent text-sm outline-none"
            />
          </label>
        </div>
        {(error || actionError) && (
          <div className="p-5">
            <ErrorBanner
              message={(error || actionError) as string}
              onRetry={() => {
                setActionError(null);
                void reload();
              }}
            />
          </div>
        )}
        {loading ? (
          <PageLoader label="Loading scans…" className="py-12" />
        ) : items.length ? (
          <ScansTable
            scans={items}
            canExecute={canExecute}
            canEdit={canEdit}
            selectable
            selected={selected}
            onToggle={toggle}
            onChanged={() => {
              setActionError(null);
              setSelected((cur) => cur.filter((h) => items.some((s) => s.hash === h)));
              void reload(true);
            }}
            onError={setActionError}
          />
        ) : (
          !error && (
            <EmptyState
              icon={<Smartphone className="size-6" />}
              title={debounced ? "No scans match your search" : "No scans yet"}
              description={debounced ? "Try a different app name, package or hash." : "Upload an app to start your first analysis."}
            />
          )
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-outline-variant/60 px-5 py-3 text-sm text-on-surface-variant sm:px-6">
            <span>
              Page {page} of {pages}
            </span>
            <div className="flex gap-2">
              <button className={secondaryButton} disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                <ChevronLeft className="size-4" />
              </button>
              <button className={secondaryButton} disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
