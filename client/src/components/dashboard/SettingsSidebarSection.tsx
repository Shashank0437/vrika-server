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
];

export function SettingsSidebarSection() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const settingsActive = pathname.startsWith(SETTINGS_HREF);
  const currentTab = searchParams.get("tab") === "llm" ? "llm" : "branding";

  if (!settingsActive) {
    return (
      <Link
        href={SETTINGS_HREF}
        className="flex items-center gap-3 px-6 py-3 text-sm text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
      >
        <MaterialSymbol
          name="settings"
          className="text-xl shrink-0 text-on-surface-variant"
          filled
        />
        Settings
      </Link>
    );
  }

  return (
    <div>
      <Link
        href={SETTINGS_HREF}
        className="flex items-center gap-3 border-r-4 border-primary bg-primary-container px-6 py-3 text-sm font-semibold text-on-primary-container transition-colors"
      >
        <MaterialSymbol
          name="settings"
          className="text-xl shrink-0 text-on-primary-container"
          filled
        />
        Settings
      </Link>
      <div className="border-r-4 border-primary bg-primary-container/40 pb-2">
        {SETTINGS_SUBNAV.map((sub) => {
          const isSubActive = currentTab === sub.id;
          return (
            <Link
              key={sub.id}
              href={sub.href}
              className={
                isSubActive
                  ? "flex w-full items-center gap-2 py-2 pl-10 pr-6 text-xs font-semibold text-on-primary-container transition-colors"
                  : "flex w-full items-center gap-2 py-2 pl-10 pr-6 text-xs text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
              }
            >
              <MaterialSymbol
                name={sub.icon}
                className={`text-base shrink-0 ${
                  isSubActive ? "text-on-primary-container" : "text-on-surface-variant"
                }`}
                filled
              />
              {sub.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
