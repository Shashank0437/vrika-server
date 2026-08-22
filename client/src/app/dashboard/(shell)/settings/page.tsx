import { Suspense } from "react";
import { DashboardSettings } from "@/components/dashboard/DashboardSettings";

export default function DashboardSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-10 text-center text-on-surface-variant">Loading…</div>
      }
    >
      <DashboardSettings />
    </Suspense>
  );
}
