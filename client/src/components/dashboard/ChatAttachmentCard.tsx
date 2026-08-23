"use client";

import { Download, FileText } from "lucide-react";
import type { AgentChatAttachment } from "@/lib/agentChat";

type Props = {
  attachment: AgentChatAttachment;
  onPreview?: (attachment: AgentChatAttachment) => void;
  onDownload?: (attachment: AgentChatAttachment) => void;
  className?: string;
};

function formatDocTitle(filename: string): string {
  if (!filename) return "Penetration Testing Report";
  // Strip extension
  let base = filename.replace(/\.[^/.]+$/, "");
  // Replace underscores and dashes with spaces
  base = base.replace(/[_-]+/g, " ").trim();
  // If starts with "Penetration Testing Report", keep it readable
  if (base.toLowerCase().includes("penetration") && base.toLowerCase().includes("report")) {
    // Extract target domain if present (e.g. Penetration Testing Report canplus io 1787476800)
    const targetMatch = base.match(/report\s+(?:for\s+)?([a-zA-Z0-9.-]+(?:\.[a-zA-Z]{2,}))/i);
    if (targetMatch) {
      return `Penetration Testing Report · ${targetMatch[1]}`;
    }
    return "Penetration Testing Report";
  }
  return base;
}

export function ChatAttachmentCard({
  attachment,
  onPreview,
  onDownload,
  className = "",
}: Props) {
  const title = formatDocTitle(attachment.filename);
  const isPdf =
    (attachment.content_type || "").toLowerCase().includes("pdf") ||
    (attachment.filename || "").toLowerCase().endsWith(".pdf");

  return (
    <div
      onClick={() => onPreview?.(attachment)}
      className={`group relative flex w-full max-w-lg cursor-pointer items-center justify-between gap-4 rounded-2xl border border-outline-variant/60 bg-surface-container-lowest/90 p-3.5 shadow-sm transition-all duration-200 hover:border-primary/50 hover:bg-surface-container-low/60 hover:shadow-md sm:p-4 ${className}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPreview?.(attachment);
        }
      }}
      title="Click to preview report"
    >
      {/* Left Icon + Metadata */}
      <div className="flex min-w-0 items-center gap-3.5">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary shadow-xs transition-transform duration-200 group-hover:scale-105">
          <FileText className="h-5 w-5" />
          {isPdf ? (
            <span className="absolute -bottom-1 -right-1 rounded-sm bg-red-600 px-1 py-[1px] font-mono text-[8px] font-bold text-white uppercase shadow-xs">
              PDF
            </span>
          ) : null}
        </div>

        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold text-on-surface transition-colors group-hover:text-primary">
            {title}
          </p>
          <div className="flex items-center gap-1.5 pt-0.5 text-[11.5px] text-on-surface-variant">
            <span>Document</span>
            <span>·</span>
            <span className="uppercase font-medium">{isPdf ? "PDF" : "FILE"}</span>
            <span className="hidden text-primary/70 sm:inline">· Click to preview</span>
          </div>
        </div>
      </div>

      {/* Right Action Buttons */}
      <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDownload?.(attachment);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/75 bg-surface-container-high px-3 py-1.5 text-[12px] font-semibold text-on-surface shadow-xs transition hover:border-primary/40 hover:bg-surface-container-highest active:scale-95"
          title="Download PDF"
        >
          <Download className="h-3.5 w-3.5 text-on-surface-variant" />
          <span>Download</span>
        </button>
      </div>
    </div>
  );
}
