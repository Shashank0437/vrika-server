"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { ErrorBanner } from "@/components/mobile-security/ui";

/** Full legacy engine UI (live device screen, every advanced tool) behind the signed embed bridge. */
export default function ClassicConsolePage() {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    setError(null);
    setSrc(null);
    setReady(false);
    api<{ embed_path: string }>("/auth/mobile-security/embed", { skipPendingOverlay: true })
      .then((r) => setSrc(r.embed_path))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not open the classic console"));
  }, [retry]);

  if (error)
    return (
      <div className="mx-auto max-w-3xl p-8">
        <ErrorBanner message={error} onRetry={() => setRetry((n) => n + 1)} />
      </div>
    );

  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-col">
      {!ready && (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-background text-sm text-on-surface-variant">
          <Loader2 className="size-4 animate-spin" /> Loading classic console…
        </div>
      )}
      {src && (
        <iframe
          title="Mobile Security classic console"
          src={src}
          onLoad={() => setReady(true)}
          className="min-h-[calc(100dvh-4rem)] w-full flex-1 border-0"
          allow="clipboard-read; clipboard-write"
        />
      )}
    </div>
  );
}
