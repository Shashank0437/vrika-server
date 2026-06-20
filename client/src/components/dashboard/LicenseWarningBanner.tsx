"use client";

import { useLicense } from "@/lib/license-context";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";

export function LicenseWarningBanner() {
  const { license, loading } = useLicense();

  if (loading || !license?.valid) return null;

  // Warn if expiring within 30 days
  const days = license.daysRemaining ?? 999;
  if (days > 30) return null;

  const urgent = days <= 7;

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 text-xs font-medium ${
        urgent
          ? "bg-error/10 text-error"
          : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
      }`}
    >
      <MaterialSymbol
        name={urgent ? "error" : "warning"}
        className="text-base"
        filled
      />
      <span>
        {days === 0
          ? "Your license expires today!"
          : days === 1
            ? "Your license expires tomorrow!"
            : `Your license expires in ${days} days.`}
        {" "}Contact your administrator to renew.
      </span>
    </div>
  );
}
