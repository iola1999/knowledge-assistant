import { RUN_STATUS } from "@anchordesk/contracts";

export function canRetryDocumentJob(input: { status: string }) {
  return input.status === RUN_STATUS.FAILED;
}

export function describeDocumentJobFailure(input: {
  stage: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  const parts = [`失败阶段：${input.stage}`];

  if (input.errorCode) {
    parts.push(input.errorCode);
  }

  if (input.errorMessage) {
    parts.push(input.errorMessage.replace(/[。.]$/, ""));
  }

  return `${parts.join(" · ")}.`;
}
