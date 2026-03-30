"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

import { MessageProvider } from "@/components/shared/message-provider";

export function AppSessionProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <MessageProvider>{children}</MessageProvider>
    </SessionProvider>
  );
}
