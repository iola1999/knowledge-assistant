export function resolveComposerHeading(input: {
  title?: string | null;
  description?: string | null;
}) {
  const title = input.title?.trim() ? input.title.trim() : null;
  const description = input.description?.trim() ? input.description.trim() : null;

  if (!title && !description) {
    return null;
  }

  return {
    title,
    description,
  };
}

const STAGE_COMPOSER_LINE_HEIGHT = 28;
const STAGE_COMPOSER_MAX_HEIGHT = STAGE_COMPOSER_LINE_HEIGHT * 8;

export function resolveComposerStageTextareaSizing(rows?: number | null) {
  const requestedRows = Number.isFinite(rows) ? Math.trunc(rows ?? 1) : 1;
  const minRows = Math.max(1, Math.min(requestedRows, 3));

  return {
    minRows,
    minHeight: STAGE_COMPOSER_LINE_HEIGHT * minRows,
    maxHeight: STAGE_COMPOSER_MAX_HEIGHT,
  };
}

export function resolveComposerSubmitStatus(agentError?: string | null) {
  if (!agentError?.trim()) {
    return null;
  }

  return `消息已保存，但 Agent 处理失败：${agentError}`;
}
