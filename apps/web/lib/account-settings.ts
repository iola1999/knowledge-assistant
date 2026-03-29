export type AccountSettingsSectionId = "profile" | "security" | "session";

export type AccountSettingsNavItem = {
  id: AccountSettingsSectionId;
  label: string;
  icon: "user" | "shield" | "logout";
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
    {
      label: "会话",
      items: [
        {
          id: "session",
          label: "当前会话",
          icon: "logout",
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
