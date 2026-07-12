import { Suspense } from "react";
import { CloudSecurityWorkspace } from "@/components/dashboard/CloudSecurityWorkspace";

export default function CloudSecurityLayout() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-on-surface-variant">
          Loading Cloud Security…
        </div>
      }
    >
      <CloudSecurityWorkspace />
    </Suspense>
  );
}
