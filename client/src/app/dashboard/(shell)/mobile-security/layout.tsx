import { Suspense } from "react";
import { MobileSecurityWorkspace } from "@/components/dashboard/MobileSecurityWorkspace";
export default function MobileSecurityLayout() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-on-surface-variant">
          Loading Mobile Security…
        </div>
      }
    >
      <MobileSecurityWorkspace />
    </Suspense>
  );
}
