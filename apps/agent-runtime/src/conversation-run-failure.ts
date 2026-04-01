import { and, eq } from "drizzle-orm";

import {
  buildAssistantFailedMessageState,
  buildInitialStreamingAssistantRunState,
  buildRunFailedToolMessageState,
  CONVERSATION_STREAM_EVENT,
  finalizeStreamingAssistantRunState,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
  readStreamingAssistantRunState,
  type MessageStatus,
} from "@anchordesk/contracts";
import { getDb, messages } from "@anchordesk/db";
import { appendConversationStreamEvent } from "@anchordesk/queue";

const db = getDb();

function buildFailedAssistantStateForRun(input: {
  error: unknown;
  runState: Record<string, unknown> | null | undefined;
}) {
  const failedAssistantState = buildAssistantFailedMessageState(input.error);

  return {
    ...failedAssistantState,
    structuredJson: {
      ...finalizeStreamingAssistantRunState(input.runState),
      ...failedAssistantState.structuredJson,
    },
  };
}

function buildRunFailedToolStateForRun(input: {
  error: unknown;
  assistantMessageId: string;
  assistantRunId: string;
}) {
  const failedToolState = buildRunFailedToolMessageState(input.error);

  return {
    ...failedToolState,
    structuredJson: {
      ...failedToolState.structuredJson,
      assistant_message_id: input.assistantMessageId,
      assistant_run_id: input.assistantRunId,
    },
  };
}

function buildToolMessageEvent(input: {
  message: {
    id: string;
    status: MessageStatus;
    contentMarkdown: string;
    createdAt: Date;
    structuredJson?: Record<string, unknown> | null;
  };
}) {
  return {
    type: CONVERSATION_STREAM_EVENT.TOOL_MESSAGE,
    message_id: input.message.id,
    role: MESSAGE_ROLE.TOOL,
    status: input.message.status,
    content_markdown: input.message.contentMarkdown,
    created_at: input.message.createdAt.toISOString(),
    structured: input.message.structuredJson ?? null,
  } as const;
}

export async function failConversationResponseRun(input: {
  conversationId: string;
  assistantMessageId: string;
  runId: string;
  error: unknown;
}) {
  const [assistantMessage] = await db
    .select({
      id: messages.id,
      status: messages.status,
      structuredJson: messages.structuredJson,
    })
    .from(messages)
    .where(
      and(
        eq(messages.id, input.assistantMessageId),
        eq(messages.conversationId, input.conversationId),
      ),
    )
    .limit(1);

  if (!assistantMessage || assistantMessage.status !== MESSAGE_STATUS.STREAMING) {
    return {
      applied: false as const,
      errorMessage: null,
    };
  }

  let currentRunState =
    readStreamingAssistantRunState(
      (assistantMessage.structuredJson as Record<string, unknown> | null | undefined) ?? null,
    ) ??
    buildInitialStreamingAssistantRunState({
      runId: input.runId,
    });

  if (currentRunState.run_id && currentRunState.run_id !== input.runId) {
    return {
      applied: false as const,
      errorMessage: null,
    };
  }

  let failedAssistantState = buildFailedAssistantStateForRun({
    error: input.error,
    runState: currentRunState,
  });
  const failedToolState = buildRunFailedToolStateForRun({
    error: input.error,
    assistantMessageId: input.assistantMessageId,
    assistantRunId: input.runId,
  });

  const [failedToolMessage] = await db
    .insert(messages)
    .values({
      conversationId: input.conversationId,
      role: MESSAGE_ROLE.TOOL,
      ...failedToolState,
    })
    .returning({
      id: messages.id,
      status: messages.status,
      contentMarkdown: messages.contentMarkdown,
      createdAt: messages.createdAt,
      structuredJson: messages.structuredJson,
    });

  await db
    .update(messages)
    .set(failedAssistantState)
    .where(eq(messages.id, input.assistantMessageId));

  if (failedToolMessage) {
    await appendConversationStreamEvent({
      assistantMessageId: input.assistantMessageId,
      runId: input.runId,
      event: buildToolMessageEvent({
        message: {
          id: failedToolMessage.id,
          status: failedToolMessage.status,
          contentMarkdown: failedToolMessage.contentMarkdown,
          createdAt: failedToolMessage.createdAt,
          structuredJson:
            (failedToolMessage.structuredJson as
              | Record<string, unknown>
              | null
              | undefined) ?? null,
        },
      }),
    }).catch(() => null);
  }

  const runFailedEventId = await appendConversationStreamEvent({
    assistantMessageId: input.assistantMessageId,
    runId: input.runId,
    event: {
      type: CONVERSATION_STREAM_EVENT.RUN_FAILED,
      conversation_id: input.conversationId,
      message_id: input.assistantMessageId,
      status: MESSAGE_STATUS.FAILED,
      content_markdown: failedAssistantState.contentMarkdown,
      structured: failedAssistantState.structuredJson,
      citations: [],
      error: failedAssistantState.structuredJson.agent_error,
    },
  }).catch(() => null);

  if (runFailedEventId) {
    currentRunState = finalizeStreamingAssistantRunState(currentRunState, {
      streamEventId: runFailedEventId,
    });
    failedAssistantState = {
      ...failedAssistantState,
      structuredJson: {
        ...(failedAssistantState.structuredJson ?? {}),
        ...currentRunState,
      },
    };
    await db
      .update(messages)
      .set(failedAssistantState)
      .where(eq(messages.id, input.assistantMessageId));
  }

  return {
    applied: true as const,
    errorMessage:
      typeof failedAssistantState.structuredJson.agent_error === "string"
        ? failedAssistantState.structuredJson.agent_error
        : null,
  };
}
