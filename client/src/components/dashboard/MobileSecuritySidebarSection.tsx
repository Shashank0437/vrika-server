"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";
import {
  buildMobileSecurityHref,
  isMobileSecurityViewActive,
  MOBILE_SECURITY_NAV,
  MOBILE_SECURITY_VIEW_PARAM,
  sanitizeMobileSecurityView,
  type MobileSecurityNavLeaf,
} from "@/lib/mobile-security-nav";
const MOBILE_SECURITY_HREF = "/dashboard/mobile-security";
function MobileNavButton({
  leaf,
  currentView,
}: {
  leaf: MobileSecurityNavLeaf;
  currentView: string;
}) {
  const router = useRouter();
  const active = isMobileSecurityViewActive(currentView, leaf.mobilePath);
  return (
    <button
      type="button"
      disabled={leaf.disabled}
      onClick={() => {
        if (leaf.disabled) return;
        router.push(buildMobileSecurityHref(leaf.mobilePath), { scroll: false });
      }}
      className={
        active
          ? "flex w-full items-center gap-2.5 py-2 pl-10 pr-6 text-xs font-semibold text-on-primary-container transition-colors"
          : "flex w-full items-center gap-2.5 py-2 pl-10 pr-6 text-xs text-on-surface-variant transition-colors hover:bg-surface-container"
      }
    >
      <MaterialSymbol
        name={leaf.icon}
        className={`text-base shrink-0 ${active ? "text-on-primary-container" : "text-on-surface-variant"}`}
        filled
      />
      {leaf.label}
    </button>
  );
}
export function MobileSecuritySidebarSection() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mobileSecurityActive = pathname.startsWith(MOBILE_SECURITY_HREF);
  const currentView = sanitizeMobileSecurityView(
    searchParams.get(MOBILE_SECURITY_VIEW_PARAM),
  );
  if (!mobileSecurityActive) {
    return (
      <Link
        href={MOBILE_SECURITY_HREF}
        className="flex items-center justify-between px-6 py-3 text-sm text-on-surface-variant transition-colors hover:bg-surface-container"
      >
        <div className="flex items-center gap-3">
          <MaterialSymbol
            name="smartphone"
            className="text-xl shrink-0 text-on-surface-variant"
            filled
          />
          <span>Mobile Security</span>
        </div>
        <MaterialSymbol
          name="expand_more"
          className="text-base shrink-0 text-on-surface-variant/70"
        />
      </Link>
    );
  }
  return (
    <div>
      <Link
        href={MOBILE_SECURITY_HREF}
        className="flex items-center justify-between border-r-4 border-primary bg-primary-container px-6 py-3 text-sm font-semibold text-on-primary-container"
      >
        <div className="flex items-center gap-3">
          <MaterialSymbol
            name="smartphone"
            className="text-xl shrink-0 text-on-primary-container"
            filled
          />
          <span>Mobile Security</span>
        </div>
        <MaterialSymbol
          name="expand_less"
          className="text-base shrink-0 text-on-primary-container"
        />
      </Link>
      <div className="border-r-4 border-primary bg-primary-container/40 py-1 space-y-0.5">
        {MOBILE_SECURITY_NAV.map((leaf) => (
          <MobileNavButton key={leaf.id} leaf={leaf} currentView={currentView} />
        ))}
      </div>
    </div>
  );
}
