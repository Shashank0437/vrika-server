"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  X,
  AlertCircle,
} from "lucide-react";
import {
  downloadAgentChatAttachment,
  type AgentChatAttachment,
} from "@/lib/agentChat";

type Props = {
  sessionId: string;
  attachment: AgentChatAttachment;
  sessionTitle?: string;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onClose: () => void;
  onDownload?: (attachment: AgentChatAttachment) => void;
};

function formatDocTitle(filename: string): string {
  if (!filename) return "Penetration Testing Report";
  let base = filename.replace(/\.[^/.]+$/, "");
  base = base.replace(/[_-]+/g, " ").trim();
  if (base.toLowerCase().includes("penetration") && base.toLowerCase().includes("report")) {
    const targetMatch = base.match(/report\s+(?:for\s+)?([a-zA-Z0-9.-]+(?:\.[a-zA-Z]{2,}))/i);
    if (targetMatch) {
      return `Penetration Testing Report · ${targetMatch[1]}`;
    }
    return "Penetration Testing Report";
  }
  return base;
}

export function ChatArtifactPreviewPanel({
  sessionId,
  attachment,
  sessionTitle,
  isFullscreen = false,
  onToggleFullscreen,
  onClose,
  onDownload,
}: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentBlobUrlRef = useRef<string | null>(null);

  const loadPdfBlob = useCallback(async () => {
    if (!sessionId || !attachment.id) return;
    setLoading(true);
    setError(null);
    try {
      const { blob } = await downloadAgentChatAttachment(sessionId, attachment.id);
      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
      }
      const url = URL.createObjectURL(blob);
      currentBlobUrlRef.current = url;
      setBlobUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load PDF preview");
    } finally {
      setLoading(false);
    }
  }, [sessionId, attachment.id]);

  useEffect(() => {
    void loadPdfBlob();
    return () => {
      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
        currentBlobUrlRef.current = null;
      }
    };
  }, [loadPdfBlob]);

  const handleOpenNewTab = () => {
    if (blobUrl) {
      window.open(blobUrl, "_blank");
    } else {
      onDownload?.(attachment);
    }
  };

  const handleDownload = () => {
    if (onDownload) {
      onDownload(attachment);
    } else if (blobUrl) {
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = attachment.filename || "penetration-report.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  const title = formatDocTitle(attachment.filename);

  return (
    <div
      className={
        isFullscreen
          ? "fixed inset-0 z-50 flex flex-col bg-surface-container-lowest transition-all duration-300"
          : "flex h-full w-full flex-col border-l border-outline-variant/70 bg-surface-container-lowest transition-all duration-300 lg:w-[48%] xl:w-[50%]"
      }
    >
      {/* Panel Header */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-outline-variant/60 bg-surface-container-lowest px-4 py-3 sm:px-5">
        {/* Left: Clean Document Title */}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[13px] font-semibold text-on-surface" title={title}>
            {title}{" "}
            <span className="font-normal text-on-surface-variant">· PDF</span>
          </h3>
        </div>

        {/* Right: Actions */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          {/* Download Button */}
          <button
            type="button"
            onClick={handleDownload}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition hover:bg-surface-container-high hover:text-on-surface active:scale-95"
            title="Download PDF"
          >
            <Download className="h-4 w-4" />
          </button>

          {/* Open in New Tab */}
          <button
            type="button"
            onClick={handleOpenNewTab}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition hover:bg-surface-container-high hover:text-on-surface active:scale-95"
            title="Open in new tab"
          >
            <ExternalLink className="h-4 w-4" />
          </button>

          {/* Fullscreen Toggle */}
          {onToggleFullscreen ? (
            <button
              type="button"
              onClick={onToggleFullscreen}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition hover:bg-surface-container-high hover:text-on-surface active:scale-95"
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </button>
          ) : null}

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition hover:bg-surface-container-high hover:text-on-surface active:scale-95"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Panel Body - Clean full bleed viewer with pure white background */}
      <div className="relative min-h-0 flex-1 bg-white">
        {loading ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center bg-white">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <p className="text-[13px] font-medium text-on-surface-variant">
              Loading PDF report preview…
            </p>
          </div>
        ) : error ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6 text-center bg-white">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-error/12 text-error">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div className="max-w-md">
              <h4 className="text-[14px] font-bold text-on-surface">Unable to load PDF preview</h4>
              <p className="mt-1 text-[12px] text-on-surface-variant">{error}</p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => void loadPdfBlob()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container-high px-3 py-1.5 text-[12px] font-semibold text-on-surface hover:bg-surface-container-highest"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-bold text-on-primary hover:opacity-90"
              >
                <Download className="h-3.5 w-3.5" />
                Download PDF
              </button>
            </div>
          </div>
        ) : blobUrl ? (
          <iframe
            src={`${blobUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`}
            className="h-full w-full border-0 bg-white"
            title={attachment.filename || "PDF Report Preview"}
          />
        ) : null}
      </div>
    </div>
  );
}
