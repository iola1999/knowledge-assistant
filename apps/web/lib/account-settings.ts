export type AccountSettingsSectionId = "profile" | "security";

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
