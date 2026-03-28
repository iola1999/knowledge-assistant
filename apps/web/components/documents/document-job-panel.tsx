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
    <div className={cn(ui.panel, "grid gap-4")}>
      <div className={ui.toolbar}>
        <div className="space-y-1">
          <h3>任务详情</h3>
          <p className={ui.muted}>
            {job.stage} · {job.status} · {job.progress}%
          </p>
        </div>
        <ManualRefreshButton />
      </div>
      <div className="grid gap-2">
        <p className={ui.muted}>更新时间：{job.updatedAt.toLocaleString("zh-CN")}</p>
        {job.startedAt ? (
          <p className={ui.muted}>开始时间：{job.startedAt.toLocaleString("zh-CN")}</p>
        ) : null}
        {job.finishedAt ? (
          <p className={ui.muted}>结束时间：{job.finishedAt.toLocaleString("zh-CN")}</p>
        ) : null}
        {job.status === "failed" ? (
          <p className={ui.error}>
            {describeDocumentJobFailure({
              stage: job.stage,
              errorCode: job.errorCode,
              errorMessage: job.errorMessage,
            })}
          </p>
        ) : null}
      </div>
      {canRetryDocumentJob(job) ? <RetryDocumentJobButton jobId={job.id} /> : null}
    </div>
  );
}
