"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderSvg } from "@/components/ui/LoaderSvg";
import { api, ApiError } from "@/lib/api";
import {
  CLOUD_SECURITY_VIEW_PARAM,
  sanitizeCloudSecurityView,
  VRIKA_NAVIGATE_MESSAGE,
  VRIKA_PATHNAME_MESSAGE,
  type VrikaPathnameMessage,
} from "@/lib/cloud-security-nav";

type EmbedResponse = {
  embed_path: string;
};

function isAllowedBridgeOrigin(origin: string): boolean {
  if (typeof window === "undefined" || !origin) return false;
  try {
    return new URL(origin).hostname === window.location.hostname;
  } catch {
    return false;
  }
}

function resolveProwlerOrigin(embedPath: string): string {
  try {
    return new URL(embedPath, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
}

export function CloudSecurityWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [embedPath, setEmbedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const pendingViewRef = useRef<string | null>(null);

  const currentView = sanitizeCloudSecurityView(
    searchParams.get(CLOUD_SECURITY_VIEW_PARAM),
  );

  const postNavigate = useCallback(
    (path: string) => {
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow || !embedPath) return;
      iframe.contentWindow.postMessage(
        { type: VRIKA_NAVIGATE_MESSAGE, path },
        resolveProwlerOrigin(embedPath),
      );
    },
    [embedPath],
  );

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

  useEffect(() => {
    pendingViewRef.current = currentView;
    if (iframeReady) {
      postNavigate(currentView);
    }
  }, [currentView, iframeReady, postNavigate]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isAllowedBridgeOrigin(event.origin)) return;
      const data = event.data as Partial<VrikaPathnameMessage> | null;
      if (data?.type !== VRIKA_PATHNAME_MESSAGE || typeof data.path !== "string") {
        return;
      }

      const nextView = sanitizeCloudSecurityView(data.path);
      if (nextView === currentView) return;

      const params = new URLSearchParams(searchParams.toString());
      if (nextView === "/") {
        params.delete(CLOUD_SECURITY_VIEW_PARAM);
      } else {
        params.set(CLOUD_SECURITY_VIEW_PARAM, nextView);
      }
      const query = params.toString();
      router.replace(
        query ? `/dashboard/cloud-security?${query}` : "/dashboard/cloud-security",
        { scroll: false },
      );
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [currentView, router, searchParams]);

  const handleIframeLoad = () => {
    setIframeReady(true);
    postNavigate(pendingViewRef.current ?? currentView);
  };

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
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col overflow-hidden">
      <iframe
        ref={iframeRef}
        title="Cloud Security"
        src={embedPath}
        onLoad={handleIframeLoad}
        className="min-h-[calc(100dvh-4rem)] w-full flex-1 border-0 bg-background"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
