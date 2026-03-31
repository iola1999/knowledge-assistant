"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import {
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  PlusIcon,
  StopIcon,
} from "@/components/icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shared/popover";
import {
  COMPOSER_ATTACHMENT_STATUS,
  canSubmitWithAttachments,
  hasReadyAttachments,
  resolveComposerAttachmentStatus,
  type ComposerAttachmentStatus,
} from "@/lib/api/conversation-attachments";
import {
  buildComposerSubmittedTurn,
  COMPOSER_ENTER_ACTION,
  COMPOSER_PRIMARY_ACTION,
  resolveComposerEnterKeyAction,
  resolveComposerHeading,
  resolveComposerPrimaryAction,
  resolveComposerStageTextareaSizing,
  resolveComposerSubmitStatus,
} from "@/lib/api/composer";
import { computeFileSha256 } from "@/lib/api/file-digests";
import {
  formatUserFacingModelProfileLabel,
  type EnabledModelProfileOption,
} from "@/lib/api/model-profiles";
import { SUPPORTED_UPLOAD_ACCEPT } from "@/lib/api/upload-policy";
import { conversationDensityClassNames } from "@/lib/conversation-density";
import { buttonStyles, cn, menuItemStyles, ui } from "@/lib/ui";
import type { ConversationChatMessage } from "@/lib/api/conversation-session";

