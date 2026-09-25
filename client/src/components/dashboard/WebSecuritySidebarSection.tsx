"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";

export function WebSecuritySidebarSection({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const webSecurityActive =
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/scan") ||
    pathname.startsWith("/dashboard/usage") ||
    pathname.startsWith("/dashboard/tools") ||
    pathname.startsWith("/dashboard/session");

  const isSessionsActive =
    pathname === "/dashboard" ||
    (pathname.startsWith("/dashboard/session") && !pathname.startsWith("/dashboard/scan"));
  const isScanActive = pathname.startsWith("/dashboard/scan");
  const isUsageActive = pathname.startsWith("/dashboard/usage");
  const isToolsActive = pathname.startsWith("/dashboard/tools");

  if (!webSecurityActive) {
    return (
      <Link
        href="/dashboard"
        className="flex items-center gap-3 px-6 py-3 text-sm text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
      >
        <MaterialSymbol
          name="language"
          className="text-xl shrink-0 text-on-surface-variant"
          filled
        />
        Web Security
      </Link>
    );
  }

  return (
    <div>
      <Link
        href="/dashboard"
        className="flex items-center gap-3 border-r-4 border-primary bg-primary-container px-6 py-3 text-sm font-semibold text-on-primary-container transition-colors"
      >
        <MaterialSymbol
          name="language"
          className="text-xl shrink-0 text-on-primary-container"
          filled
        />
        Web Security
      </Link>

      <div className="border-r-4 border-primary bg-primary-container/40 py-1 space-y-0.5">
        {/* Sessions */}
        <Link
          href="/dashboard"
          className={
            isSessionsActive
              ? "flex w-full items-center gap-2.5 py-2.5 pl-10 pr-6 text-xs font-semibold text-on-primary-container transition-colors bg-primary-container/60"
              : "flex w-full items-center gap-2.5 py-2.5 pl-10 pr-6 text-xs text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
          }
        >
          <MaterialSymbol
            name="history"
            className={`text-base shrink-0 ${
              isSessionsActive ? "text-on-primary-container" : "text-on-surface-variant"
            }`}
            filled
          />
          Sessions
        </Link>

        {/* Run New Scan - bold purple colored, rest all same */}
        <Link
          href="/dashboard/scan?new=1"
          className={
            isScanActive
              ? "flex w-full items-center gap-2.5 py-2.5 pl-10 pr-6 text-xs font-bold text-primary transition-colors bg-primary-container/80"
              : "flex w-full items-center gap-2.5 py-2.5 pl-10 pr-6 text-xs font-bold text-primary transition-colors hover:bg-surface-container hover:text-primary"
          }
        >
          <MaterialSymbol
            name="add_circle"
            className="text-base shrink-0 text-primary"
            filled
          />
          Run New Scan
        </Link>

        {/* Tools */}
        {isAdmin && (
          <Link
            href="/dashboard/tools"
            className={
              isToolsActive
                ? "flex w-full items-center gap-2.5 py-2.5 pl-10 pr-6 text-xs font-semibold text-on-primary-container transition-colors bg-primary-container/60"
                : "flex w-full items-center gap-2.5 py-2.5 pl-10 pr-6 text-xs text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
            }
          >
            <MaterialSymbol
              name="construction"
              className={`text-base shrink-0 ${
                isToolsActive ? "text-on-primary-container" : "text-on-surface-variant"
              }`}
              filled
            />
            Tools
          </Link>
        )}

        {/* Usage */}
        {isAdmin && (
          <Link
            href="/dashboard/usage"
            className={
              isUsageActive
                ? "flex w-full items-center gap-2.5 py-2.5 pl-10 pr-6 text-xs font-semibold text-on-primary-container transition-colors bg-primary-container/60"
                : "flex w-full items-center gap-2.5 py-2.5 pl-10 pr-6 text-xs text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
            }
          >
            <MaterialSymbol
              name="analytics"
              className={`text-base shrink-0 ${
                isUsageActive ? "text-on-primary-container" : "text-on-surface-variant"
              }`}
              filled
            />
            Usage
          </Link>
        )}
      </div>
    </div>
  );
}
