"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useProjectScope } from "@/lib/use-project-scope";
import { ProjectScopePicker } from "./ProjectScopePicker";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
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
  const { user } = useAuth();
  const project = useProjectScope(user, "cloud_security");
  const projectId = project.scope;
  const [retry, setRetry] = useState(0);
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
    if (!project.ready) return;
    let cancelled = false;

    async function loadEmbed() {
      setEmbedPath(null);
      setIframeReady(false);
      setError(null);
      try {
        const res = await api<EmbedResponse>(`/auth/cloud-security/embed${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""}`, {
          skipPendingOverlay: true,
        });
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
  }, [projectId, project.ready, retry]);

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
      <>
      <ProjectScopePicker context={project} label="Cloud project" portal />
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 rounded-xl border border-outline-variant bg-surface-container-low p-8 text-center">
        <p className="text-sm font-semibold text-on-surface">Cloud Security unavailable</p>
        <p className="max-w-md text-sm text-on-surface-variant">{error}</p>
        <button type="button" onClick={() => setRetry((value) => value + 1)} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary">Retry workspace</button>
      </div>
      </>
    );
  }

  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-1 flex-col overflow-hidden bg-background">
      <ProjectScopePicker context={project} label="Cloud project" portal />
      {/* Cloud Security Loading Screen */}
      <div
        className={`absolute inset-0 z-10 flex items-center justify-center bg-[#f4f3fb] p-6 transition-opacity duration-300 ${
          iframeReady ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
        aria-hidden={iframeReady}
      >
        <div className="w-full max-w-[460px]">
          <div className="rounded-[20px] border border-[#e7e5f5] bg-white p-[44px_40px_36px] text-center shadow-[0_1px_2px_rgba(22,20,43,0.04)]">
            <div className="cloud-security-boundary relative mx-auto mb-7 size-[140px]">
              <svg viewBox="0 0 140 140" className="size-full overflow-visible">
                {/* hex track */}
                <polygon className="hex-track" points="70,16 116,43 116,97 70,124 24,97 24,43" />
                <polygon className="hex-progress" points="70,16 116,43 116,97 70,124 24,97 24,43" />
                {/* vertex nodes */}
                <circle className="node n1" cx="70" cy="16" r="3.5" />
                <circle className="node n2" cx="116" cy="43" r="3.5" />
                <circle className="node n3" cx="116" cy="97" r="3.5" />
                <circle className="node n4" cx="70" cy="124" r="3.5" />
                <circle className="node n5" cx="24" cy="97" r="3.5" />
                <circle className="node n6" cx="24" cy="43" r="3.5" />
                {/* core */}
                <circle className="core" cx="70" cy="70" r="22" />
                <path className="core-check" d="M60 71 L67 78 L81 62" />
              </svg>
            </div>

            <h1 className="text-[17px] font-semibold tracking-[-0.01em] text-[#16142b] mb-1.5">
              Loading Cloud Security
            </h1>

            <p className="min-h-[18px] text-[13.5px] text-[#6e6b8c] mb-0">
              {LOADING_STEPS[stepIndex]}
            </p>

            <p className="mt-[18px] text-[11.5px] text-[#a5a2c2]">
              This usually takes a few seconds
            </p>
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
