"use client";

import { useCallback, useEffect, useState } from "react";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { BrandingSettingsCard } from "./settings/BrandingSettingsCard";
import type { BrandingOut, OrgSettingsOut } from "./settings/types";

/**
 * Registry of settings sections. Adding a new configuration group (e.g. SMTP)
 * is a two-step change: append an entry here and render it in `renderSection`.
 * The nav rail and the mobile tab strip are both derived from this list.
 */
const SECTIONS = [
  {
    id: "branding",
    label: "Branding",
    icon: "palette",
    summary: "Logo used on PDF reports",
  },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function DashboardSettings() {
  const { user, loading } = useAuth();
  const isAdmin = !!user?.roles?.includes("tenant_admin");

  const [activeId, setActiveId] = useState<SectionId>("branding");
  const [branding, setBranding] = useState<BrandingOut | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const res = await api<OrgSettingsOut>("/org/settings");
      setBranding(res.branding);
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

  const renderSection = () => {
    switch (activeId) {
      case "branding":
        return (
          <BrandingSettingsCard branding={branding} onChange={setBranding} />
        );
      default:
        return null;
    }
  };

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

      <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
        <nav
          aria-label="Settings sections"
          className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0"
        >
          {SECTIONS.map((section) => {
            const active = section.id === activeId;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveId(section.id)}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors md:w-full ${
                  active
                    ? "bg-primary-container text-on-primary-container"
                    : "text-on-surface-variant hover:bg-surface-container"
                }`}
              >
                <MaterialSymbol name={section.icon} className="text-lg" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {section.label}
                  </span>
                  <span
                    className={`hidden truncate text-xs md:block ${
                      active ? "opacity-80" : "opacity-70"
                    }`}
                  >
                    {section.summary}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="min-w-0">
          {loaded ? (
            renderSection()
          ) : (
            <div className="h-48 animate-pulse rounded-xl border border-outline-variant bg-surface-container-low" />
          )}
        </div>
      </div>
    </div>
  );
}
