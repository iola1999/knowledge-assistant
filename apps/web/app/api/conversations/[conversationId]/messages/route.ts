import { and, desc, eq } from "drizzle-orm";
import {
  buildAssistantFailedMessageState,
  buildInitialStreamingAssistantRunState,
  finalizeStreamingAssistantRunState,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
} from "@anchordesk/contracts";

import {
  conversationAttachments,
  conversations,
  getDb,
  messages,
  resolveSelectedModelProfile,
} from "@anchordesk/db";
import { serializeErrorForLog } from "@anchordesk/logging";
import { enqueueConversationResponse } from "@anchordesk/queue";

import { auth } from "@/auth";
import { buildConversationTitleFromPrompt } from "@/lib/api/conversations";
import { buildRequestLogContext, logger, resolveRequestId } from "@/lib/server/logger";
import { buildConversationPrompt } from "@/lib/api/workspace-prompt";
import { requireOwnedConversation } from "@/lib/guards/resources";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conversation = await requireOwnedConversation(conversationId, userId);
  if (!conversation) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  const db = getDb();
  const items = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt));

  return Response.json({ messages: items.reverse() });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;
  const requestId = resolveRequestId(request);
  const requestLogger = logger.child({
    ...buildRequestLogContext(request, requestId),
    conversationId,
  });
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    requestLogger.warn("unauthorized conversation message request");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conversation = await requireOwnedConversation(conversationId, userId);
  if (!conversation) {
    requestLogger.warn({ userId }, "conversation not found for message request");
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    content?: string;
    draftUploadId?: string;
    modelProfileId?: string;
  };
  const content = String(body.content ?? "").trim();
  const draftUploadId = String(body.draftUploadId ?? "").trim() || null;
  if (!content) {
    requestLogger.warn(
      {
        workspaceId: conversation.workspaceId,
        userId,
        hasDraftUploadId: Boolean(draftUploadId),
      },
      "conversation message request missing content",
    );
    return Response.json({ error: "content is required" }, { status: 400 });
  }

  const db = getDb();
  let selectedModelProfile;
  try {
    selectedModelProfile = await resolveSelectedModelProfile(
      {
        requestedModelProfileId: body.modelProfileId,
        conversationModelProfileId: conversation.modelProfileId,
      },
      db,
    );
  } catch (error) {
    requestLogger.warn(
      {
        workspaceId: conversation.workspaceId,
        userId,
        requestedModelProfileId: body.modelProfileId ?? null,
        conversationModelProfileId: conversation.modelProfileId ?? null,
      },
      "conversation message request rejected due to invalid model profile selection",
    );
    return Response.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : "Invalid model profile selection",
      },
      { status: 400 },
    );
  }

  const [userMessage] = await db
    .insert(messages)
    .values({
      conversationId,
      role: MESSAGE_ROLE.USER,
      status: MESSAGE_STATUS.COMPLETED,
      contentMarkdown: content,
    })
    .returning();

  const existingMessages = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(3);

  if (existingMessages.length <= 1) {
    await db
      .update(conversations)
      .set({
        title: buildConversationTitleFromPrompt(content),
        modelProfileId: selectedModelProfile.id,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId));
  } else if (conversation.modelProfileId !== selectedModelProfile.id) {
    await db
      .update(conversations)
      .set({
        modelProfileId: selectedModelProfile.id,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId));
  }

  const initialRunState = buildInitialStreamingAssistantRunState();

  const [assistantMessage] = await db
    .insert(messages)
    .values({
      conversationId,
      role: MESSAGE_ROLE.ASSISTANT,
      status: MESSAGE_STATUS.STREAMING,
      contentMarkdown: "",
      structuredJson: initialRunState,
    })
    .returning();

  if (draftUploadId) {
    await db
      .update(conversationAttachments)
      .set({
        conversationId,
        draftUploadId: null,
        claimedAt: new Date(),
        expiresAt: null,
      })
      .where(
        and(
          eq(conversationAttachments.workspaceId, conversation.workspaceId),
          eq(conversationAttachments.draftUploadId, draftUploadId),
        ),
      );
  }

  try {
    const queueJob = await enqueueConversationResponse({
      conversationId,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      runId: initialRunState.run_id,
      modelProfileId: selectedModelProfile.id,
      draftUploadId,
      prompt: buildConversationPrompt({
        content,
        workspacePrompt: conversation.workspacePrompt,
      }),
    });

    requestLogger.info(
      {
        workspaceId: conversation.workspaceId,
        userId,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        assistantRunId: initialRunState.run_id,
        queueJobId: queueJob.id ?? null,
        modelProfileId: selectedModelProfile.id,
        contentLength: content.length,
        hasDraftUploadId: Boolean(draftUploadId),
        hasWorkspacePrompt: Boolean(conversation.workspacePrompt),
      },
      "conversation response enqueued",
    );

    return Response.json(
      {
        userMessage,
        assistantMessage,
      },
      { status: 201 },
    );
  } catch (error) {
    const failedAssistantState = buildAssistantFailedMessageState(error);
    const failedAssistantStateWithRun = {
      ...failedAssistantState,
      structuredJson: {
        ...finalizeStreamingAssistantRunState(initialRunState),
        ...failedAssistantState.structuredJson,
      },
    };

    await db
      .update(messages)
      .set(failedAssistantStateWithRun)
      .where(eq(messages.id, assistantMessage.id));

    requestLogger.error(
      {
        workspaceId: conversation.workspaceId,
        userId,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        assistantRunId: initialRunState.run_id,
        modelProfileId: selectedModelProfile.id,
        contentLength: content.length,
        hasDraftUploadId: Boolean(draftUploadId),
        errorMessage: failedAssistantState.structuredJson.agent_error,
        error: serializeErrorForLog(error),
      },
      "failed to enqueue conversation response",
    );

    return Response.json(
      {
        agentError: failedAssistantState.structuredJson.agent_error,
        userMessage,
        assistantMessage: {
          ...assistantMessage,
          ...failedAssistantStateWithRun,
        },
      },
      { status: 201 },
    );
  }
}
