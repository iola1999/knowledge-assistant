export type WorkspaceUserPanelUser = {
  name?: string | null;
  username?: string | null;
};

export type WorkspaceUserPanelAction = {
  key: "account" | "system-management" | "logout";
  href?: string;
  label: string;
};

export function buildWorkspaceUserPanelState({
  sessionUser,
  initialUser,
  canAccessSystemSettings,
}: {
  sessionUser?: WorkspaceUserPanelUser | null;
  initialUser: WorkspaceUserPanelUser;
  canAccessSystemSettings: boolean;
}) {
  const username =
    pickNonEmptyText(sessionUser?.username, initialUser.username) ?? "user";
  const displayName =
    pickNonEmptyText(sessionUser?.name, initialUser.name, username) ?? username;

  const actions: WorkspaceUserPanelAction[] = [
    {
      key: "account",
      href: "/account",
      label: "账号与安全",
    },
  ];

  if (canAccessSystemSettings) {
    actions.push({
      key: "system-management",
      href: "/admin/models",
      label: "系统管理",
    });
  }

  actions.push({
    key: "logout",
    label: "退出登录",
  });

  const accountActions = actions.filter((action) => action.key === "account");
  const adminActions = actions.filter(
    (action) => action.key === "system-management",
  );
  const logoutAction = actions.find((action) => action.key === "logout") ?? null;

  return {
    username,
    displayName,
    avatarLabel: resolveWorkspaceUserAvatarLabel(displayName),
    actions,
    accountActions,
    adminActions,
    logoutAction,
  };
}

export function resolveWorkspaceUserAvatarLabel(value: string) {
  const firstCharacter = Array.from(value.trim())[0] ?? "?";
  return firstCharacter.toUpperCase();
}

function pickNonEmptyText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) {
      return normalized;
    }
  }

  return null;
}
