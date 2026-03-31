"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import {
  CONVERSATION_STATUS,
  type ConversationStatus,
} from "@anchordesk/contracts";

import { ChevronDownIcon } from "@/components/icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shared/popover";
import {
  breadcrumbSwitcherTriggerStyles,
  cn,
  menuItemStyles,
  ui,
} from "@/lib/ui";

type ConversationListItem = {
  id: string;
  title: string;
  status: ConversationStatus;
};

type ConversationBreadcrumbSwitcherProps = {
  workspaceId: string;
  currentConversation: {
    id: string;
    title: string;
  };
  conversations: ConversationListItem[];
};

export function ConversationBreadcrumbSwitcher({
  workspaceId,
  currentConversation,
  conversations,
}: ConversationBreadcrumbSwitcherProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const visibleConversations = useMemo(() => {
    const seen = new Set<string>();

    return conversations.filter((conversation) => {
      if (
        conversation.status !== CONVERSATION_STATUS.ACTIVE &&
        conversation.id !== currentConversation.id
      ) {
        return false;
      }

      if (seen.has(conversation.id)) {
        return false;
      }

      seen.add(conversation.id);
      return true;
    });
  }, [conversations, currentConversation.id]);

  return (
    <>
      <span
        key={`${currentConversation.id}-${currentConversation.title}`}
        title={currentConversation.title}
        className="animate-soft-fade hidden min-w-0 max-w-[min(34vw,480px)] truncate font-medium text-app-text min-[720px]:inline-block xl:max-w-[560px]"
      >
        {currentConversation.title}
      </span>

      <Popover
        open={open}
        onOpenChange={setOpen}
        placement="bottom-start"
        sideOffset={8}
        collisionPadding={10}
      >
        <div className="min-w-0 max-w-full overflow-visible min-[720px]:hidden">
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-controls={menuId}
              aria-expanded={open}
              aria-haspopup="menu"
              className={cn(breadcrumbSwitcherTriggerStyles({ open }), "min-w-0")}
            >
              <span
                title={currentConversation.title}
                className="max-w-[min(38vw,168px)] truncate font-medium text-app-text"
              >
                {currentConversation.title}
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
            className="animate-soft-enter z-40 grid w-[min(280px,calc(100vw-20px))] gap-1"
          >
            {visibleConversations.map((conversation) => (
              <Link
                key={conversation.id}
                href={`/workspaces/${workspaceId}?conversationId=${conversation.id}`}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={cn(
                  "flex min-h-10 min-w-0 items-center rounded-xl px-3 text-sm transition-[background-color,color] duration-200 [transition-timing-function:var(--ease-out-quart)]",
                  menuItemStyles({
                    selected: conversation.id === currentConversation.id,
                  }),
                )}
              >
                <span className="block min-w-0 flex-1 truncate">{conversation.title}</span>
              </Link>
            ))}
          </PopoverContent>
        </div>
      </Popover>
    </>
  );
}