export type ComposerAttachment = {
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

export type ComposerSubmittedTurn = {
  assistantMessage: ConversationChatMessage;
  attachments: ComposerAttachment[];
  conversationId: string;
  modelProfileId: string | null;
  userMessage: ConversationChatMessage;
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
  availableModelProfiles?: EnabledModelProfileOption[];
  selectedModelProfileId?: string | null;
  initialAttachments?: ComposerAttachment[];
  isStreaming?: boolean;
  onStop?: () => Promise<void> | void;
  onSelectedModelProfileIdChange?: (modelProfileId: string) => void;
  onSubmitted?: (turn: ComposerSubmittedTurn) => void;
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

function ModelProfileSelector({
  availableModelProfiles,
  currentModelProfileId,
  className,
  onChange,
}: {
  availableModelProfiles: EnabledModelProfileOption[];
  currentModelProfileId: string | null;
  className?: string;
  onChange?: (modelProfileId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const selectedProfile =
    availableModelProfiles.find((profile) => profile.id === currentModelProfileId) ??
    availableModelProfiles[0] ??
    null;

  if (!selectedProfile) {
    return null;
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="top-start"
      sideOffset={10}
      collisionPadding={12}
    >
      <div className={cn("min-w-0 max-w-full overflow-visible", className)}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-controls={menuId}
            aria-expanded={open}
            aria-haspopup="menu"
            className={cn(
              "inline-flex h-9 min-w-0 max-w-full items-center gap-2 rounded-full border border-app-border/90 bg-app-surface-soft/92 pl-2.5 pr-3 text-[13px] font-medium text-app-muted-strong transition-[background-color,border-color,color,transform,box-shadow] duration-200 [transition-timing-function:var(--ease-out-quart)] hover:-translate-y-px hover:border-app-border-strong hover:bg-white hover:text-app-text focus:outline-none focus:ring-4 focus:ring-app-accent/10",
              open && "border-app-border-strong bg-white text-app-text shadow-sm",
            )}
          >
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-app-surface-strong text-app-accent">
              <span className="size-1.5 rounded-full bg-current" />
            </span>
            <span className="truncate">
              {formatUserFacingModelProfileLabel(selectedProfile)}
            </span>
            <ChevronDownIcon
              className={cn(
                "size-3.5 shrink-0 text-app-muted transition-transform duration-200 [transition-timing-function:var(--ease-out-quart)]",
                open && "rotate-180 text-app-text",
              )}
              aria-hidden="true"
            />
          </button>
        </PopoverTrigger>

        <PopoverContent
          id={menuId}
          role="menu"
          aria-label="选择当前会话模型"
          className="animate-soft-enter z-40 w-[min(320px,calc(100vw-24px))] overflow-hidden"
        >
          <div className="px-3 pb-1 pt-2.5">
            <p className={ui.eyebrow}>Model</p>
            <h2 className="mt-1 text-[15px] font-semibold text-app-text">选择模型</h2>
          </div>

          <div className="mx-2 my-1.5 h-px bg-app-border/70" />

          <div className="grid gap-1 pb-0.5 pt-0.5">
            {availableModelProfiles.map((profile) => {
              const isSelected = profile.id === selectedProfile.id;

              return (
                <button
                  key={profile.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isSelected}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition",
                    menuItemStyles({ selected: isSelected }),
                  )}
                  onClick={() => {
                    if (!isSelected) {
                      onChange?.(profile.id);
                    }
                    setOpen(false);
                  }}
                >
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full border transition",
                      isSelected
                        ? "border-app-border-strong bg-app-surface-strong text-app-text"
                        : "border-app-border/80 bg-white text-app-muted",
                    )}
                  >
                    {isSelected ? (
                      <CheckIcon
                        className="size-[15px]"
                        strokeWidth={1.9}
                        aria-hidden="true"
                      />
                    ) : (
                      <span className="size-1.5 rounded-full bg-current/50" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                    {formatUserFacingModelProfileLabel(profile)}
                  </span>
                  {profile.isDefault ? (
                    <span className={cn(ui.chip, "shrink-0")}>默认</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </div>
    </Popover>
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
  availableModelProfiles = [],
  selectedModelProfileId,
  initialAttachments = [],
  isStreaming = false,
  onStop,
  onSelectedModelProfileIdChange,
  onSubmitted,
}: ComposerProps) {
  const heading = resolveComposerHeading({ title, description });
  const router = useRouter();
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isStopping, setIsStopping] = useState(false);
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
  const isStage = variant === "stage";
  const showFooterMessages =
    !isStage &&
    (Boolean(helperText && workspaceId) ||
      Boolean(status) ||
      Boolean(firstAttachmentError) ||
      hasPendingAttachments ||
      hasNoReadyAttachments);
  const stageTextareaSizing = resolveComposerStageTextareaSizing(rows);
  const canStopStreaming = isStreaming && typeof onStop === "function";
  const currentModelProfileId =
    selectedModelProfileId ?? availableModelProfiles[0]?.id ?? null;
  const hasModelSelector =
    availableModelProfiles.length > 0 && currentModelProfileId !== null;
  const primaryAction = resolveComposerPrimaryAction({
    content,
    hasPendingAttachments,
    isStreaming: canStopStreaming,
  });
  const isSubmitDisabled = isPending || primaryAction.disabled;
  const isPrimaryActionDisabled = canStopStreaming ? isStopping : isSubmitDisabled;
  const stageActionButtonBase =
    "inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:border-app-border disabled:bg-app-surface-strong/72 disabled:text-app-muted disabled:shadow-none";

  useEffect(() => {
    setAttachments((current) => mergeAttachments(current, initialAttachments));
  }, [initialAttachments]);

  useEffect(() => {
    for (const attachment of attachments) {
      if (
        !attachment.documentJobId ||
        attachment.status !== COMPOSER_ATTACHMENT_STATUS.PARSING ||
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
                  status: COMPOSER_ATTACHMENT_STATUS.FAILED,
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

      if (
        nextStatus === COMPOSER_ATTACHMENT_STATUS.READY ||
        nextStatus === COMPOSER_ATTACHMENT_STATUS.FAILED
      ) {
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
          status: COMPOSER_ATTACHMENT_STATUS.PRESIGNING,
          progress: 0,
          stage: "计算指纹",
          errorMessage: null,
        },
      ]),
    );

    const sha256 = await computeFileSha256(file).catch((error: unknown) => {
      setAttachments((current) =>
        current.map((attachment) =>
          attachment.id === localId
            ? {
                ...attachment,
                status: COMPOSER_ATTACHMENT_STATUS.FAILED,
                errorMessage: error instanceof Error ? error.message : "计算文件指纹失败。",
              }
            : attachment,
        ),
      );
      return null;
    });
    if (!sha256) {
      return;
    }

    const presignResponse = await fetch(`/api/workspaces/${workspaceId}/attachments/presign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        sha256,
      }),
    });
    const presignBody = (await presignResponse.json().catch(() => null)) as
      | {
          uploadUrl?: string | null;
          key?: string;
          alreadyExists?: boolean;
          error?: string;
        }
      | null;

    if (!presignResponse.ok || !presignBody?.key) {
      setAttachments((current) =>
        current.map((attachment) =>
          attachment.id === localId
            ? {
                ...attachment,
                status: COMPOSER_ATTACHMENT_STATUS.FAILED,
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
              status: COMPOSER_ATTACHMENT_STATUS.UPLOADING,
              stage: presignBody.alreadyExists ? "复用已有文件" : "上传中",
            }
          : attachment,
      ),
    );

    if (!presignBody.alreadyExists) {
      if (!presignBody.uploadUrl) {
        setAttachments((current) =>
          current.map((attachment) =>
            attachment.id === localId
              ? {
                  ...attachment,
                  status: COMPOSER_ATTACHMENT_STATUS.FAILED,
                  errorMessage: "申请上传地址失败。",
                }
              : attachment,
          ),
        );
        return;
      }

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
                  status: COMPOSER_ATTACHMENT_STATUS.FAILED,
                  errorMessage: `上传文件失败：${uploadResponse.status}`,
                }
              : attachment,
          ),
        );
        return;
      }
    }

    setAttachments((current) =>
      current.map((attachment) =>
        attachment.id === localId
          ? {
              ...attachment,
              status: COMPOSER_ATTACHMENT_STATUS.CREATING,
              stage: "登记中",
            }
          : attachment,
      ),
    );

    const attachmentResponse = await fetch(`/api/workspaces/${workspaceId}/attachments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        storageKey: presignBody.key,
        sha256,
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
                status: COMPOSER_ATTACHMENT_STATUS.FAILED,
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
    if (canStopStreaming) {
      return;
    }

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
        body: JSON.stringify({
          modelProfileId: currentModelProfileId ?? undefined,
        }),
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
        modelProfileId: currentModelProfileId ?? undefined,
        draftUploadId:
          !conversationId && attachments.length > 0 ? draftUploadIdRef.current : undefined,
      }),
    });

    if (response.ok) {
      const body = (await response.json().catch(() => null)) as
        | {
            agentError?: string;
            assistantMessage?: ConversationChatMessage;
            userMessage?: ConversationChatMessage;
          }
        | null;
      setContent("");
      setStatus(resolveComposerSubmitStatus(body?.agentError ?? null));
      const submittedTurn = buildComposerSubmittedTurn({
        conversationId: targetConversationId,
        userMessage: body?.userMessage ?? null,
        assistantMessage: body?.assistantMessage ?? null,
      });

      if (submittedTurn && onSubmitted) {
        onSubmitted({
          ...submittedTurn,
          attachments,
          modelProfileId: currentModelProfileId ?? null,
        });
      } else {
        startTransition(() => {
          if (!conversationId && workspaceId) {
            router.push(`/workspaces/${workspaceId}?conversationId=${targetConversationId}`);
          }
          router.refresh();
        });
      }
    } else {
      setStatus("发送失败。");
    }
  }

  function onTextareaKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (primaryAction.mode !== COMPOSER_PRIMARY_ACTION.SUBMIT) {
      return;
    }

    const action = resolveComposerEnterKeyAction({
      key: event.key,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      isComposing: event.nativeEvent.isComposing,
      keyCode: event.nativeEvent.keyCode,
    });

    if (action !== COMPOSER_ENTER_ACTION.SUBMIT) {
      return;
    }

    event.preventDefault();

    if (isSubmitDisabled) {
      return;
    }

    event.currentTarget.form?.requestSubmit();
  }

  async function handleStop() {
    if (!onStop || isStopping) {
      return;
    }

    setStatus(null);
    setIsStopping(true);
    try {
      await onStop();
      setStatus("已停止当前生成。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "停止失败。");
    } finally {
      setIsStopping(false);
    }
  }

  function renderModelSelector(className?: string) {
    if (!hasModelSelector || !currentModelProfileId) {
      return null;
    }

    return (
      <ModelProfileSelector
        className={className}
        availableModelProfiles={availableModelProfiles}
        currentModelProfileId={currentModelProfileId}
        onChange={onSelectedModelProfileIdChange}
      />
    );
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
        <div className="grid gap-2.5">
          <div className={conversationDensityClassNames.composerCard}>
            <textarea
              ref={textareaRef}
              required
              rows={stageTextareaSizing.minRows}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={onTextareaKeyDown}
              placeholder={placeholder}
              className={cn(
                conversationDensityClassNames.composerText,
                textareaClassName,
              )}
            />
            <div className="flex items-center justify-between gap-2.5 pt-0.5">
              <div className="flex min-h-9 min-w-0 flex-1 flex-wrap items-center gap-2">
                {workspaceId ? (
                  <button
                    type="button"
                    className={cn(
                      stageActionButtonBase,
                      "border-app-border/90 bg-app-surface-soft text-app-muted-strong hover:border-app-border-strong hover:bg-white hover:text-app-text",
                    )}
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="上传临时文件"
                  >
                    <PlusIcon className="size-5" aria-hidden="true" />
                  </button>
                ) : null}
                {renderModelSelector("min-w-0 max-w-full flex-1")}
              </div>
              <button
                className={cn(
                  stageActionButtonBase,
                  "shadow-sm",
                  canStopStreaming
                    ? "border-transparent bg-app-primary text-app-primary-contrast hover:bg-[#25211c]"
                    : "border-transparent bg-app-primary text-app-primary-contrast hover:bg-[#25211c]",
                )}
                disabled={isPrimaryActionDisabled}
                type={primaryAction.mode === COMPOSER_PRIMARY_ACTION.STOP ? "button" : "submit"}
                aria-label={
                  primaryAction.mode === COMPOSER_PRIMARY_ACTION.STOP
                    ? "停止生成"
                    : submitLabel
                }
                onClick={
                  primaryAction.mode === COMPOSER_PRIMARY_ACTION.STOP
                    ? () => {
                        void handleStop();
                      }
                    : undefined
                }
              >
                {primaryAction.mode === COMPOSER_PRIMARY_ACTION.STOP ? (
                  <StopIcon className="size-[18px]" aria-hidden="true" />
                ) : (
                  <ArrowUpIcon className="size-5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {attachments.length > 0 ? (
            <div className={conversationDensityClassNames.composerAttachments}>
              {attachments.map((attachment) => {
                const tone =
                  attachment.status === COMPOSER_ATTACHMENT_STATUS.READY
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : attachment.status === COMPOSER_ATTACHMENT_STATUS.FAILED
                      ? "border-rose-200 bg-rose-50 text-rose-800"
                      : "border-app-border bg-white/90 text-app-muted-strong";

                const content = (
                  <span
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium",
                      tone,
                    )}
                  >
                    <span className="max-w-[180px] truncate">{attachment.sourceFilename}</span>
                    <span>
                      {attachment.status === COMPOSER_ATTACHMENT_STATUS.READY
                        ? "可用"
                        : attachment.status === COMPOSER_ATTACHMENT_STATUS.FAILED
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
          {renderModelSelector("max-w-[320px]")}
          <textarea
            ref={textareaRef}
            required
            rows={rows ?? 4}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={onTextareaKeyDown}
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
              disabled={isPrimaryActionDisabled}
              type={primaryAction.mode === COMPOSER_PRIMARY_ACTION.STOP ? "button" : "submit"}
              onClick={
                primaryAction.mode === COMPOSER_PRIMARY_ACTION.STOP
                  ? () => {
                      void handleStop();
                    }
                  : undefined
              }
            >
              {primaryAction.mode === COMPOSER_PRIMARY_ACTION.STOP
                ? isStopping
                  ? "停止中..."
                  : "停止"
                : isPending
                  ? "刷新中..."
                  : submitLabel}
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
