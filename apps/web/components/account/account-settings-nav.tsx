"use client";

import {
  type AccountSettingsNavGroup,
  type AccountSettingsSectionId,
} from "@/lib/account-settings";
import { cn } from "@/lib/ui";

type AccountSettingsNavProps = {
  groups: AccountSettingsNavGroup[];
  activeSectionId: AccountSettingsSectionId;
  onSelect: (id: AccountSettingsSectionId) => void;
};

export function AccountSettingsNav({
  groups,
  activeSectionId,
  onSelect,
}: AccountSettingsNavProps) {
  return (
    <nav className="grid gap-4" aria-label="账号设置导航">
      {groups.map((group) => (
        <div key={group.label} className="grid gap-1.5">
          <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-app-muted">
            {group.label}
          </p>
          <div className="grid gap-1">
            {group.items.map((item) => {
              const selected = item.id === activeSectionId;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-[16px] px-2.5 py-2 text-left text-sm transition",
                    selected
                      ? "bg-white text-app-text shadow-soft"
                      : "text-app-muted-strong hover:bg-white/78 hover:text-app-text",
                  )}
                  aria-pressed={selected}
                >
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-[10px] border transition",
                      selected
                        ? "border-app-border-strong bg-app-surface-soft text-app-accent"
                        : "border-transparent bg-white/72 text-app-muted",
                    )}
                  >
                    <AccountSettingsNavIcon icon={item.icon} />
                  </span>
                  <span className="truncate text-[14px] font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function AccountSettingsNavIcon({
  icon,
}: {
  icon: AccountSettingsNavGroup["items"][number]["icon"];
}) {
  if (icon === "shield") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className="size-3.5" stroke="currentColor" strokeWidth="1.7">
        <path
          d="M10 2.75c1.52 1.24 3.3 1.94 5.5 2.2v3.28c0 4.02-2.19 6.88-5.5 9.02C6.69 15.11 4.5 12.25 4.5 8.23V4.95c2.2-.26 3.98-.96 5.5-2.2Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="m7.75 10.1 1.55 1.56 2.95-3.22" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-3.5" stroke="currentColor" strokeWidth="1.7">
      <path
        d="M10 10.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5ZM4.75 16.25a5.25 5.25 0 0 1 10.5 0"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
