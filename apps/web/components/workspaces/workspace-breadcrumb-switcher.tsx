"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { ChevronDownIcon } from "@/components/icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shared/popover";
import { breadcrumbSwitcherTriggerStyles, cn, menuItemStyles, ui } from "@/lib/ui";

type WorkspaceListItem = {
  id: string;
  title: string;
};

type WorkspaceBreadcrumbSwitcherProps = {
  workspace: WorkspaceListItem;
  workspaces: WorkspaceListItem[];
  activeView?: "chat" | "settings" | "knowledge-base";
};

export function WorkspaceBreadcrumbSwitcher({
  workspace,
  workspaces,
  activeView = "chat",
}: WorkspaceBreadcrumbSwitcherProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();

  const getWorkspaceHref = (workspaceId: string) =>
    activeView === "settings"
      ? `/workspaces/${workspaceId}/settings`
      : activeView === "knowledge-base"
        ? `/workspaces/${workspaceId}/knowledge-base`
      : `/workspaces/${workspaceId}`;

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="bottom-start"
      sideOffset={8}
      collisionPadding={10}
    >
      <div className="min-w-0 max-w-full overflow-visible">
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-controls={menuId}
            aria-expanded={open}
            aria-haspopup="menu"
            className={cn(breadcrumbSwitcherTriggerStyles({ open }), "min-w-0")}
          >
            <span
              title={workspace.title}
              className="max-w-[min(24vw,116px)] truncate min-[720px]:max-w-[min(16vw,180px)] xl:max-w-[220px]"
            >
              {workspace.title}
            </span>
            <ChevronDownIcon
              className={cn(
                "size-3.5 text-app-muted transition-transform duration-200 [transition-timing-function:var(--ease-out-quart)]",
                open && "rotate-180",
              )}
            />
          </button>
        </PopoverTrigger>

        <PopoverContent
          id={menuId}
          role="menu"
          className="animate-soft-enter z-40 grid w-[min(260px,calc(100vw-20px))] gap-1"
        >
          {workspaces.map((workspaceItem) => (
            <Link
              key={workspaceItem.id}
              href={getWorkspaceHref(workspaceItem.id)}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={cn(
                "flex min-h-10 min-w-0 items-center rounded-xl px-3 text-sm transition hover:bg-app-surface-soft",
                menuItemStyles({ selected: workspaceItem.id === workspace.id }),
              )}
            >
              <span className="block min-w-0 flex-1 truncate">{workspaceItem.title}</span>
            </Link>
          ))}
        </PopoverContent>
      </div>
    </Popover>
  );
}
