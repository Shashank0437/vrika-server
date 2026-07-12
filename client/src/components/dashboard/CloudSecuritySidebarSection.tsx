"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";
import {
  buildCloudSecurityHref,
  CLOUD_SECURITY_NAV,
  CLOUD_SECURITY_VIEW_PARAM,
  isCloudSecurityViewActive,
  sanitizeCloudSecurityView,
  type CloudSecurityNavItem,
  type CloudSecurityNavLeaf,
} from "@/lib/cloud-security-nav";

const CLOUD_SECURITY_HREF = "/dashboard/cloud-security";

function SubNavButton({
  leaf,
  currentView,
  depth = 0,
}: {
  leaf: CloudSecurityNavLeaf;
  currentView: string;
  depth?: number;
}) {
  const router = useRouter();
  const active = isCloudSecurityViewActive(currentView, leaf.prowlerPath);

  return (
    <button
      type="button"
      disabled={leaf.disabled}
      onClick={() => {
        if (leaf.disabled) return;
        router.push(buildCloudSecurityHref(leaf.prowlerPath), { scroll: false });
      }}
      className={
        active
          ? `flex w-full items-center gap-2 py-2 text-xs font-semibold text-on-primary-container transition-colors ${depth > 0 ? "pl-12 pr-6" : "pl-10 pr-6"}`
          : `flex w-full items-center gap-2 py-2 text-xs text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-50 ${depth > 0 ? "pl-12 pr-6" : "pl-10 pr-6"}`
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

function NavGroup({
  item,
  currentView,
  expanded,
}: {
  item: Extract<CloudSecurityNavItem, { type: "group" }>;
  currentView: string;
  expanded: boolean;
}) {
  const [open, setOpen] = useState(expanded);
  const groupActive = item.children.some((child) =>
    isCloudSecurityViewActive(currentView, child.prowlerPath),
  );

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={
          groupActive
            ? "flex w-full items-center gap-2 py-2 pl-10 pr-6 text-xs font-semibold text-on-primary-container transition-colors"
            : "flex w-full items-center gap-2 py-2 pl-10 pr-6 text-xs text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
        }
      >
        <MaterialSymbol
          name={item.icon}
          className={`text-base shrink-0 ${groupActive ? "text-on-primary-container" : "text-on-surface-variant"}`}
          filled
        />
        <span className="flex-1 text-left">{item.label}</span>
        <MaterialSymbol
          name={open ? "expand_less" : "expand_more"}
          className="text-base shrink-0"
        />
      </button>
      {open &&
        item.children.map((child) => (
          <SubNavButton
            key={child.id}
            leaf={child}
            currentView={currentView}
            depth={1}
          />
        ))}
    </div>
  );
}

export function CloudSecuritySidebarSection() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const cloudSecurityActive = pathname.startsWith(CLOUD_SECURITY_HREF);
  const currentView = sanitizeCloudSecurityView(
    searchParams.get(CLOUD_SECURITY_VIEW_PARAM),
  );

  const configurationExpanded = useMemo(
    () =>
      CLOUD_SECURITY_NAV.some(
        (item) =>
          item.type === "group" &&
          item.children.some((child) =>
            isCloudSecurityViewActive(currentView, child.prowlerPath),
          ),
      ),
    [currentView],
  );

  if (!cloudSecurityActive) {
    return (
      <Link
        href={CLOUD_SECURITY_HREF}
        className="flex items-center gap-3 px-6 py-3 text-sm text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
      >
        <MaterialSymbol
          name="cloud"
          className="text-xl shrink-0 text-on-surface-variant"
          filled
        />
        Cloud Security
      </Link>
    );
  }

  return (
    <div>
      <Link
        href={CLOUD_SECURITY_HREF}
        className="flex items-center gap-3 border-r-4 border-primary bg-primary-container px-6 py-3 text-sm font-semibold text-on-primary-container transition-colors"
      >
        <MaterialSymbol
          name="cloud"
          className="text-xl shrink-0 text-on-primary-container"
          filled
        />
        Cloud Security
      </Link>
      <div className="border-r-4 border-primary bg-primary-container/40 pb-2">
        {CLOUD_SECURITY_NAV.map((item) =>
          item.type === "leaf" ? (
            <SubNavButton key={item.id} leaf={item} currentView={currentView} />
          ) : (
            <NavGroup
              key={item.id}
              item={item}
              currentView={currentView}
              expanded={configurationExpanded}
            />
          ),
        )}
      </div>
    </div>
  );
}
