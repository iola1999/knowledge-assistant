import { RUN_STATUS } from "@anchordesk/contracts";

import {
  canForceReparseDocumentJob,
  canRetryDocumentJob,
  describeDocumentJobFailure,
} from "@/lib/api/document-jobs";
import { RetryDocumentJobButton } from "@/components/workspaces/retry-document-job-button";
import { ManualRefreshButton } from "@/components/workspaces/manual-refresh-button";

export function DocumentJobPanel({
  job,
  showForceReparse = false,
}: {
  job: {
    id: string;
    stage: string;
    status: string;
    progress: number;
    errorCode?: string | null;
    errorMessage?: string | null;
    updatedAt: Date;
    startedAt?: Date | null;
    finishedAt?: Date | null;
  } | null;
  showForceReparse?: boolean;
}) {
  if (!job) {
    return null;
  }

  return (
    <div className="grid gap-3 rounded-[18px] border border-app-outline-variant/14 bg-app-surface-low/72 p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[14px] font-semibold text-app-text">处理状态</h3>
        <ManualRefreshButton />
      </div>
      <div className="grid gap-2 text-[12px]">
        <div className="flex items-center justify-between gap-3 text-app-muted-strong">
          <span className="text-app-muted">状态</span>
          <span className="text-right font-medium text-app-text">
            {job.stage} · {job.status} · {job.progress}%
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 text-app-muted-strong">
          <span className="text-app-muted">更新时间</span>
          <span className="text-right">{job.updatedAt.toLocaleString("zh-CN")}</span>
        </div>
        {job.startedAt ? (
          <div className="flex items-center justify-between gap-3 text-app-muted-strong">
            <span className="text-app-muted">开始时间</span>
            <span className="text-right">{job.startedAt.toLocaleString("zh-CN")}</span>
          </div>
        ) : null}
        {job.finishedAt ? (
          <div className="flex items-center justify-between gap-3 text-app-muted-strong">
            <span className="text-app-muted">结束时间</span>
            <span className="text-right">{job.finishedAt.toLocaleString("zh-CN")}</span>
          </div>
        ) : null}

        {job.status === RUN_STATUS.FAILED ? (
          <div className="mt-1 rounded-[16px] border border-red-200/60 bg-red-50/70 p-3 text-red-600/90 shadow-soft">
            <div className="max-h-32 overflow-y-auto pr-2 text-[12px] font-mono leading-relaxed custom-scrollbar">
              {describeDocumentJobFailure({
                stage: job.stage,
                errorCode: job.errorCode,
                errorMessage: job.errorMessage,
              })}
            </div>
          </div>
        ) : null}
      </div>
      {canRetryDocumentJob(job) || (showForceReparse && canForceReparseDocumentJob(job)) ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {canRetryDocumentJob(job) ? <RetryDocumentJobButton jobId={job.id} /> : null}
          {showForceReparse && canForceReparseDocumentJob(job) ? (
            <RetryDocumentJobButton
              forceReparse
              jobId={job.id}
              label="强制重新解析"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
