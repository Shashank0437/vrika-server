"use client";

import { useRef, useState } from "react";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";
import { ApiError, api } from "@/lib/api";
import { SettingsBadge, SettingsCard, SettingsStatus } from "./SettingsCard";
import type { BrandingOut } from "./types";

const ALLOWED_TYPES = ["image/png", "image/jpeg"];
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function BrandingSettingsCard({
  branding,
  onChange,
}: {
  branding: BrandingOut | null;
  onChange: (next: BrandingOut) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMessage(null);
    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Please upload a PNG or JPEG image.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError("The logo must be 2 MB or smaller.");
      return;
    }

    setBusy(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await api<BrandingOut>("/org/settings/branding", {
        method: "PATCH",
        json: { logo_base64: dataUrl, logo_filename: file.name },
      });
      onChange(res);
      setMessage("Logo updated. It will appear on Cloud Security PDF reports.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to upload logo.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setMessage(null);
    setError(null);
    setBusy(true);
    try {
      const res = await api<BrandingOut>("/org/settings/branding", {
        method: "DELETE",
      });
      onChange(res);
      setMessage("Logo removed. Reports will use the default logo.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove logo.");
    } finally {
      setBusy(false);
    }
  };

  const hasCustom = !!branding?.has_custom_logo;

  return (
    <SettingsCard
      icon="palette"
      title="Report Branding"
      description="Your company logo replaces the default Vrika logo on generated Cloud Security PDF reports."
      badge={
        <SettingsBadge tone={hasCustom ? "active" : "muted"}>
          {hasCustom ? "Custom logo" : "Default logo"}
        </SettingsBadge>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-on-surface-variant">
            PNG or JPEG, up to 2 MB. Recommended: a wide logo on a transparent
            background.
          </p>
          <SettingsStatus message={message} error={error} />
        </div>
      }
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex h-24 w-48 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-outline-variant bg-surface-container p-2">
          {branding?.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logo}
              alt="Report logo preview"
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-1 text-on-surface-variant">
              <MaterialSymbol name="image" />
              <span className="text-xs">No logo uploaded</span>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-on-primary disabled:opacity-60"
            >
              <MaterialSymbol name="upload" className="text-base" />
              {busy ? "Working…" : hasCustom ? "Replace logo" : "Upload logo"}
            </button>
            {hasCustom && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full bg-error-container px-4 py-2 text-sm font-medium text-on-error-container disabled:opacity-60"
              >
                <MaterialSymbol name="delete" className="text-base" />
                Remove
              </button>
            )}
          </div>
          {hasCustom && branding?.logo_filename && (
            <p className="truncate text-xs text-on-surface-variant">
              Current file: {branding.logo_filename}
            </p>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={handleFile}
      />
    </SettingsCard>
  );
}
