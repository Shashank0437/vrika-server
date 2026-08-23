"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderSvg } from "@/components/ui/LoaderSvg";
import { api, ApiError } from "@/lib/api";
import {
  CLOUD_SECURITY_VIEW_PARAM,
  isBridgePathForView,
  sanitizeCloudSecurityView,
  VRIKA_NAVIGATE_MESSAGE,
  VRIKA_PATHNAME_MESSAGE,
  type VrikaPathnameMessage,
} from "@/lib/cloud-security-nav";

type EmbedResponse = {
  embed_path: string;
};

/** Ignore stale iframe pathnames until the parent-requested view is acknowledged. */
const PENDING_ACK_TIMEOUT_MS = 4000;

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
  /** Parent-driven view we are waiting for the iframe to report back. */
  const pendingAckRef = useRef<string | null>(null);
  const pendingAckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** View we just wrote from an iframe pathname — skip re-navigate/ack arming. */
  const iframeSyncedViewRef = useRef<string | null>(null);

  const currentView = sanitizeCloudSecurityView(
    searchParams.get(CLOUD_SECURITY_VIEW_PARAM),
  );

  const clearPendingAck = useCallback(() => {
    pendingAckRef.current = null;
    if (pendingAckTimerRef.current) {
      clearTimeout(pendingAckTimerRef.current);
      pendingAckTimerRef.current = null;
    }
  }, []);

  const armPendingAck = useCallback((view: string) => {
    pendingAckRef.current = view;
    if (pendingAckTimerRef.current) {
      clearTimeout(pendingAckTimerRef.current);
    }
    pendingAckTimerRef.current = setTimeout(() => {
      pendingAckRef.current = null;
      pendingAckTimerRef.current = null;
    }, PENDING_ACK_TIMEOUT_MS);
  }, []);

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

    // URL was updated from iframe pathname sync — do not treat as parent nav.
    if (iframeSyncedViewRef.current === currentView) {
      iframeSyncedViewRef.current = null;
      return;
    }

    // Sidebar / deep-link: ignore stale iframe pathnames until this view is acked.
    armPendingAck(currentView);
    if (iframeReady) {
      postNavigate(currentView);
    }
  }, [armPendingAck, currentView, iframeReady, postNavigate]);

  useEffect(() => {
    return () => {
      if (pendingAckTimerRef.current) {
        clearTimeout(pendingAckTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isAllowedBridgeOrigin(event.origin)) return;
      const data = event.data as Partial<VrikaPathnameMessage> | null;
      if (data?.type !== VRIKA_PATHNAME_MESSAGE || typeof data.path !== "string") {
        return;
      }
      setIframeReady(true);

      const pendingAck = pendingAckRef.current;
      if (pendingAck !== null && !isBridgePathForView(data.path, pendingAck)) {
        // Stale boot/overview pathname — do not strip ?view=/compliance etc.
        return;
      }
      if (pendingAck !== null) {
        clearPendingAck();
      }

      const nextView = sanitizeCloudSecurityView(data.path);
      if (nextView === currentView) return;

      iframeSyncedViewRef.current = nextView;
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
  }, [clearPendingAck, currentView, router, searchParams]);

  const handleIframeLoad = () => {
    setIframeReady(true);
    const target = pendingViewRef.current ?? currentView;
    armPendingAck(target);
    postNavigate(target);
  };

  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (iframeReady) return;
    const interval = setInterval(() => {
      setStepIndex((prev) => (prev + 1) % 4);
    }, 1500);
    return () => clearInterval(interval);
  }, [iframeReady]);

  const LOADING_STEPS = [
    "Connecting to security workspace...",
    "Authenticating tenant boundary...",
    "Synchronizing cloud assets...",
    "Loading dashboard...",
  ];

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 rounded-xl border border-outline-variant bg-surface-container-low p-8 text-center">
        <p className="text-sm font-semibold text-on-surface">Cloud Security unavailable</p>
        <p className="max-w-md text-sm text-on-surface-variant">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-1 flex-col overflow-hidden bg-background">
      {/* Light Theme Loading Screen with Ambient Skeleton & Clean Floating HUD */}
      <div
        className={`absolute inset-0 z-10 flex flex-col bg-background p-6 transition-opacity duration-300 ${
          iframeReady ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
        aria-hidden={iframeReady}
      >
        {/* Background Skeleton Wireframe */}
        <div className="pointer-events-none absolute inset-0 flex flex-col gap-6 p-6 opacity-40">
          {/* Skeleton Header */}
          <div className="flex items-center justify-between">
            <div className="h-7 w-48 animate-pulse rounded-lg bg-surface-container" />
            <div className="flex gap-3">
              <div className="h-9 w-28 animate-pulse rounded-lg bg-surface-container" />
              <div className="h-9 w-28 animate-pulse rounded-lg bg-surface-container" />
            </div>
          </div>

          {/* Skeleton KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="h-28 animate-pulse rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4" />
            <div className="h-28 animate-pulse rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4" />
            <div className="h-28 animate-pulse rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4" />
            <div className="h-28 animate-pulse rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4" />
          </div>

          {/* Skeleton Content Area */}
          <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="col-span-2 animate-pulse rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-6" />
            <div className="animate-pulse rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-6" />
          </div>
        </div>

        {/* Central Simple Light Card */}
        <div className="relative m-auto flex w-full max-w-sm flex-col items-center justify-center rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-8 text-center shadow-lg shadow-primary/5">
          {/* Animated Purple Shield & Spinner Icon */}
          <div className="relative mb-5 flex size-16 items-center justify-center rounded-2xl bg-primary-container text-primary">
            <LoaderSvg className="absolute inset-0 size-16" label="Loading security workspace" />
            <svg
              className="size-7 text-primary"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>

          <h3 className="text-base font-semibold text-on-surface">
            Loading Cloud Security
          </h3>

          <p className="mt-1.5 min-h-[1.25rem] text-xs font-medium text-on-surface-variant">
            {LOADING_STEPS[stepIndex]}
          </p>

          {/* Slim Progress Bar */}
          <div className="mt-5 h-1 w-full overflow-hidden rounded-full bg-surface-container">
            <div className="h-full w-full origin-left animate-[progress_1.5s_ease-in-out_infinite] rounded-full bg-primary" />
          </div>
        </div>
      </div>

      {/* Embedded Prowler Iframe */}
      {embedPath && (
        <iframe
          ref={iframeRef}
          title="Cloud Security"
          src={embedPath}
          onLoad={handleIframeLoad}
          className="min-h-[calc(100dvh-4rem)] w-full flex-1 border-0 bg-background"
          allow="clipboard-read; clipboard-write"
        />
      )}
    </div>
  );
}
