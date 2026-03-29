import { RUN_STATUS } from "@anchordesk/contracts";

import { canRetryDocumentJob, describeDocumentJobFailure } from "@/lib/api/document-jobs";
import { RetryDocumentJobButton } from "@/components/workspaces/retry-document-job-button";
import { ManualRefreshButton } from "@/components/workspaces/manual-refresh-button";
import { cn, ui } from "@/lib/ui";

export function DocumentJobPanel({
  job,
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
}) {
  if (!job) {
    return null;
  }

  return (
    <div className="grid gap-4 rounded-2xl border border-app-border/60 bg-white/50 p-4 shadow-sm backdrop-blur-md">
      <div className="flex items-center justify-between pb-1 border-b border-app-border/40">
        <h3 className="text-[14px] font-semibold text-app-text">任务详情</h3>
        <ManualRefreshButton />
      </div>
      <div className="grid gap-2 text-[13px]">
        <div className="flex justify-between items-center text-app-muted-strong">
          <span className="text-app-muted">状态</span>
          <span className="font-medium text-app-text">{job.stage} · {job.status} · {job.progress}%</span>
        </div>
        <div className="flex justify-between items-center text-app-muted-strong">
          <span className="text-app-muted">更新时间</span>
          <span>{job.updatedAt.toLocaleString("zh-CN")}</span>
        </div>
        {job.startedAt ? (
          <div className="flex justify-between items-center text-app-muted-strong">
            <span className="text-app-muted">开始时间</span>
            <span>{job.startedAt.toLocaleString("zh-CN")}</span>
          </div>
        ) : null}
        {job.finishedAt ? (
          <div className="flex justify-between items-center text-app-muted-strong">
            <span className="text-app-muted">结束时间</span>
            <span>{job.finishedAt.toLocaleString("zh-CN")}</span>
          </div>
        ) : null}
        
        {job.status === RUN_STATUS.FAILED ? (
          <div className="mt-2 rounded-xl border border-red-200/60 bg-red-50/50 p-3 text-red-600/90 shadow-sm">
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
      {canRetryDocumentJob(job) ? (
        <div className="pt-2">
           <RetryDocumentJobButton jobId={job.id} />
        </div>
      ) : null}
    </div>
  );
}
