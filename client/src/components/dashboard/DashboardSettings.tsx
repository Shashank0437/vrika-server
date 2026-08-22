"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

type BrandingOut = {
  has_custom_logo: boolean;
  logo_filename: string;
  logo_content_type: string;
  logo: string | null;
  updated_at: string | null;
};

type OrgSettingsOut = {
  branding: BrandingOut;
};

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

export function DashboardSettings() {
  const { user, loading } = useAuth();
  const isAdmin = !!user?.roles?.includes("tenant_admin");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [branding, setBranding] = useState<BrandingOut | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const res = await api<OrgSettingsOut>("/org/settings");
      setBranding(res.branding);
      setFetchError(null);
    } catch (err) {
      setFetchError(
        err instanceof ApiError ? err.message : "Failed to load settings",
      );
    }
  }, []);

  useEffect(() => {
    if (!loading && isAdmin) void loadSettings();
  }, [loading, isAdmin, loadSettings]);

  const handleSelect = () => fileInputRef.current?.click();

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
      setBranding(res);
      setMessage("Logo updated. It will appear on Cloud Security PDF reports.");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to upload logo.",
      );
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
      setBranding(res);
      setMessage("Logo removed. Reports will use the default logo.");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to remove logo.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!loading && !isAdmin) {
    return (
      <div className="p-10 text-center text-on-surface-variant">
        You need administrator access to manage organization settings.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-on-surface">Settings</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Organization-wide configuration.
        </p>
      </div>

      {fetchError && (
        <div className="mb-4 rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
          {fetchError}
        </div>
      )}

      {/* Branding card */}
      <section className="rounded-xl border border-outline-variant bg-surface-container-low p-5">
        <div className="mb-4 flex items-start gap-3">
          <MaterialSymbol name="palette" className="text-primary" />
          <div>
            <h2 className="text-lg font-semibold text-on-surface">
              Report Branding
            </h2>
            <p className="text-sm text-on-surface-variant">
              Upload your company logo to appear on generated Cloud Security PDF
              reports. If no logo is set, the default logo is used. PNG or JPEG,
              up to 2 MB.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-24 w-48 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-outline-variant bg-surface-container">
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
                <span className="text-xs">Default logo</span>
              </div>
            )}
          </div>

          <div className="flex flex-1 flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSelect}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-on-primary disabled:opacity-60"
              >
                <MaterialSymbol name="upload" className="text-base" />
                {busy
                  ? "Working…"
                  : branding?.has_custom_logo
                    ? "Replace logo"
                    : "Upload logo"}
              </button>
              {branding?.has_custom_logo && (
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
            {branding?.has_custom_logo && branding.logo_filename && (
              <p className="text-xs text-on-surface-variant">
                Current file: {branding.logo_filename}
              </p>
            )}
            {message && <p className="text-xs text-primary">{message}</p>}
            {error && <p className="text-xs text-error">{error}</p>}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={handleFile}
        />
      </section>
    </div>
  );
}
