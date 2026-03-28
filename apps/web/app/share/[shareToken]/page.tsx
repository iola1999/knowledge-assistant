import type { Metadata } from "next";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import {
  GROUNDED_ANSWER_CONFIDENCE,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
} from "@knowledge-assistant/contracts";

import {
  citationAnchors,
  conversationShares,
  conversations,
  getDb,
  messageCitations,
  messages,
} from "@knowledge-assistant/db";

import { LinkifiedText } from "@/components/shared/linkified-text";
import {
  describeGroundedAnswerConfidence,
  readGroundedAnswerStatus,
} from "@/lib/api/grounded-answer-status";
import { cn, ui } from "@/lib/ui";

export const metadata: Metadata = {
  title: "共享会话",
  robots: {
    index: false,
    follow: false,
  },
};

function formatSharedRole(role: string) {
  if (role === MESSAGE_ROLE.ASSISTANT) {
    return "AI 助手";
  }

  if (role === MESSAGE_ROLE.USER) {
    return "提问";
  }

  return role;
}

function formatSharedStatus(status: string) {
  if (status === MESSAGE_STATUS.STREAMING) {
    return "生成中";
  }

  if (status === MESSAGE_STATUS.FAILED) {
    return "失败";
  }

  return null;
}

export default async function SharedConversationPage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;
  const db = getDb();

  const rows = await db
    .select({
      conversationId: conversations.id,
      title: conversations.title,
    })
    .from(conversationShares)
    .innerJoin(conversations, eq(conversations.id, conversationShares.conversationId))
    .where(
      and(
        eq(conversationShares.shareToken, shareToken),
        isNull(conversationShares.revokedAt),
      ),
    )
    .limit(1);

  const sharedConversation = rows[0];
  if (!sharedConversation) {
    notFound();
  }

  const thread = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, sharedConversation.conversationId))
    .orderBy(asc(messages.createdAt));

  const chatThread = thread.filter((message) => message.role !== MESSAGE_ROLE.TOOL);
  const citations =
    chatThread.length > 0
      ? await db
          .select({
            id: messageCitations.id,
            messageId: messageCitations.messageId,
            label: messageCitations.label,
          })
          .from(messageCitations)
          .innerJoin(citationAnchors, eq(citationAnchors.id, messageCitations.anchorId))
          .where(
            inArray(
              messageCitations.messageId,
              chatThread.map((message) => message.id),
            ),
          )
          .orderBy(asc(messageCitations.ordinal))
      : [];

  const citationsByMessage = new Map<string, Array<(typeof citations)[number]>>();
  for (const citation of citations) {
    const group = citationsByMessage.get(citation.messageId) ?? [];
    group.push(citation);
    citationsByMessage.set(citation.messageId, group);
  }

  return (
    <main className={cn(ui.pageNarrow, "min-h-screen max-w-[980px] gap-5 py-10")}>
      <div className="grid gap-3">
        <div className="grid gap-2">
          <p className={ui.eyebrow}>Shared Conversation</p>
          <h1 className="max-w-[720px]">{sharedConversation.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full border border-app-border bg-app-surface-soft px-3 py-1 text-[12px] text-app-muted-strong">
            公开只读
          </span>
          <span className="inline-flex items-center rounded-full border border-app-border bg-white px-3 py-1 text-[12px] text-app-muted-strong">
            资料引用不提供跳转
          </span>
        </div>
      </div>

      <section className={cn(ui.panelLarge, "grid gap-4 p-5 md:p-6")}>
        {chatThread.length > 0 ? (
          chatThread.map((message) => {
            const groundedStatus =
              message.role === MESSAGE_ROLE.ASSISTANT
                ? readGroundedAnswerStatus(
                    (message.structuredJson ?? null) as Record<string, unknown> | null,
                  )
                : null;
            const groundedStatusLabel = groundedStatus
              ? describeGroundedAnswerConfidence(groundedStatus)
              : null;
            const messageStatusLabel = formatSharedStatus(message.status);

            return (
              <article
                key={message.id}
                className={cn(
                  "grid max-w-[760px] gap-3 rounded-[24px] border border-app-border px-5 py-5",
                  message.role === MESSAGE_ROLE.USER
                    ? "ml-auto bg-app-surface-strong/80"
                    : "mr-auto bg-white/92",
                )}
              >
                <div className="flex items-center justify-between gap-3 text-[13px]">
                  <strong>{formatSharedRole(message.role)}</strong>
                  {messageStatusLabel ? (
                    <span className="inline-flex items-center rounded-full border border-app-border bg-app-surface-soft px-2.5 py-0.5 text-[12px] text-app-muted-strong">
                      {messageStatusLabel}
                    </span>
                  ) : null}
                </div>

                {groundedStatusLabel ? (
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-3 py-1 text-[12px]",
                        groundedStatus?.unsupportedReason
                          ? "border-amber-300 bg-amber-50 text-amber-800"
                          : groundedStatus?.confidence === GROUNDED_ANSWER_CONFIDENCE.HIGH
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : groundedStatus?.confidence ===
                                GROUNDED_ANSWER_CONFIDENCE.MEDIUM
                              ? "border-sky-300 bg-sky-50 text-sky-800"
                              : "border-stone-300 bg-stone-50 text-stone-700",
                      )}
                    >
                      {groundedStatusLabel}
                    </span>
                  </div>
                ) : null}

                <LinkifiedText
                  text={message.contentMarkdown}
                  className="text-[15px] leading-7 text-app-text"
                />

                {groundedStatus?.unsupportedReason ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {groundedStatus.unsupportedReason}
                  </div>
                ) : null}

                {groundedStatus && groundedStatus.missingInformation.length > 0 ? (
                  <div className="grid gap-2 rounded-2xl border border-app-border bg-app-surface-soft/70 px-4 py-3">
                    <strong className="text-sm">待补充信息</strong>
                    <div className="flex flex-wrap gap-2">
                      {groundedStatus.missingInformation.map((item) => (
                        <span
                          key={item}
                          className="inline-flex items-center rounded-full border border-app-border bg-white px-3 py-1 text-[12px] text-app-muted-strong"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {(citationsByMessage.get(message.id) ?? []).length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {(citationsByMessage.get(message.id) ?? []).map((citation) => (
                      <span
                        key={citation.id}
                        aria-disabled="true"
                        title="公开页不提供资料跳转"
                        className="inline-flex cursor-not-allowed items-center rounded-full border border-app-border bg-app-surface-soft px-3 py-1 text-[13px] text-app-muted-strong"
                      >
                        {citation.label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })
        ) : (
          <p className={ui.muted}>当前会话还没有可分享的消息</p>
        )}
      </section>
    </main>
  );
}
