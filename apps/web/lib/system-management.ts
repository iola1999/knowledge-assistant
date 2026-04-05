export type SystemManagementSectionId = "models" | "runtime" | "libraries" | "settings";

export type SystemManagementNavItem = {
  id: SystemManagementSectionId;
  label: string;
  href: string;
  selected: boolean;
};

const DEFAULT_SYSTEM_MANAGEMENT_RETURN_HREF = "/workspaces";

const SYSTEM_MANAGEMENT_NAV_ITEMS = [
  {
    id: "models",
    label: "模型管理",
    href: "/admin/models",
  },
  {
    id: "runtime",
    label: "运行状况",
    href: "/admin/runtime",
  },
  {
    id: "libraries",
    label: "全局资料库",
    href: "/settings/libraries",
  },
  {
    id: "settings",
    label: "系统参数",
    href: "/settings",
  },
] as const satisfies ReadonlyArray<{
  id: SystemManagementSectionId;
  label: string;
  href: string;
}>;

export function buildSystemManagementNavItems(
  activeSection: SystemManagementSectionId,
  options?: {
    returnTo?: string | null;
  },
): SystemManagementNavItem[] {
  return SYSTEM_MANAGEMENT_NAV_ITEMS.map((item) => ({
    ...item,
    href: buildSystemManagementSectionHref(item.id, options),
    selected: item.id === activeSection,
  }));
}

export function buildSystemManagementSectionHref(
  sectionId: SystemManagementSectionId,
  options?: {
    returnTo?: string | null;
  },
) {
  const href =
    SYSTEM_MANAGEMENT_NAV_ITEMS.find((item) => item.id === sectionId)?.href ??
    "/admin/models";
  const returnTo = normalizeSystemManagementReturnTo(options?.returnTo ?? null);

  if (!returnTo) {
    return href;
  }

  const searchParams = new URLSearchParams({
    returnTo,
  });

  return `${href}?${searchParams.toString()}`;
}

export function resolveSystemManagementSection(pathname: string): SystemManagementSectionId {
  if (pathname.startsWith("/admin/runtime")) {
    return "runtime";
  }

  if (pathname.startsWith("/settings/libraries")) {
    return "libraries";
  }

  if (pathname.startsWith("/settings")) {
    return "settings";
  }

  return "models";
}

export function resolveSystemManagementReturnHref(returnTo: string | null | undefined) {
  return normalizeSystemManagementReturnTo(returnTo) ?? DEFAULT_SYSTEM_MANAGEMENT_RETURN_HREF;
}

export function resolveWorkspaceSystemManagementReturnTo(pathname: string) {
  const match = pathname.match(/^\/workspaces\/([^/]+)(?:\/|$)/);
  const workspaceId = match?.[1];

  if (!workspaceId) {
    return null;
  }

  return `/workspaces/${workspaceId}`;
}

function normalizeSystemManagementReturnTo(returnTo: string | null | undefined) {
  const normalized = returnTo?.trim();
  if (!normalized) {
    return null;
  }

  if (!normalized.startsWith("/workspaces")) {
    return null;
  }

  return normalized;
}
