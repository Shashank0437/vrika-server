"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { canEnterModule, landingRoute } from "@/lib/access";
import { ToolsWorkspace } from "@/components/tools/ToolsWorkspace";

export function ToolsPageGate() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login?next=/tools");
      return;
    }
    if (!canEnterModule(user, "web_security")) {
      router.replace(landingRoute(user));
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-on-surface-variant">
        Checking access…
      </div>
    );
  }

  if (!user || !canEnterModule(user, "web_security")) {
    return null;
  }

  return <ToolsWorkspace intro="full" />;
}
