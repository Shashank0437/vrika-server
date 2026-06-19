"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { LoaderSvg } from "@/components/ui/LoaderSvg";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";
import { useAuth } from "@/lib/auth-context";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  match: "exact" | "prefix";
};

const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", match: "exact" },
  { href: "/customers", label: "Customers", icon: "group", match: "prefix" },
  { href: "/licenses/generate", label: "Generate License", icon: "add_circle", match: "exact" },
  { href: "/licenses/manage", label: "Manage Licenses", icon: "license", match: "prefix" },
];

function navActive(pathname: string, item: NavItem): boolean {
  if (item.match === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div
        className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background text-on-surface-variant"
        aria-busy="true"
      >
        <LoaderSvg className="size-12" label="Loading admin portal" />
        <p className="text-sm font-medium">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-start bg-background font-sans text-on-surface">
      <aside className="sticky top-0 flex h-[100dvh] max-h-[100dvh] w-64 min-w-64 max-w-64 shrink-0 flex-col overflow-hidden border-r border-outline-variant bg-surface-container-low">
        <div className="shrink-0 px-6 pb-2 pt-6">
          <Link href="/dashboard" className="flex items-center gap-3 rounded-lg transition hover:opacity-95">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
                <MaterialSymbol name="shield" className="text-lg" filled />
              </span>
              <span className="text-lg font-bold tracking-tight text-on-surface">Vrika</span>
              <span className="rounded bg-primary-container px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">Admin</span>
            </div>
          </Link>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-0 pb-2 pt-4" aria-label="Main">
          <div className="flex flex-col">
            {MAIN_NAV.map((item) => {
              const active = navActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    active
                      ? "flex items-center gap-3 border-r-4 border-primary bg-primary-container px-6 py-3 text-sm font-semibold text-on-primary-container transition-colors"
                      : "flex items-center gap-3 px-6 py-3 text-sm text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
                  }
                >
                  <MaterialSymbol
                    name={item.icon}
                    className={`text-xl shrink-0 ${active ? "text-on-primary-container" : "text-on-surface-variant"}`}
                    filled
                  />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="shrink-0 border-t border-outline-variant px-4 pb-4 pt-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-container text-xs font-bold uppercase text-primary">
              {user.username?.slice(0, 2) || user.email?.slice(0, 2)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-on-surface">{user.username || user.email}</p>
              <p className="truncate text-xs text-on-surface-variant">{user.email}</p>
            </div>
            <button
              onClick={logout}
              className="rounded p-1 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
              title="Sign out"
            >
              <MaterialSymbol name="logout" className="text-lg" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col bg-background">
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-outline-variant bg-background/90 px-6 py-3 backdrop-blur-sm">
          <h1 className="text-lg font-semibold text-on-surface">License Administration</h1>
          {user.organization_name && (
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-primary-container text-[11px] font-black uppercase text-primary">
                {user.organization_name.slice(0, 2).toUpperCase()}
              </span>
              <span className="text-sm font-semibold text-on-surface">
                {user.organization_name}
              </span>
            </div>
          )}
        </header>
        <main className="min-h-full flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
