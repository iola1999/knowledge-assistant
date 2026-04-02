"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { ArrowLeftIcon } from "@/components/icons";
import { SettingsShellSidebar } from "@/components/shared/settings-shell";
import {
  buildSystemManagementNavItems,
  resolveSystemManagementReturnHref,
  type SystemManagementSectionId,
} from "@/lib/system-management";
import { cn, navItemStyles } from "@/lib/ui";

export function SystemManagementSidebar({
  activeSection,
}: {
  activeSection: SystemManagementSectionId;
}) {
  const searchParams = useSearchParams();
  const returnHref = resolveSystemManagementReturnHref(searchParams.get("returnTo"));
  const navItems = buildSystemManagementNavItems(activeSection, {
    returnTo: searchParams.get("returnTo"),
  });

  return (
    <SettingsShellSidebar>
      <Link
        href={returnHref}
        className="inline-flex items-center gap-1.5 self-start rounded-full px-1.5 py-1 text-[13px] text-app-muted-strong transition hover:bg-white/82 hover:text-app-text"
      >
        <ArrowLeftIcon />
        返回工作台
      </Link>

      <div className="rounded-2xl border border-app-border bg-app-sidebar/50 p-2">
        <nav className="grid gap-0.5" aria-label="系统管理导航">
          {navItems.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "rounded-xl px-2.5 py-2 text-[14px] font-medium transition",
                navItemStyles({ selected: item.selected }),
              )}
              aria-current={item.selected ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </SettingsShellSidebar>
  );
}
