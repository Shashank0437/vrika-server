export {
  normalizeBridgePath,
  isBridgePathForView,
  VRIKA_NAVIGATE_MESSAGE,
  VRIKA_PATHNAME_MESSAGE,
  type VrikaNavigateMessage,
  type VrikaPathnameMessage,
} from "./cloud-security-nav";
import { normalizeBridgePath } from "./cloud-security-nav";

export type MobileSecurityNavLeaf = {
  id: string;
  label: string;
  icon: string;
  mobilePath: string;
  disabled?: boolean;
};

export const MOBILE_SECURITY_VIEW_PARAM = "view";

/** Same wire format as Cloud Security — vrika-mobile-security nav bridge leaves. */
export const MOBILE_SECURITY_NAV: MobileSecurityNavLeaf[] = [
  {
    id: "new-scan",
    label: "New Scan",
    icon: "smartphone",
    mobilePath: "/",
  },
  {
    id: "recent-scans",
    label: "Recent Scans",
    icon: "schedule",
    mobilePath: "/recent_scans/",
  },
  {
    id: "dynamic-analysis",
    label: "Dynamic Analysis",
    icon: "insights",
    mobilePath: "/dynamic_analysis/",
  },
];

const ALLOWED_PATHS = new Set<string>(
  MOBILE_SECURITY_NAV.map((item) => normalizeBridgePath(item.mobilePath)),
);

function resolveAllowedView(normalized: string): string | null {
  if (ALLOWED_PATHS.has(normalized)) {
    return normalized;
  }
  const pathnameOnly = normalized.split("?")[0] ?? normalized;
  const queryIndex = normalized.indexOf("?");
  const query = queryIndex >= 0 ? normalized.slice(queryIndex) : "";
  for (const allowed of ALLOWED_PATHS) {
    const allowedPathname = allowed.split("?")[0] ?? allowed;
    if (allowedPathname === "/") continue;
    if (pathnameOnly === allowedPathname) {
      return `${allowedPathname}${query}`;
    }
    // Nested routes (e.g. /recent_scans/[id]) stay under the leaf.
    if (pathnameOnly.startsWith(`${allowedPathname}/`)) {
      return `${pathnameOnly}${query}`;
    }
  }
  return null;
}

export function defaultMobileSecurityView(): string {
  return "/";
}

export function sanitizeMobileSecurityView(
  view: string | null | undefined,
): string {
  if (!view) return defaultMobileSecurityView();
  const normalized = normalizeBridgePath(view);
  return resolveAllowedView(normalized) ?? defaultMobileSecurityView();
}

export function isMobileSecurityViewActive(
  currentView: string,
  mobilePath: string,
): boolean {
  const current = sanitizeMobileSecurityView(currentView);
  const target = normalizeBridgePath(mobilePath);
  const targetPathname = target.split("?")[0] ?? target;
  if (targetPathname === "/") return current === "/";
  const currentPathname = current.split("?")[0] ?? current;
  return (
    current === target ||
    current.startsWith(`${target}?`) ||
    currentPathname === targetPathname ||
    currentPathname.startsWith(`${targetPathname}/`)
  );
}

export function buildMobileSecurityHref(view: string): string {
  const normalized = sanitizeMobileSecurityView(view);
  const params = new URLSearchParams();
  if (normalized !== "/") {
    params.set(MOBILE_SECURITY_VIEW_PARAM, normalized);
  }
  const query = params.toString();
  return query ? `/dashboard/mobile-security?${query}` : "/dashboard/mobile-security";
}
