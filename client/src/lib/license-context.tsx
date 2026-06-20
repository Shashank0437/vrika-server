"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getApiBase } from "./env";

export type LicenseFeatures = {
  [key: string]: { enabled: boolean };
};

export type LicenseStatus = {
  valid: boolean;
  licenseId?: string;
  licenseType?: string;
  status?: string;
  customer?: string;
  product?: string;
  edition?: string;
  features?: LicenseFeatures;
  limits?: { maxUsers?: number; maxAgents?: number };
  expiresAt?: string;
  daysRemaining?: number;
  lastChecked?: string;
  error?: string;
  message?: string;
};

type LicenseContextValue = {
  license: LicenseStatus | null;
  loading: boolean;
  /** True when the license is valid and active */
  isLicenseValid: () => boolean;
  /** Check if a specific feature is enabled */
  hasFeature: (featureName: string) => boolean;
  /** Get a limit value */
  getLimit: (limitName: string, fallback?: number) => number;
  /** Force re-fetch license status */
  refreshLicense: () => Promise<void>;
};

const LicenseContext = createContext<LicenseContextValue | null>(null);

export function LicenseProvider({ children }: { children: ReactNode }) {
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLicense = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/license/status`);
      if (res.ok) {
        const data = (await res.json()) as LicenseStatus;
        setLicense(data);
      } else {
        setLicense({ valid: false, error: "LICENSE_NOT_FOUND", message: "Could not fetch license status." });
      }
    } catch {
      setLicense({ valid: false, error: "LICENSE_NOT_FOUND", message: "License server unreachable." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLicense();

    // Re-check every 5 minutes (frontend poll — backend does real validation)
    const interval = setInterval(() => void fetchLicense(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchLicense]);

  const isLicenseValid = useCallback((): boolean => {
    return license?.valid === true && license?.status === "active";
  }, [license]);

  const hasFeature = useCallback(
    (featureName: string): boolean => {
      if (!license?.valid) return false;
      const feat = license.features?.[featureName];
      return feat?.enabled === true;
    },
    [license],
  );

  const getLimit = useCallback(
    (limitName: string, fallback = 0): number => {
      if (!license?.valid || !license.limits) return fallback;
      return (license.limits as Record<string, number>)[limitName] ?? fallback;
    },
    [license],
  );

  const value = useMemo(
    () => ({
      license,
      loading,
      isLicenseValid,
      hasFeature,
      getLimit,
      refreshLicense: fetchLicense,
    }),
    [license, loading, isLicenseValid, hasFeature, getLimit, fetchLicense],
  );

  return <LicenseContext.Provider value={value}>{children}</LicenseContext.Provider>;
}

export function useLicense(): LicenseContextValue {
  const ctx = useContext(LicenseContext);
  if (!ctx) throw new Error("useLicense must be used within LicenseProvider");
  return ctx;
}
