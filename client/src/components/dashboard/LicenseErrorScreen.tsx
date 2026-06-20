"use client";

import { useLicense } from "@/lib/license-context";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";

const ERROR_MESSAGES: Record<string, { title: string; description: string; icon: string }> = {
  LICENSE_NOT_FOUND: {
    title: "License Not Activated",
    description: "No valid license file found. Please contact your administrator to activate this installation.",
    icon: "key_off",
  },
  INVALID_SIGNATURE: {
    title: "License Tampered",
    description: "The license file signature is invalid. The file may have been modified. Please contact your administrator.",
    icon: "gpp_bad",
  },
  LICENSE_EXPIRED: {
    title: "License Expired",
    description: "Your license has expired. Please contact your administrator to renew.",
    icon: "schedule",
  },
  LICENSE_REVOKED: {
    title: "License Revoked",
    description: "This license has been revoked. Please contact your administrator.",
    icon: "block",
  },
  LICENSE_SUSPENDED: {
    title: "License Suspended",
    description: "This license has been temporarily suspended. Please contact your administrator.",
    icon: "pause_circle",
  },
  MACHINE_MISMATCH: {
    title: "Machine Mismatch",
    description: "This license is not valid for this machine. The hardware fingerprint does not match.",
    icon: "devices",
  },
};

const DEFAULT_ERROR = {
  title: "License Invalid",
  description: "Your license could not be validated. Please contact your administrator.",
  icon: "error",
};

export function LicenseErrorScreen() {
  const { license, loading } = useLicense();

  if (loading) return null;
  if (!license || license.valid) return null;

  const errorInfo = ERROR_MESSAGES[license.error ?? ""] ?? DEFAULT_ERROR;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="mx-4 max-w-md rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 text-center shadow-xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-error/10">
          <MaterialSymbol
            name={errorInfo.icon}
            className="text-4xl text-error"
            filled
          />
        </div>
        <h1 className="mb-2 text-xl font-bold text-on-surface">
          {errorInfo.title}
        </h1>
        <p className="mb-6 text-sm text-on-surface-variant">
          {errorInfo.description}
        </p>
        {license.message && (
          <div className="mb-4 rounded-lg bg-surface-container px-4 py-3 text-left">
            <p className="text-xs font-medium text-on-surface-variant">
              <span className="font-mono text-error">{license.error}</span>
              <br />
              {license.message}
            </p>
          </div>
        )}
        <p className="text-xs text-on-surface-variant/70">
          Contact your Vrika Security administrator for assistance.
        </p>
      </div>
    </div>
  );
}
