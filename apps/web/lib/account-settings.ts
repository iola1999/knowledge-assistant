export type AccountSettingsSectionId = "profile" | "security";
const DEFAULT_ACCOUNT_SETTINGS_RETURN_HREF = "/workspaces";

export type AccountSettingsNavItem = {
  id: AccountSettingsSectionId;
  label: string;
  icon: "user" | "shield";
};

export type AccountSettingsNavGroup = {
  label: string;
  items: AccountSettingsNavItem[];
};

export function buildAccountSettingsNavGroups(): AccountSettingsNavGroup[] {
  return [
    {
      label: "账户",
      items: [
        {
          id: "profile",
          label: "个人资料",
          icon: "user",
        },
      ],
    },
    {
      label: "安全",
      items: [
        {
          id: "security",
          label: "安全与登录",
          icon: "shield",
        },
      ],
    },
  ];
}

export function resolveDefaultAccountSettingsSectionId(
  groups: AccountSettingsNavGroup[],
) {
  return groups[0]?.items[0]?.id ?? "profile";
}

export function buildAccountSettingsHref(options?: {
  returnTo?: string | null;
}) {
  const returnTo = normalizeAccountSettingsReturnTo(options?.returnTo ?? null);
  if (!returnTo) {
    return "/account";
  }

  return `/account?${new URLSearchParams({ returnTo }).toString()}`;
}

export function resolveAccountSettingsReturnHref(
  returnTo: string | null | undefined,
) {
  return normalizeAccountSettingsReturnTo(returnTo) ?? DEFAULT_ACCOUNT_SETTINGS_RETURN_HREF;
}

export function buildAccountSettingsReturnTo(
  pathname: string,
  search?: URLSearchParams | string | null,
) {
  const normalizedPath = normalizeAccountSettingsReturnTo(pathname);
  if (!normalizedPath) {
    return null;
  }

  const searchString =
    typeof search === "string"
      ? search.replace(/^\?/, "").trim()
      : search?.toString().trim() ?? "";

  if (!searchString) {
    return normalizedPath;
  }

  return `${normalizedPath}?${searchString}`;
}

function normalizeAccountSettingsReturnTo(returnTo: string | null | undefined) {
  const normalized = returnTo?.trim();
  if (!normalized) {
    return null;
  }

  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return null;
  }

  if (normalized === "/account" || normalized.startsWith("/account?")) {
    return null;
  }

  return normalized;
}
