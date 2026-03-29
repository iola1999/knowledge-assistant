import type { ReactNode } from "react";
import { type ConversationStatus } from "@anchordesk/contracts";

import { isSuperAdminUsername } from "@/lib/auth/super-admin";
import {
  WorkspaceShellFrame,
  type WorkspaceShellFrameProps,
} from "@/components/workspaces/workspace-shell-frame";

type WorkspaceListItem = {
  id: string;
  title: string;
};

type ConversationListItem = {
  id: string;
  title: string;
  status: ConversationStatus;
  updatedAt: Date;
};

type WorkspaceShellProps = {
  workspace: WorkspaceListItem;
  workspaces: WorkspaceListItem[];
  conversations: ConversationListItem[];
  activeConversationId?: string;
  activeView?: "chat" | "settings" | "knowledge-base";
  contentScroll?: "shell" | "contained";
  currentUser: {
    name?: string | null;
    username: string;
  };
  breadcrumbs: Array<{ label: string; href?: string }>;
  topActions?: ReactNode;
  children: ReactNode;
};

export function WorkspaceShell({
  currentUser,
  ...props
}: WorkspaceShellProps) {
  const frameProps: WorkspaceShellFrameProps = {
    ...props,
    currentUser,
    canAccessSystemSettings: isSuperAdminUsername(currentUser.username),
  };

  return <WorkspaceShellFrame {...frameProps} />;
}
