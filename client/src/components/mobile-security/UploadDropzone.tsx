"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { CloudUpload, FileArchive, ShieldCheck } from "lucide-react";
import { ACCEPTED_EXTENSIONS, uploadScan } from "@/lib/mobileSecurity";
import { mobileScanHref } from "@/lib/mobile-security-nav";
import { card, ErrorBanner, Spinner } from "./ui";

export function UploadDropzone({ disabled, onUploaded }: { disabled?: boolean; onUploaded?: () => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const busy = file !== null;

  async function start(selected: File | undefined) {
    if (!selected || busy || disabled) return;
    const ext = selected.name.slice(selected.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      setError(`Unsupported file type "${ext}". Use ${ACCEPTED_EXTENSIONS.join(", ")}.`);
      return;
    }
    setError(null);
    setFile(selected);
    setProgress(0);
    try {
      const scan = await uploadScan(selected, setProgress);
      onUploaded?.();
      router.push(mobileScanHref(scan.hash));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setFile(null);
      if (input.current) input.current.value = "";
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void start(e.dataTransfer.files?.[0]);
  }

  return (
    <div className={`${card} relative overflow-hidden p-1.5`}>
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || busy}
        aria-label="Upload a mobile application for analysis"
        onClick={() => !busy && !disabled && input.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !busy && !disabled) {
            e.preventDefault();
            input.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
          disabled
            ? "cursor-not-allowed border-outline-variant/60 opacity-60"
            : dragging
              ? "cursor-copy border-primary bg-primary-container/50"
              : "cursor-pointer border-outline-variant hover:border-primary/60 hover:bg-surface-container-low"
        }`}
      >
        <input
          ref={input}
          type="file"
          hidden
          accept={ACCEPTED_EXTENSIONS.join(",")}
          onChange={(e) => void start(e.target.files?.[0])}
        />
        {busy ? (
          <>
            <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-on-primary shadow-lg shadow-primary/25">
              {progress < 100 ? <FileArchive className="size-7" /> : <Spinner className="size-8" label="Starting analysis" />}
            </span>
            <div className="w-full max-w-sm">
              <p className="truncate text-sm font-semibold text-on-surface">{file.name}</p>
              <p className="mt-0.5 text-xs text-on-surface-variant">
                {progress < 100 ? `Uploading… ${progress}%` : "Upload complete — starting analysis…"}
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-container-high">
                <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </>
        ) : (
          <>
            <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-dim text-on-primary shadow-lg shadow-primary/25">
              <CloudUpload className="size-7" />
            </span>
            <div>
              <p className="text-base font-semibold text-on-surface">
                {disabled ? "You have read-only access" : "Drop your app here or click to browse"}
              </p>
              <p className="mt-1 text-sm text-on-surface-variant">
                APK, AAB, XAPK, IPA, APPX, JAR, AAR or zipped source code
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-on-surface-variant">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-tertiary" /> Static analysis
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-tertiary" /> Malware &amp; tracker detection
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-tertiary" /> OWASP MASVS mapping
              </span>
            </div>
          </>
        )}
      </div>
      {error && (
        <div className="p-3 pt-2">
          <ErrorBanner message={error} />
        </div>
      )}
    </div>
  );
}
