import {
  MESSAGE_STATUS,
  TIMELINE_EVENT,
  isStreamingAssistantRunExpired,
  type MessageStatus,
} from "@anchordesk/contracts";

export const STALE_STREAMING_ASSISTANT_ERROR =
  "Agent Runtime 已停止响应，当前回答未完成。请修复服务后重新生成。";

export type ExpirableAssistantMessage = {
  status: MessageStatus | string;
  createdAt: Date | string;
  structuredJson?: Record<string, unknown> | null;
};

export function shouldExpireStreamingAssistantMessage(
  message: ExpirableAssistantMessage,
  now: Date = new Date(),
) {
  if (message.status !== MESSAGE_STATUS.STREAMING) {
    return false;
  }

  return isStreamingAssistantRunExpired({
    structuredJson: message.structuredJson ?? null,
    createdAt: message.createdAt,
    now,
  });
}

export function buildExpiredAssistantRunPayload(
  errorMessage: string = STALE_STREAMING_ASSISTANT_ERROR,
) {
  return {
    assistant: {
      status: MESSAGE_STATUS.FAILED,
      contentMarkdown: `Agent 处理失败：${errorMessage}`,
      structuredJson: {
        agent_error: errorMessage,
      },
    },
    tool: {
      status: MESSAGE_STATUS.FAILED,
      contentMarkdown: `运行失败：${errorMessage}`,
      structuredJson: {
        timeline_event: TIMELINE_EVENT.RUN_FAILED,
        error: errorMessage,
      },
    },
  };
}
