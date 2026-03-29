"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  canSubmitWithAttachments,
  hasReadyAttachments,
  resolveComposerAttachmentStatus,
  type ComposerAttachmentStatus,
} from "@/lib/api/conversation-attachments";
import { SUPPORTED_UPLOAD_ACCEPT } from "@/lib/api/upload-policy";
import { buttonStyles, cn, ui } from "@/lib/ui";

type ComposerAttachment = {
  id: string;
  attachmentId?: string;
  documentId?: string;
  documentVersionId?: string;
  documentJobId?: string;
  sourceFilename: string;
  status: ComposerAttachmentStatus;
  progress: number;
  stage: string | null;
  errorMessage: string | null;
};

type ComposerProps = {
  conversationId?: string;
  workspaceId?: string;
  title?: string;
  description?: string;
  placeholder?: string;
  submitLabel?: string;
  variant?: "card" | "stage";
  rows?: number;
  helperText?: string;
  className?: string;
  textareaClassName?: string;
  initialAttachments?: ComposerAttachment[];
};

function mergeAttachments(
  current: ComposerAttachment[],
  incoming: ComposerAttachment[],
) {
  const merged = new Map(
    current.map((attachment) => [attachment.attachmentId ?? attachment.id, attachment] as const),
  );

  for (const attachment of incoming) {
    const key = attachment.attachmentId ?? attachment.id;
    merged.set(key, {
      ...merged.get(key),
      ...attachment,
    });
  }

  return Array.from(merged.values()).sort((left, right) =>
    left.sourceFilename.localeCompare(right.sourceFilename, "zh-CN"),
  );
}

