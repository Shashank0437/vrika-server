export type MobileSecurityNavLeaf = {
  id: string;
  label: string;
  icon: string;
  href: string;
  exact?: boolean;
};

export const MOBILE_SECURITY_HREF = "/dashboard/mobile-security";

export const MOBILE_SECURITY_NAV: MobileSecurityNavLeaf[] = [
  { id: "overview", label: "Overview", icon: "dashboard", href: MOBILE_SECURITY_HREF, exact: true },
  { id: "static", label: "Static Analysis", icon: "radar", href: `${MOBILE_SECURITY_HREF}/scans` },
  { id: "dynamic", label: "Dynamic Analysis", icon: "insights", href: `${MOBILE_SECURITY_HREF}/dynamic` },
  { id: "compare", label: "Compare", icon: "compare_arrows", href: `${MOBILE_SECURITY_HREF}/compare` },
];

export function isMobileNavActive(pathname: string, leaf: MobileSecurityNavLeaf): boolean {
  if (leaf.exact) return pathname === leaf.href;
  return pathname === leaf.href || pathname.startsWith(`${leaf.href}/`);
}

export const mobileScanHref = (hash: string) =>
  `${MOBILE_SECURITY_HREF}/scans/${encodeURIComponent(hash)}`;

export const mobileDynamicHref = (hash: string) =>
  `${MOBILE_SECURITY_HREF}/dynamic/${encodeURIComponent(hash)}`;
