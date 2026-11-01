"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";
import {
  isMobileNavActive,
  MOBILE_SECURITY_HREF,
  MOBILE_SECURITY_NAV,
} from "@/lib/mobile-security-nav";

export function MobileSecuritySidebarSection() {
  const pathname = usePathname();
  const sectionActive = pathname.startsWith(MOBILE_SECURITY_HREF);

  if (!sectionActive) {
    return (
      <Link
        href={MOBILE_SECURITY_HREF}
        className="flex items-center justify-between px-6 py-3 text-sm text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
      >
        <div className="flex items-center gap-3">
          <MaterialSymbol name="smartphone" className="text-xl shrink-0 text-on-surface-variant" filled />
          <span>Mobile Security</span>
        </div>
        <MaterialSymbol name="expand_more" className="text-base shrink-0 text-on-surface-variant/70" />
      </Link>
    );
  }

  return (
    <div>
      <Link
        href={MOBILE_SECURITY_HREF}
        className="flex items-center justify-between border-r-4 border-primary bg-primary-container px-6 py-3 text-sm font-semibold text-on-primary-container transition-colors"
      >
        <div className="flex items-center gap-3">
          <MaterialSymbol name="smartphone" className="text-xl shrink-0 text-on-primary-container" filled />
          <span>Mobile Security</span>
        </div>
        <MaterialSymbol name="expand_less" className="text-base shrink-0 text-on-primary-container" />
      </Link>
      <div className="space-y-0.5 border-r-4 border-primary bg-primary-container/40 py-1">
        {MOBILE_SECURITY_NAV.map((leaf) => {
          const active = isMobileNavActive(pathname, leaf);
          return (
            <Link
              key={leaf.id}
              href={leaf.href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "flex w-full items-center gap-2.5 py-2 pl-10 pr-6 text-xs font-semibold text-on-primary-container transition-colors"
                  : "flex w-full items-center gap-2.5 py-2 pl-10 pr-6 text-xs text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
              }
            >
              <MaterialSymbol
                name={leaf.icon}
                className={`text-base shrink-0 ${active ? "text-on-primary-container" : "text-on-surface-variant"}`}
                filled
              />
              {leaf.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
