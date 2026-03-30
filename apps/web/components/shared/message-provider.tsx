"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { messageStyles, type MessageTone } from "@/lib/ui";

type MessageRecord = {
  id: string;
  content: string;
  tone: MessageTone;
  duration: number;
};

type MessageOptions = {
  duration?: number;
};

type MessageInput = MessageOptions & {
  content: string;
  tone?: MessageTone;
};

type MessageApi = {
  show: (input: MessageInput) => string;
  success: (content: string, options?: MessageOptions) => string;
  error: (content: string, options?: MessageOptions) => string;
  info: (content: string, options?: MessageOptions) => string;
  dismiss: (id: string) => void;
};

const MESSAGE_LIMIT = 3;
const MESSAGE_DURATIONS: Record<MessageTone, number> = {
  info: 2800,
  success: 2600,
  error: 4200,
};

const MessageContext = createContext<MessageApi | null>(null);

function createMessageId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `message-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function MessageProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  function dismiss(id: string) {
    setMessages((current) => current.filter((message) => message.id !== id));
  }

  function show({ content, duration, tone = "info" }: MessageInput) {
    const id = createMessageId();
    const nextMessage: MessageRecord = {
      id,
      content,
      tone,
      duration: duration ?? MESSAGE_DURATIONS[tone],
    };

    setMessages((current) => [...current.slice(-(MESSAGE_LIMIT - 1)), nextMessage]);

    return id;
  }

  const value: MessageApi = {
    show,
    dismiss,
    success: (content, options) => show({ content, tone: "success", ...options }),
    error: (content, options) => show({ content, tone: "error", ...options }),
    info: (content, options) => show({ content, tone: "info", ...options }),
  };

  return (
    <MessageContext.Provider value={value}>
      {children}
      {isMounted
        ? createPortal(
            <div
              aria-live="polite"
              className="pointer-events-none fixed inset-x-0 top-4 z-[80] flex justify-center px-4 sm:top-6"
            >
              <div className="grid w-full max-w-[460px] gap-2">
                {messages.map((message) => (
                  <MessageItem key={message.id} message={message} onDismiss={dismiss} />
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </MessageContext.Provider>
  );
}

function MessageItem({
  message,
  onDismiss,
}: {
  message: MessageRecord;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      onDismiss(message.id);
    }, message.duration);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [message.duration, message.id, onDismiss]);

  return (
    <div
      role={message.tone === "error" ? "alert" : "status"}
      className={messageStyles({ tone: message.tone })}
    >
      <span
        aria-hidden="true"
        className={
          message.tone === "success"
            ? "mt-[5px] size-2.5 rounded-full bg-emerald-600"
            : message.tone === "error"
              ? "mt-[5px] size-2.5 rounded-full bg-red-500"
              : "mt-[5px] size-2.5 rounded-full bg-app-accent"
        }
      />
      <p className="min-w-0 flex-1 text-[13px] font-medium leading-5">{message.content}</p>
    </div>
  );
}

export function useMessage() {
  const context = useContext(MessageContext);

  if (!context) {
    throw new Error("useMessage must be used within MessageProvider");
  }

  return context;
}
