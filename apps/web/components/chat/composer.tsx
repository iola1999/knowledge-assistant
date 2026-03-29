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
import {
  resolveComposerHeading,
  resolveComposerStageTextareaSizing,
  resolveComposerSubmitStatus,
} from "@/lib/api/composer";
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
  title,
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
  const heading = resolveComposerHeading({ title, description });
  const router = useRouter();
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [attachments, setAttachments] = useState<ComposerAttachment[]>(initialAttachments);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const draftUploadIdRef = useRef<string>(
    typeof crypto !== "undefined" ? crypto.randomUUID() : `${Date.now()}-draft`,
  );
  const pollingJobIdsRef = useRef(new Set<string>());
  const attachmentStatuses = attachments.map((attachment) => attachment.status);
  const firstAttachmentError =
    attachments.find((attachment) => attachment.errorMessage)?.errorMessage ?? null;
  const hasPendingAttachments = !canSubmitWithAttachments(attachmentStatuses);
  const hasNoReadyAttachments =
    attachments.length > 0 && !hasReadyAttachments(attachmentStatuses);
  const showFooterMessages =
    Boolean(helperText && workspaceId) ||
    Boolean(status) ||
    Boolean(firstAttachmentError) ||
    hasPendingAttachments ||
    hasNoReadyAttachments;
  const isStage = variant === "stage";
  const stageTextareaSizing = resolveComposerStageTextareaSizing(rows);

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

  useEffect(() => {
    if (!isStage || !textareaRef.current) {
      return;
    }

    const next = textareaRef.current;

    function syncHeight() {
      next.style.height = "0px";

      const nextHeight = Math.max(
        stageTextareaSizing.minHeight,
        Math.min(next.scrollHeight, stageTextareaSizing.maxHeight),
      );

      next.style.height = `${nextHeight}px`;
      next.style.overflowY =
        next.scrollHeight > stageTextareaSizing.maxHeight ? "auto" : "hidden";
    }

    syncHeight();
    window.addEventListener("resize", syncHeight);

    return () => {
      window.removeEventListener("resize", syncHeight);
    };
  }, [content, isStage, stageTextareaSizing.maxHeight, stageTextareaSizing.minHeight]);

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
    if (hasPendingAttachments) {
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
      setStatus(resolveComposerSubmitStatus(body?.agentError ?? null));
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
        "grid gap-3",
        isStage
          ? "text-left"
          : `${ui.panel} gap-3`,
        className,
      )}
    >
      {heading ? (
        <div className="grid gap-2">
          {heading.title ? <h3>{heading.title}</h3> : null}
          {heading.description ? <p className={ui.muted}>{heading.description}</p> : null}
        </div>
      ) : null}
      <input
        ref={fileInputRef}
        className="hidden"
        type="file"
        multiple
        accept={SUPPORTED_UPLOAD_ACCEPT}
        onChange={onFileChange}
      />
      {isStage ? (
        <div className="grid gap-3">
          <div className="grid gap-3 rounded-[28px] border border-app-border/80 bg-white/94 px-5 py-4 shadow-soft md:px-6 md:py-5">
            <textarea
              ref={textareaRef}
              required
              rows={stageTextareaSizing.minRows}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={placeholder}
              className={cn(
                "w-full resize-none bg-transparent px-0 py-0 text-[15px] leading-7 text-app-text outline-none placeholder:text-app-muted md:text-[16px]",
                textareaClassName,
              )}
            />
            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="flex min-h-10 items-center gap-2">
                {workspaceId ? (
                  <button
                    type="button"
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-2xl text-app-muted-strong transition hover:bg-app-surface-soft hover:text-app-text md:size-10"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="上传临时文件"
                  >
                    <svg viewBox="0 0 20 20" fill="none" className="size-5" aria-hidden="true">
                      <path
                        d="M10 4.5v11M4.5 10h11"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                ) : (
                  <div className="size-9 shrink-0 md:size-10" aria-hidden="true" />
                )}
              </div>
              <button
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-app-primary text-app-primary-contrast transition hover:bg-[#25211c] disabled:cursor-not-allowed disabled:opacity-55 md:size-11"
                disabled={isPending || hasPendingAttachments}
                type="submit"
                aria-label={submitLabel}
              >
                <svg viewBox="0 0 20 20" fill="none" className="size-5" aria-hidden="true">
                  <path
                    d="M10 4.167v11.666m0-11.666 4.166 4.166M10 4.167 5.833 8.333"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>

          {attachments.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 px-1">
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
                      "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px]",
                      tone,
                    )}
                  >
                    <span className="max-w-[180px] truncate">{attachment.sourceFilename}</span>
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
      ) : (
        <>
          <textarea
            ref={textareaRef}
            required
            rows={rows ?? 4}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={placeholder}
            className={cn(ui.textarea, "min-h-[120px]", textareaClassName)}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-3">
              {workspaceId ? (
                <div className="flex flex-wrap items-center gap-3">
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
            </div>
            <button
              className={buttonStyles()}
              disabled={
                isPending || hasPendingAttachments
              }
              type="submit"
            >
              {isPending ? "刷新中..." : submitLabel}
            </button>
          </div>
        </>
      )}
      {showFooterMessages ? (
        <div className="grid gap-1">
          {helperText && workspaceId ? (
            <p className={cn(ui.muted, "text-[13px]")}>{helperText}</p>
          ) : null}
          {status ? <p className={cn(ui.muted, "text-[13px]")}>{status}</p> : null}
          {firstAttachmentError ? (
            <p className={cn(ui.muted, "text-[13px] text-rose-700")}>{firstAttachmentError}</p>
          ) : null}
          {hasPendingAttachments ? (
            <p className={cn(ui.muted, "text-[13px]")}>
              附件仍在解析中，发送按钮会在全部完成或失败后可用。
            </p>
          ) : null}
          {hasNoReadyAttachments ? (
            <p className={cn(ui.muted, "text-[13px]")}>
              当前没有可用附件，失败的文件不会被送给助手。
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
