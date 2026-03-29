"use client";

import { useEffect, useState } from "react";

import {
  resolveDefaultAccountSettingsSectionId,
  type AccountSettingsNavGroup,
  type AccountSettingsSectionId,
} from "@/lib/account-settings";
import { cn } from "@/lib/ui";

type AccountSettingsNavProps = {
  groups: AccountSettingsNavGroup[];
};

export function AccountSettingsNav({ groups }: AccountSettingsNavProps) {
  const defaultSectionId = resolveDefaultAccountSettingsSectionId(groups);
  const [activeSectionId, setActiveSectionId] =
    useState<AccountSettingsSectionId>(defaultSectionId);

  useEffect(() => {
    function syncSectionFromHash() {
      const nextHash = window.location.hash.slice(1) as AccountSettingsSectionId;
      setActiveSectionId(nextHash || defaultSectionId);
    }

    syncSectionFromHash();
    window.addEventListener("hashchange", syncSectionFromHash);

    return () => {
      window.removeEventListener("hashchange", syncSectionFromHash);
    };
  }, [defaultSectionId]);

  return (
    <nav className="grid gap-5" aria-label="账号设置导航">
      {groups.map((group) => (
        <div key={group.label} className="grid gap-2">
          <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-app-muted">
            {group.label}
          </p>
          <div className="grid gap-1">
            {group.items.map((item) => {
              const selected = item.id === activeSectionId;

              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={() => setActiveSectionId(item.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-[18px] px-3 py-2.5 text-sm transition",
                    selected
                      ? "bg-white text-app-text shadow-soft"
                      : "text-app-muted-strong hover:bg-white/78 hover:text-app-text",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-xl border transition",
                      selected
                        ? "border-app-border-strong bg-app-surface-soft text-app-accent"
                        : "border-transparent bg-white/72 text-app-muted",
                    )}
                  >
                    <AccountSettingsNavIcon icon={item.icon} />
                  </span>
                  <span className="truncate text-[15px] font-medium">{item.label}</span>
                </a>
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
      <svg viewBox="0 0 20 20" fill="none" className="size-4" stroke="currentColor" strokeWidth="1.7">
        <path
          d="M10 2.75c1.52 1.24 3.3 1.94 5.5 2.2v3.28c0 4.02-2.19 6.88-5.5 9.02C6.69 15.11 4.5 12.25 4.5 8.23V4.95c2.2-.26 3.98-.96 5.5-2.2Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="m7.75 10.1 1.55 1.56 2.95-3.22" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (icon === "logout") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className="size-4" stroke="currentColor" strokeWidth="1.7">
        <path
          d="M8 4.75H6.75a2 2 0 0 0-2 2v6.5a2 2 0 0 0 2 2H8M11.25 6.5 14.75 10m0 0-3.5 3.5M14.75 10H8.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4" stroke="currentColor" strokeWidth="1.7">
      <path
        d="M10 10.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5ZM4.75 16.25a5.25 5.25 0 0 1 10.5 0"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
