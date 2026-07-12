export const VRIKA_NAVIGATE_MESSAGE = "vrika:navigate" as const;
export const VRIKA_PATHNAME_MESSAGE = "vrika:pathname" as const;

export type VrikaNavigateMessage = {
  type: typeof VRIKA_NAVIGATE_MESSAGE;
  path: string;
};

export type VrikaPathnameMessage = {
  type: typeof VRIKA_PATHNAME_MESSAGE;
  path: string;
};

export type CloudSecurityNavLeaf = {
  id: string;
  label: string;
  icon: string;
  prowlerPath: string;
  disabled?: boolean;
};

export type CloudSecurityNavGroup = {
  id: string;
  label: string;
  icon: string;
  children: CloudSecurityNavLeaf[];
};

export type CloudSecurityNavItem =
  | ({ type: "leaf" } & CloudSecurityNavLeaf)
  | ({ type: "group" } & CloudSecurityNavGroup);

export const CLOUD_SECURITY_VIEW_PARAM = "view";

export const CLOUD_SECURITY_NAV: CloudSecurityNavItem[] = [
  {
    type: "leaf",
    id: "overview",
    label: "Overview",
    icon: "dashboard",
    prowlerPath: "/",
  },
  {
    type: "leaf",
    id: "compliance",
    label: "Compliance",
    icon: "verified_user",
    prowlerPath: "/compliance",
  },
  {
    type: "leaf",
    id: "attack-paths",
    label: "Attack Paths",
    icon: "account_tree",
    prowlerPath: "/attack-paths",
  },
  {
    type: "leaf",
    id: "findings",
    label: "Findings",
    icon: "sell",
    prowlerPath: "/findings?filter[muted]=false&filter[status__in]=FAIL",
  },
  {
    type: "leaf",
    id: "scans",
    label: "Scans",
    icon: "schedule",
    prowlerPath: "/scans",
  },
  {
    type: "leaf",
    id: "resources",
    label: "Resources",
    icon: "inventory_2",
    prowlerPath: "/resources",
  },
  {
    type: "group",
    id: "configuration",
    label: "Configuration",
    icon: "settings",
    children: [
      {
        id: "providers",
        label: "Providers",
        icon: "cloud_sync",
        prowlerPath: "/providers",
      },
      {
        id: "alerts",
        label: "Alerts",
        icon: "notifications",
        prowlerPath: "/alerts",
        disabled: true,
      },
      {
        id: "mutelist",
        label: "Mutelist",
        icon: "volume_off",
        prowlerPath: "/mutelist",
      },
      {
        id: "scan-config",
        label: "Scan",
        icon: "tune",
        prowlerPath: "/scans/config",
        disabled: true,
      },
      {
        id: "integrations",
        label: "Integrations",
        icon: "extension",
        prowlerPath: "/integrations",
      },
    ],
  },
];

function normalizeBridgePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed || trimmed === "/") return "/";
  const withoutHash = trimmed.split("#")[0] ?? trimmed;
  return withoutHash.startsWith("/") ? withoutHash : `/${withoutHash}`;
}

const ALLOWED_PATHS = new Set<string>(
  CLOUD_SECURITY_NAV.flatMap((item) =>
    item.type === "leaf"
      ? [normalizeBridgePath(item.prowlerPath)]
      : item.children.map((child) => normalizeBridgePath(child.prowlerPath)),
  ),
);

function resolveAllowedView(normalized: string): string | null {
  if (ALLOWED_PATHS.has(normalized)) {
    return normalized;
  }

  const pathnameOnly = normalized.split("?")[0] ?? normalized;
  for (const allowed of ALLOWED_PATHS) {
    const allowedPathname = allowed.split("?")[0] ?? allowed;
    if (pathnameOnly === allowedPathname && pathnameOnly !== "/") {
      return allowed;
    }
  }

  return null;
}

export function defaultCloudSecurityView(): string {
  return "/";
}

export function sanitizeCloudSecurityView(view: string | null | undefined): string {
  if (!view) return defaultCloudSecurityView();
  const normalized = normalizeBridgePath(view);
  return resolveAllowedView(normalized) ?? defaultCloudSecurityView();
}

export function isCloudSecurityViewActive(
  currentView: string,
  prowlerPath: string,
): boolean {
  const current = sanitizeCloudSecurityView(currentView);
  const target = normalizeBridgePath(prowlerPath);
  if (target === "/") return current === "/";
  return current === target || current.startsWith(`${target}?`);
}

export function buildCloudSecurityHref(view: string): string {
  const normalized = sanitizeCloudSecurityView(view);
  const params = new URLSearchParams();
  if (normalized !== "/") {
    params.set(CLOUD_SECURITY_VIEW_PARAM, normalized);
  }
  const query = params.toString();
  return query ? `/dashboard/cloud-security?${query}` : "/dashboard/cloud-security";
}

export { normalizeBridgePath };
