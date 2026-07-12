"use client";

import { useEffect, useState } from "react";
import { LoaderSvg } from "@/components/ui/LoaderSvg";
import { api, ApiError } from "@/lib/api";

type EmbedResponse = {
  embed_path: string;
};

export function CloudSecurityWorkspace() {
  const [embedPath, setEmbedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadEmbed() {
      try {
        const res = await api<EmbedResponse>("/auth/cloud-security/embed");
        if (!cancelled) {
          setEmbedPath(res.embed_path);
          setError(null);
        }
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiError
            ? err.message
            : "Could not prepare Cloud Security workspace";
        setError(message);
      }
    }

    void loadEmbed();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 rounded-xl border border-outline-variant bg-surface-container-low p-8 text-center">
        <p className="text-sm font-semibold text-on-surface">Cloud Security unavailable</p>
        <p className="max-w-md text-sm text-on-surface-variant">{error}</p>
      </div>
    );
  }

  if (!embedPath) {
    return (
      <div
        className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-on-surface-variant"
        aria-busy="true"
      >
        <LoaderSvg className="size-10" label="Loading Cloud Security" />
        <p className="text-sm font-medium">Preparing Cloud Security…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
      <iframe
        title="Cloud Security"
        src={embedPath}
        className="min-h-[calc(100dvh-8rem)] w-full flex-1 border-0 bg-background"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
