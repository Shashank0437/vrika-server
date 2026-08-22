"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { BrandingSettingsCard } from "./settings/BrandingSettingsCard";
import { LlmSettingsCard } from "./settings/LlmSettingsCard";
import { SsoSettingsCard } from "./settings/SsoSettingsCard";
import type {
  BrandingOut,
  LlmSettingsOut,
  OrgSettingsOut,
  SsoSettingsOut,
} from "./settings/types";

export function DashboardSettings() {
  const { user, loading } = useAuth();
  const isAdmin = !!user?.roles?.includes("tenant_admin");
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const activeTab = rawTab === "llm" ? "llm" : rawTab === "sso" ? "sso" : "branding";

  const [branding, setBranding] = useState<BrandingOut | null>(null);
  const [llm, setLlm] = useState<LlmSettingsOut | null>(null);
  const [sso, setSso] = useState<SsoSettingsOut | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const res = await api<OrgSettingsOut>("/org/settings");
      setBranding(res.branding);
      setLlm(res.llm);
      setSso(res.sso ?? null);
      setFetchError(null);
    } catch (err) {
      setFetchError(
        err instanceof ApiError ? err.message : "Failed to load settings",
      );
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loading && isAdmin) void loadSettings();
  }, [loading, isAdmin, loadSettings]);

  if (!loading && !isAdmin) {
    return (
      <div className="p-10 text-center text-on-surface-variant">
        You need administrator access to manage organization settings.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-4 md:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-on-surface">Settings</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Organization-wide configuration shared across Vrika services.
        </p>
      </header>

      {fetchError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
          <MaterialSymbol name="error" className="text-base" />
          {fetchError}
        </div>
      )}

      <div className="min-w-0">
        {loaded ? (
          activeTab === "llm" ? (
            <LlmSettingsCard settings={llm} onChange={setLlm} />
          ) : activeTab === "sso" ? (
            <SsoSettingsCard sso={sso} onChange={setSso} />
          ) : (
            <BrandingSettingsCard branding={branding} onChange={setBranding} />
          )
        ) : (
          <div className="h-64 animate-pulse rounded-xl border border-outline-variant bg-surface-container-low" />
        )}
      </div>
    </div>
  );
}
