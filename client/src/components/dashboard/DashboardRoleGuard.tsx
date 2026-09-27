"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { canVisitDashboard, landingRoute } from "@/lib/access";

export function DashboardRoleGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { user, loading } = useAuth();
  const blocked = !!user && !canVisitDashboard(user, pathname);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (!user || !blocked) return;
    router.replace(landingRoute(user));
  }, [user, loading, blocked, router]);

  if (blocked) {
    return null;
  }

  return <>{children}</>;
}