export function Composer({
  conversationId,
  workspaceId,
  title = "提问",
  description,
  placeholder = "输入你的问题...",
  submitLabel = "发送",
  variant = "card",
  rows,
  helperText,
  className,
  textareaClassName,
  initialAttachments = [],
}: ComposerProps) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [attachments, setAttachments] = useState<ComposerAttachment[]>(initialAttachments);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const draftUploadIdRef = useRef<string>(
    typeof crypto !== "undefined" ? crypto.randomUUID() : `${Date.now()}-draft`,
  );
  const pollingJobIdsRef = useRef(new Set<string>());

  useEffect(() => {
    setAttachments((current) => mergeAttachments(current, initialAttachments));
  }, [initialAttachments]);

  useEffect(() => {
    for (const attachment of attachments) {
      if (
        !attachment.documentJobId ||
        attachment.status !== "parsing" ||
        pollingJobIdsRef.current.has(attachment.documentJobId)
      ) {
        continue;
      }

      pollingJobIdsRef.current.add(attachment.documentJobId);
      void pollAttachmentJob(attachment.id, attachment.documentJobId);
    }
  }, [attachments]);

  async function pollAttachmentJob(localId: string, jobId: string) {
    while (true) {
      const response = await fetch(`/api/document-jobs/${jobId}`, {
        method: "GET",
      });
      const body = (await response.json().catch(() => null)) as
        | {
            job?: {
              status: string;
              stage: string;
              progress: number;
              errorMessage?: string | null;
            };
          }
        | null;

      if (!response.ok || !body?.job) {
        setAttachments((current) =>
          current.map((attachment) =>
            attachment.id === localId
              ? {
                  ...attachment,
                  status: "failed",
                  errorMessage: "查询附件解析状态失败。",
                }
              : attachment,
          ),
        );
        pollingJobIdsRef.current.delete(jobId);
        return;
      }

      const nextStatus = resolveComposerAttachmentStatus({
        jobStatus: body.job.status,
        parseStage: body.job.stage,
      });
      setAttachments((current) =>
        current.map((attachment) =>
          attachment.id === localId
            ? {
                ...attachment,
                status: nextStatus,
                progress: body.job?.progress ?? attachment.progress,
                stage: body.job?.stage ?? attachment.stage,
                errorMessage: body.job?.errorMessage ?? null,
              }
            : attachment,
        ),
      );

      if (nextStatus === "ready" || nextStatus === "failed") {
        pollingJobIdsRef.current.delete(jobId);
        startTransition(() => {
          router.refresh();
        });
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }

  async function uploadAttachment(file: File) {
    if (!workspaceId) {
      setStatus("缺少工作空间信息，无法上传临时文件。");
      return;
    }

    const localId = typeof crypto !== "undefined" ? crypto.randomUUID() : `${Date.now()}`;
    setAttachments((current) =>
      mergeAttachments(current, [
        {
          id: localId,
          sourceFilename: file.name,
          status: "presigning",
          progress: 0,
          stage: null,
          errorMessage: null,
        },
      ]),
    );

    const presignResponse = await fetch(`/api/workspaces/${workspaceId}/attachments/presign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type || "application/octet-stream",
      }),
    });
    const presignBody = (await presignResponse.json().catch(() => null)) as
      | {
          uploadUrl?: string;
          key?: string;
          error?: string;
        }
      | null;

    if (!presignResponse.ok || !presignBody?.uploadUrl || !presignBody.key) {
      setAttachments((current) =>
        current.map((attachment) =>
          attachment.id === localId
            ? {
                ...attachment,
                status: "failed",
                errorMessage: presignBody?.error ?? "申请上传地址失败。",
              }
            : attachment,
        ),
      );
      return;
    }

    setAttachments((current) =>
      current.map((attachment) =>
        attachment.id === localId
          ? {
              ...attachment,
              status: "uploading",
            }
          : attachment,
      ),
    );

    const uploadResponse = await fetch(presignBody.uploadUrl, {
      method: "PUT",
      headers: {
        "content-type": file.type || "application/octet-stream",
      },
      body: file,
    });

    if (!uploadResponse.ok) {
      setAttachments((current) =>
        current.map((attachment) =>
          attachment.id === localId
            ? {
                ...attachment,
                status: "failed",
                errorMessage: `上传文件失败：${uploadResponse.status}`,
              }
            : attachment,
        ),
      );
      return;
    }

    setAttachments((current) =>
      current.map((attachment) =>
        attachment.id === localId
          ? {
              ...attachment,
              status: "creating",
            }
          : attachment,
      ),
    );

    const attachmentResponse = await fetch(`/api/workspaces/${workspaceId}/attachments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        storageKey: presignBody.key,
        sourceFilename: file.name,
        mimeType: file.type || "application/octet-stream",
        ...(conversationId
          ? { conversationId }
          : { draftUploadId: draftUploadIdRef.current }),
      }),
    });
    const attachmentBody = (await attachmentResponse.json().catch(() => null)) as
      | {
          error?: string;
          attachment?: { id: string };
          document?: { id: string };
          documentVersion?: { id: string };
          documentJob?: {
            id: string;
            status: string;
            stage: string;
            progress: number;
            errorMessage?: string | null;
          };
        }
      | null;

    if (
      !attachmentResponse.ok ||
      !attachmentBody?.attachment?.id ||
      !attachmentBody.document?.id ||
      !attachmentBody.documentVersion?.id ||
      !attachmentBody.documentJob?.id
    ) {
      setAttachments((current) =>
        current.map((attachment) =>
          attachment.id === localId
            ? {
                ...attachment,
                status: "failed",
                errorMessage: attachmentBody?.error ?? "创建临时附件失败。",
              }
            : attachment,
        ),
      );
      return;
    }

    const attachmentId: string = attachmentBody.attachment.id;
    const documentId: string = attachmentBody.document.id;
    const documentVersionId: string = attachmentBody.documentVersion.id;
    const documentJob = attachmentBody.documentJob;
    const documentJobId: string = documentJob.id;
    const nextStatus = resolveComposerAttachmentStatus({
      jobStatus: documentJob.status,
      parseStage: documentJob.stage,
    });

    setAttachments((current) =>
      current.map((attachment): ComposerAttachment =>
        attachment.id === localId
          ? {
              ...attachment,
              id: attachmentId,
              attachmentId,
              documentId,
              documentVersionId,
              documentJobId,
              status: nextStatus,
              progress: documentJob.progress ?? 0,
              stage: documentJob.stage ?? null,
              errorMessage: documentJob.errorMessage ?? null,
            }
          : attachment,
      ),
    );

    startTransition(() => {
      router.refresh();
    });
  }

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) {
      return;
    }

    for (const file of files) {
      await uploadAttachment(file);
    }

    event.target.value = "";
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = content.trim();
    if (!prompt) return;
    if (!canSubmitWithAttachments(attachments.map((attachment) => attachment.status))) {
      setStatus("临时文件仍在解析中，等状态变成可用后再发送。");
      return;
    }

    let targetConversationId = conversationId;
    if (!targetConversationId) {
      if (!workspaceId) {
        setStatus("缺少工作空间信息，无法创建对话。");
        return;
      }

      setStatus("正在创建对话...");
      const createResponse = await fetch(`/api/workspaces/${workspaceId}/conversations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const createBody = (await createResponse.json().catch(() => null)) as
        | { error?: string; conversation?: { id: string } }
        | null;

      targetConversationId = createBody?.conversation?.id;
      if (!createResponse.ok || !targetConversationId) {
        setStatus(createBody?.error ?? "创建对话失败。");
        return;
      }
    }

    setStatus("正在发送...");
    const response = await fetch(`/api/conversations/${targetConversationId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: prompt,
        draftUploadId:
          !conversationId && attachments.length > 0 ? draftUploadIdRef.current : undefined,
      }),
    });

    if (response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { agentError?: string }
        | null;
      setContent("");
      setStatus(
        body?.agentError
          ? `消息已保存，但 Agent 处理失败：${body.agentError}`
          : "消息已提交，正在建立工具时间线...",
      );
      startTransition(() => {
        if (!conversationId && workspaceId) {
          router.push(`/workspaces/${workspaceId}?conversationId=${targetConversationId}`);
        }
        router.refresh();
      });
    } else {
      setStatus("发送失败。");
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        "grid gap-4",
        variant === "stage"
          ? "rounded-[28px] border border-app-border/70 bg-white/82 p-5 shadow-soft backdrop-blur-sm"
          : `${ui.panel} gap-3`,
        className,
      )}
    >
      <div className="grid gap-2">
        <h3>{title}</h3>
        {description ? <p className={ui.muted}>{description}</p> : null}
      </div>
      <textarea
        required
        rows={rows ?? (variant === "stage" ? 6 : 4)}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder}
        className={cn(
          ui.textarea,
          variant === "stage"
            ? "min-h-[176px] rounded-[24px] border-app-border/70 bg-app-surface-soft/65 px-5 py-4 text-[15px] leading-7"
            : "min-h-[120px]",
          textareaClassName,
        )}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-3">
          {workspaceId ? (
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileInputRef}
                className="hidden"
                type="file"
                multiple
                accept={SUPPORTED_UPLOAD_ACCEPT}
                onChange={onFileChange}
              />
              <button
                type="button"
                className={buttonStyles({ variant: "secondary", size: "sm" })}
                onClick={() => fileInputRef.current?.click()}
              >
                上传临时文件
              </button>
              <span className={cn(ui.muted, "text-[13px]")}>
                上传后会自动解析，不进入主资料检索；解析完成后会随当前会话一起提供给助手。
              </span>
            </div>
          ) : (
            <div className={cn(ui.muted, "max-w-[44ch] text-[13px]")}>
              {helperText ?? "消息会写入当前会话，并开始推送工具时间线"}
            </div>
          )}
          {attachments.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {attachments.map((attachment) => {
                const tone =
                  attachment.status === "ready"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : attachment.status === "failed"
                      ? "border-rose-200 bg-rose-50 text-rose-800"
                      : "border-app-border bg-white/90 text-app-muted-strong";

                const content = (
                  <span
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[13px]",
                      tone,
                    )}
                  >
                    <span className="max-w-[220px] truncate">{attachment.sourceFilename}</span>
                    <span>
                      {attachment.status === "ready"
                        ? "可用"
                        : attachment.status === "failed"
                          ? "失败"
                          : `${attachment.stage ?? "解析中"}${attachment.progress > 0 ? ` ${attachment.progress}%` : ""}`}
                    </span>
                  </span>
                );

                return attachment.documentId && workspaceId ? (
                  <Link
                    key={attachment.id}
                    href={`/workspaces/${workspaceId}/documents/${attachment.documentId}`}
                  >
                    {content}
                  </Link>
                ) : (
                  <span key={attachment.id}>{content}</span>
                );
              })}
            </div>
          ) : null}
        </div>
        <button
          className={buttonStyles()}
          disabled={
            isPending || !canSubmitWithAttachments(attachments.map((attachment) => attachment.status))
          }
          type="submit"
        >
          {isPending ? "刷新中..." : submitLabel}
        </button>
      </div>
      <div className="grid gap-1">
        {helperText && workspaceId ? (
          <p className={cn(ui.muted, "text-[13px]")}>{helperText}</p>
        ) : null}
        {status ? <p className={cn(ui.muted, "text-[13px]")}>{status}</p> : null}
        {attachments.some((attachment) => attachment.errorMessage) ? (
          <p className={cn(ui.muted, "text-[13px] text-rose-700")}>
            {attachments.find((attachment) => attachment.errorMessage)?.errorMessage}
          </p>
        ) : null}
        {!canSubmitWithAttachments(attachments.map((attachment) => attachment.status)) ? (
          <p className={cn(ui.muted, "text-[13px]")}>
            附件仍在解析中，发送按钮会在全部完成或失败后可用。
          </p>
        ) : null}
        {attachments.length > 0 && !hasReadyAttachments(attachments.map((attachment) => attachment.status)) ? (
          <p className={cn(ui.muted, "text-[13px]")}>
            当前没有可用附件，失败的文件不会被送给助手。
          </p>
        ) : null}
      </div>
    </form>
  );
}
