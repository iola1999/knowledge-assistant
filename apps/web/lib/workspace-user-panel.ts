export type WorkspaceUserPanelUser = {
  name?: string | null;
  username?: string | null;
};

export type WorkspaceUserPanelAction = {
  key:
    | "account"
    | "global-libraries"
    | "model-management"
    | "system-settings"
    | "logout";
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
      key: "global-libraries",
      href: "/settings/libraries",
      label: "全局资料库",
    });
    actions.push({
      key: "model-management",
      href: "/admin/models",
      label: "模型管理",
    });
    actions.push({
      key: "system-settings",
      href: "/settings",
      label: "系统参数",
    });
  }

  actions.push({
    key: "logout",
    label: "退出登录",
  });

  const accountActions = actions.filter((action) => action.key === "account");
  const adminActions = actions.filter(
    (action) =>
      action.key === "global-libraries" ||
      action.key === "model-management" ||
      action.key === "system-settings",
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
