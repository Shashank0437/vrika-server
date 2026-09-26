"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";

const SETTINGS_HREF = "/dashboard/settings";

const SETTINGS_SUBNAV = [
  {
    id: "branding",
    href: "/dashboard/settings?tab=branding",
    label: "Branding",
    icon: "palette",
  },
  {
    id: "llm",
    href: "/dashboard/settings?tab=llm",
    label: "LLM Configuration",
    icon: "neurology",
  },
  {
    id: "sso",
    href: "/dashboard/settings?tab=sso",
    label: "Single Sign-On (SSO)",
    icon: "key",
  },
  {
    id: "smtp",
    href: "/dashboard/settings?tab=smtp",
    label: "SMTP Email",
    icon: "mail",
  },
];

export function SettingsSidebarSection() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const settingsActive = pathname.startsWith(SETTINGS_HREF);
  const rawTab = searchParams.get("tab");
  const currentTab =
    rawTab === "llm"
      ? "llm"
      : rawTab === "sso"
        ? "sso"
        : rawTab === "smtp"
          ? "smtp"
          : "branding";

  if (!settingsActive) {
    return (
      <Link
        href={SETTINGS_HREF}
        className="flex items-center justify-between px-6 py-3 text-sm text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
      >
        <div className="flex items-center gap-3">
          <MaterialSymbol
            name="settings"
            className="text-xl shrink-0 text-on-surface-variant"
            filled
          />
          <span>Settings</span>
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
        href={SETTINGS_HREF}
        className="flex items-center justify-between border-r-4 border-primary bg-primary-container px-6 py-3 text-sm font-semibold text-on-primary-container transition-colors"
      >
        <div className="flex items-center gap-3">
          <MaterialSymbol
            name="settings"
            className="text-xl shrink-0 text-on-primary-container"
            filled
          />
          <span>Settings</span>
        </div>
        <MaterialSymbol
          name="expand_less"
          className="text-base shrink-0 text-on-primary-container"
        />
      </Link>
      <div className="border-r-4 border-primary bg-primary-container/40 py-1 space-y-0.5">
        {SETTINGS_SUBNAV.map((sub) => {
          const isSubActive = currentTab === sub.id;
          return (
            <Link
              key={sub.id}
              href={sub.href}
              className={
                isSubActive
                  ? "flex w-full items-center gap-2.5 py-2.5 pl-10 pr-6 text-xs font-semibold text-on-primary-container transition-colors bg-primary-container/60"
                  : "flex w-full items-center gap-2.5 py-2.5 pl-10 pr-6 text-xs text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
              }
            >
              <MaterialSymbol
                name={sub.icon}
                className={`text-base shrink-0 ${
                  isSubActive ? "text-on-primary-container" : "text-on-surface-variant"
                }`}
                filled
              />
              <span>{sub.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
