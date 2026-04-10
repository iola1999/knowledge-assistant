"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { DndContext, type DragEndEvent, type DragStartEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { flexRender, getCoreRowModel, getSortedRowModel, type SortingState, useReactTable, type ColumnDef, type Row } from "@tanstack/react-table";
import { useDropzone } from "react-dropzone";
import useSWR from "swr";

import { RUN_STATUS } from "@anchordesk/contracts";

import { RetryDocumentJobButton } from "@/components/workspaces/retry-document-job-button";
import { EditorialPageHeader } from "@/components/shared/editorial-page-header";
import { ModalShell } from "@/components/shared/modal-shell";
import {
  createDocumentUploadItems,
  DOCUMENT_UPLOAD_REQUEST_TIMEOUT_MS,
  DOCUMENT_UPLOAD_STEP,
  getDocumentUploadStepLabel,
  getRetryableDocumentUploadItems,
  summarizeDocumentUploadItems,
  type DocumentUploadItem,
  updateDocumentUploadItem,
} from "@/lib/api/document-upload";
import { describeDocumentJobFailure } from "@/lib/api/document-jobs";
import { computeFileSha256 } from "@/lib/api/file-digests";
import { uploadFileWithProgress } from "@/lib/api/upload-file-request";
import {
  SUPPORTED_UPLOAD_ACCEPT,
  SUPPORTED_UPLOAD_TYPES_LABEL,
  collectUnsupportedUploads,
} from "@/lib/api/upload-policy";
import { buttonStyles, cn, inputStyles, ui } from "@/lib/ui";

type DirectoryRecord = {
  id: string;
  parentId: string | null;
  name: string;
  path: string;
  createdAt: string;
  updatedAt: string;
};

type DocumentRecord = {
  id: string;
  title: string;
  sourceFilename: string;
  logicalPath: string;
  directoryPath: string;
  mimeType: string;
  docType: string;
  tags: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
  latestVersion: {
    id: string;
    parseStatus: string;
    fileSizeBytes: number | null;
  } | null;
  latestJob: {
    id: string;
    status: string;
    stage: string;
    progress: number;
    updatedAt: string;
    errorCode?: string | null;
    errorMessage?: string | null;
  } | null;
};

type ExplorerEntry =
  | {
      kind: "directory";
      id: string;
      rowId: string;
      name: string;
      path: string;
      createdAt: string;
      updatedAt: string;
      typeLabel: string;
      sizeLabel: string;
      statusLabel: string;
      searchText: string;
    }
  | {
      kind: "document";
      id: string;
      rowId: string;
      name: string;
      title: string;
      path: string;
      documentPath: string;
      directoryPath: string;
      createdAt: string;
      updatedAt: string;
      typeLabel: string;
      sizeLabel: string;
      statusLabel: string;
      latestJob: DocumentRecord["latestJob"];
      latestVersion: DocumentRecord["latestVersion"];
      searchText: string;
    };

type DragPayload = {
  directoryIds: string[];
  documentIds: string[];
  label: string;
};

type UploadFileIssue = {
  itemId: string;
  file: File;
  code: "image_requires_ocr" | "unsupported_type";
  message: string;
};

type MountedLibraryRecord = {
  id: string;
  title: string;
  description: string | null;
  documentCount: number;
  href: string;
  updatedAt: string;
};

function formatFileSize(value: number | null) {
  if (!value || value <= 0) {
    return "—";
  }

  if (value >= 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (value >= 1024) {
    return `${Math.round(value / 1024)} KB`;
  }

  return `${value} B`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDocumentTypeLabel(document: DocumentRecord) {
  const filename = document.sourceFilename;
  const extension = filename.includes(".") ? filename.split(".").pop() ?? "" : "";
  return extension ? extension.toUpperCase() : document.docType;
}

function getDocumentStatusLabel(document: DocumentRecord) {
  if (
    document.latestJob?.status === RUN_STATUS.QUEUED ||
    document.latestJob?.status === RUN_STATUS.RUNNING
  ) {
    return `${document.latestJob.stage} · ${document.latestJob.progress}%`;
  }

  if (document.latestJob?.status === RUN_STATUS.FAILED) {
    return "处理失败";
  }

  if (document.status === "ready" || document.latestVersion?.parseStatus === "ready") {
    return "已就绪";
  }

  if (document.status === "failed" || document.latestVersion?.parseStatus === "failed") {
    return "处理失败";
  }

  return "处理中";
}

function buildPathHref(
  pathname: string,
  path: string,
  scopeQuery: Record<string, string | undefined> = {},
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(scopeQuery)) {
    if (value) {
      params.set(key, value);
    }
  }
  params.set("path", path);

  return `${pathname}?${params.toString()}`;
}

function readUploadErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function SelectionCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={checked}
      onClick={onChange}
      className={cn(
        "grid size-5 place-items-center rounded-md border transition",
        checked || indeterminate
          ? "border-app-border-strong bg-app-primary text-app-primary-contrast"
          : "border-app-border bg-white hover:border-app-border-strong",
      )}
    >
      <span className="text-[11px] leading-none">
        {indeterminate ? "−" : checked ? "✓" : ""}
      </span>
    </button>
  );
}

function TableRow({
  row,
  documentHrefBase,
  editable,
  onOpenDirectory,
}: {
  row: Row<ExplorerEntry>;
  documentHrefBase?: string | null;
  editable: boolean;
  onOpenDirectory: (path: string) => void;
}) {
  const entry = row.original;
  const droppable = useDroppable({
    id: `directory:${entry.id}`,
    data:
      entry.kind === "directory"
        ? { directoryId: entry.id, directoryPath: entry.path }
        : undefined,
    disabled: !editable || entry.kind !== "directory",
  });
  const draggable = useDraggable({
    id: `entry:${entry.rowId}`,
    data: { entry },
    disabled: !editable,
  });

  return (
    <tr
      ref={droppable.setNodeRef}
      className={cn(
        "border-b border-app-border/45 transition last:border-b-0",
        row.getIsSelected() ? "bg-app-surface-soft/78" : "bg-app-surface-lowest/84",
        droppable.isOver && entry.kind === "directory" && "bg-app-surface-strong/45",
      )}
    >
      {row.getVisibleCells().map((cell) => {
        if (cell.column.id === "name") {
          return (
            <td key={cell.id} className="px-4 py-3 align-middle">
              <div className="flex items-start gap-3">
                <button
                  ref={draggable.setNodeRef}
                  type="button"
                  disabled={!editable}
                  className={cn(
                    buttonStyles({ variant: "ghost", size: "sm", shape: "icon" }),
                    "mt-0.5 size-8 shrink-0 rounded-xl border border-transparent text-app-muted-strong hover:border-app-border hover:bg-app-surface-soft",
                    draggable.isDragging && "opacity-40",
                    !editable && "cursor-default opacity-30 hover:border-transparent hover:bg-transparent",
                  )}
                  {...(editable ? draggable.attributes : {})}
                  {...(editable ? draggable.listeners : {})}
                >
                  ⋮⋮
                </button>
                <div className="grid min-w-0 gap-1">
                  {entry.kind === "directory" ? (
                    <button
                      type="button"
                      onClick={() => onOpenDirectory(entry.path)}
                      className="truncate text-left font-medium text-app-text hover:text-app-accent"
                    >
                      {entry.name}
                    </button>
                  ) : documentHrefBase ? (
                    <Link
                      href={`${documentHrefBase}/${entry.id}`}
                      className="truncate font-medium text-app-text hover:text-app-accent"
                      target="_blank"
                    >
                      {entry.name}
                    </Link>
                  ) : (
                    <span className="truncate font-medium text-app-text">{entry.name}</span>
                  )}
                  <div className="truncate text-xs text-app-muted">
                    {entry.kind === "directory" ? entry.path : entry.documentPath}
                  </div>
                </div>
              </div>
            </td>
          );
        }

        return (
          <td key={cell.id} className="px-3.5 py-2.5 align-middle text-[13px] text-app-muted-strong">
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        );
      })}
    </tr>
  );
}

export function KnowledgeBaseExplorer({
  initialCurrentPath,
  currentDirectoryId,
  directories,
  documents,
  documentHrefBase = null,
  scopeQuery = {},
  presignEndpoint,
  documentsEndpoint,
  directoriesEndpoint = null,
  operationsEndpoint = null,
  downloadEndpoint,
  editable = true,
  canManageTasks = true,
  mountedLibraries = [],
  readOnlyNotice = null,
  showPageHeader = true,
  scopeLabel = "我的资料",
  backLink = null,
}: {
  initialCurrentPath: string;
  currentDirectoryId: string | null;
  directories: DirectoryRecord[];
  documents: DocumentRecord[];
  documentHrefBase?: string | null;
  scopeQuery?: Record<string, string | undefined>;
  presignEndpoint: string;
  documentsEndpoint: string;
  directoriesEndpoint?: string | null;
  operationsEndpoint?: string | null;
  downloadEndpoint: string;
  editable?: boolean;
  canManageTasks?: boolean;
  mountedLibraries?: MountedLibraryRecord[];
  readOnlyNotice?: string | null;
  showPageHeader?: boolean;
  scopeLabel?: string;
  backLink?: { href: string; label: string } | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [currentPath, setCurrentPath] = useState(initialCurrentPath);
  const [currentDirectory, setCurrentDirectory] = useState(currentDirectoryId);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "name", desc: false },
  ]);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isTasksOpen, setIsTasksOpen] = useState(false);
  const [isCreateDirectoryOpen, setIsCreateDirectoryOpen] = useState(false);
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [directoryName, setDirectoryName] = useState("");
  const [targetDirectoryId, setTargetDirectoryId] = useState(currentDirectoryId ?? "");
  const [operationError, setOperationError] = useState<string | null>(null);
  const [uploadItems, setUploadItems] = useState<DocumentUploadItem[]>([]);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [activeDragPayload, setActiveDragPayload] = useState<DragPayload | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setCurrentPath(initialCurrentPath);
    setCurrentDirectory(currentDirectoryId);
    setTargetDirectoryId(currentDirectoryId ?? "");
  }, [currentDirectoryId, initialCurrentPath]);

  // Use SWR to handle automatic polling and revalidate-on-focus for RSC payload.
  useSWR(
    buildPathHref(pathname, currentPath, scopeQuery),
    () => {
      startTransition(() => {
        router.refresh();
      });
      return Date.now();
    },
    {
      refreshInterval: 5000,
      revalidateOnFocus: true,
    }
  );

  const directoryByPath = useMemo(
    () => new Map(directories.map((directory) => [directory.path, directory] as const)),
    [directories],
  );
  const currentChildren = useMemo(
    () => directories.filter((directory) => directory.parentId === currentDirectory),
    [currentDirectory, directories],
  );
  const currentDocuments = useMemo(
    () => documents.filter((document) => document.directoryPath === currentPath),
    [currentPath, documents],
  );
  const processingDocuments = useMemo(
    () =>
      documents.filter(
        (document) =>
          document.latestJob?.status === RUN_STATUS.QUEUED ||
          document.latestJob?.status === RUN_STATUS.RUNNING ||
          document.latestJob?.status === RUN_STATUS.FAILED,
      ),
    [documents],
  );
  const invalidUploadFiles = useMemo<UploadFileIssue[]>(
    () =>
      collectUnsupportedUploads(
        uploadItems.map((item) => ({
          file: item.file,
          itemId: item.id,
          filename: item.file.name,
          contentType: item.file.type,
        })),
      ).map(({ input, code, message }) => ({
        itemId: input.itemId,
        file: input.file,
        code,
        message,
      })),
    [uploadItems],
  );
  const validUploadItems = useMemo(() => {
    const invalidUploadIds = new Set(invalidUploadFiles.map((issue) => issue.itemId));

    return uploadItems.filter((item) => !invalidUploadIds.has(item.id));
  }, [invalidUploadFiles, uploadItems]);
  const pendingUploadItems = useMemo(
    () => validUploadItems.filter((item) => item.step === DOCUMENT_UPLOAD_STEP.PENDING),
    [validUploadItems],
  );
  const failedUploadItems = useMemo(
    () => getRetryableDocumentUploadItems(validUploadItems),
    [validUploadItems],
  );
  const uploadValidationMessage = useMemo(() => {
    if (invalidUploadFiles.length === 0) {
      return null;
    }

    const names = invalidUploadFiles.map(({ file }) => file.name);
    const preview = names.slice(0, 2).join("、");
    const suffix = names.length > 2 ? ` 等 ${names.length} 个文件` : "";
    const reasons = Array.from(new Set(invalidUploadFiles.map(({ message }) => message)));

    return `所选文件包含不支持的格式：${preview}${suffix}。${reasons.join(" ")}`;
  }, [invalidUploadFiles]);
  const uploadSummary = useMemo(
    () => summarizeDocumentUploadItems(validUploadItems),
    [validUploadItems],
  );

  const entries = useMemo(() => {
    const nextEntries = [
      ...currentChildren.map<ExplorerEntry>((directory) => ({
        kind: "directory",
        id: directory.id,
        rowId: `directory:${directory.id}`,
        name: directory.name,
        path: directory.path,
        createdAt: directory.createdAt,
        updatedAt: directory.updatedAt,
        typeLabel: "目录",
        sizeLabel: "—",
        statusLabel: "—",
        searchText: `${directory.name} ${directory.path} 目录`.toLowerCase(),
      })),
      ...currentDocuments.map<ExplorerEntry>((document) => ({
        kind: "document",
        id: document.id,
        rowId: `document:${document.id}`,
        name: document.sourceFilename,
        title: document.title,
        path: document.logicalPath,
        documentPath: document.logicalPath,
        directoryPath: document.directoryPath,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
        typeLabel: getDocumentTypeLabel(document),
        sizeLabel: formatFileSize(document.latestVersion?.fileSizeBytes ?? null),
        statusLabel: getDocumentStatusLabel(document),
        latestJob: document.latestJob,
        latestVersion: document.latestVersion,
        searchText: `${document.sourceFilename} ${document.logicalPath} ${getDocumentTypeLabel(document)} ${document.docType} ${document.mimeType}`.toLowerCase(),
      })),
    ];
    const normalizedQuery = deferredSearchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return nextEntries;
    }

    return nextEntries.filter((entry) => entry.searchText.includes(normalizedQuery));
  }, [currentChildren, currentDocuments, deferredSearchQuery]);

  const selectedEntries = entries.filter((entry) => rowSelection[entry.rowId]);

  const selectedDirectoryIds = selectedEntries
    .filter((entry) => entry.kind === "directory")
    .map((entry) => entry.id);
  const selectedDocumentIds = selectedEntries
    .filter((entry) => entry.kind === "document")
    .map((entry) => entry.id);

  const pathBreadcrumbs = useMemo(() => {
    const pathSegments = currentPath.split("/").filter(Boolean);

    return pathSegments.map((segment, index) => {
      const path = pathSegments.slice(0, index + 1).join("/");
      const directory = directoryByPath.get(path) ?? null;

      return {
        id: directory?.id ?? path,
        label: segment,
        path,
      };
    });
  }, [currentPath, directoryByPath]);
  const isRootDirectory = pathBreadcrumbs.length <= 1;
  const shouldShowScopeMeta = !showPageHeader || Boolean(backLink) || Boolean(readOnlyNotice);
  const shouldShowPathBreadcrumbs = !isRootDirectory;

  const columns = useMemo<ColumnDef<ExplorerEntry>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <SelectionCheckbox
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={table.getIsSomePageRowsSelected()}
            onChange={() => {
              table.toggleAllPageRowsSelected(!table.getIsAllPageRowsSelected());
            }}
            label="全选当前列表"
          />
        ),
        cell: ({ row }) => (
          <SelectionCheckbox
            checked={row.getIsSelected()}
            onChange={() => {
              row.toggleSelected(!row.getIsSelected());
            }}
            label={`选择 ${row.original.name}`}
          />
        ),
        enableSorting: false,
        size: 44,
      },
      {
        id: "name",
        accessorFn: (row) => row.name,
        header: () => "名称",
        sortingFn: (left, right) => {
          if (left.original.kind !== right.original.kind) {
            return left.original.kind === "directory" ? -1 : 1;
          }

          return left.original.name.localeCompare(right.original.name, "zh-CN");
        },
      },
      {
        id: "status",
        accessorFn: (row) => row.statusLabel,
        header: () => "状态",
        cell: ({ row }) => row.original.statusLabel,
      },
      {
        id: "type",
        accessorFn: (row) => row.typeLabel,
        header: () => "类型",
        cell: ({ row }) => row.original.typeLabel,
      },
      {
        id: "size",
        accessorFn: (row) => row.sizeLabel,
        header: () => "大小",
        cell: ({ row }) => row.original.sizeLabel,
      },
      {
        id: "updatedAt",
        accessorFn: (row) => row.updatedAt,
        header: () => "更新时间",
        cell: ({ row }) => formatTime(row.original.updatedAt),
      },
      {
        id: "createdAt",
        accessorFn: (row) => row.createdAt,
        header: () => "创建时间",
        cell: ({ row }) => formatTime(row.original.createdAt),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: entries,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
      rowSelection,
    },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.rowId,
  });

  const dropzone = useDropzone({
    multiple: true,
    onDrop(acceptedFiles) {
      setUploadItems(createDocumentUploadItems(acceptedFiles));
      setUploadStatus(null);
    },
  });

  function syncPath(path: string) {
    const directory = directoryByPath.get(path);
    if (!directory) {
      return;
    }

    setCurrentPath(directory.path);
    setCurrentDirectory(directory.id);
    setRowSelection({});
    setTargetDirectoryId(directory.id);
    router.replace(buildPathHref(pathname, directory.path, scopeQuery), { scroll: false });
  }

  function buildSelectionPayload(entry?: ExplorerEntry): DragPayload {
    if (entry && rowSelection[entry.rowId]) {
      return {
        directoryIds: selectedDirectoryIds,
        documentIds: selectedDocumentIds,
        label: `已选 ${selectedEntries.length} 项`,
      };
    }

    return {
      directoryIds: entry?.kind === "directory" ? [entry.id] : [],
      documentIds: entry?.kind === "document" ? [entry.id] : [],
      label: entry?.name ?? "1 项",
    };
  }

  async function refreshPage() {
    startTransition(() => {
      router.refresh();
    });
  }

  function resetUploadSelection() {
    setUploadItems([]);
    setUploadStatus(null);
  }

  function closeUploadModal() {
    if (isUploading) {
      return;
    }

    setIsUploadOpen(false);
    resetUploadSelection();
  }

  async function runJsonOperation(body: Record<string, unknown>) {
    if (!operationsEndpoint) {
      throw new Error("当前视图不支持资料操作");
    }

    setOperationError(null);
    const response = await fetch(operationsEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;

    if (!response.ok) {
      throw new Error(payload?.error ?? "资料库操作失败");
    }

    setRowSelection({});
    await refreshPage();
  }

  async function handleDeleteSelection() {
    if (selectedEntries.length === 0) {
      return;
    }

    try {
      await runJsonOperation({
        action: "delete",
        directoryIds: selectedDirectoryIds,
        documentIds: selectedDocumentIds,
      });
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "删除失败");
    }
  }

  async function handleDeleteSingleDocument(documentId: string) {
    try {
      await runJsonOperation({
        action: "delete",
        directoryIds: [],
        documentIds: [documentId],
      });
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "删除任务失败");
    }
  }

  async function handleMoveSelection(directoryId: string) {
    if (selectedEntries.length === 0) {
      return;
    }

    try {
      await runJsonOperation({
        action: "move",
        targetDirectoryId: directoryId,
        directoryIds: selectedDirectoryIds,
        documentIds: selectedDocumentIds,
      });
      setIsMoveOpen(false);
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "移动失败");
    }
  }

  async function handleDropMove(directoryId: string, payload: DragPayload) {
    try {
      await runJsonOperation({
        action: "move",
        targetDirectoryId: directoryId,
        directoryIds: payload.directoryIds,
        documentIds: payload.documentIds,
      });
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "拖拽移动失败");
    }
  }

  async function handleCreateDirectory() {
    if (!directoriesEndpoint) {
      setOperationError("当前视图不支持创建目录");
      return;
    }

    setOperationError(null);
    const response = await fetch(directoriesEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        parentDirectoryId: currentDirectory,
        name: directoryName,
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;

    if (!response.ok) {
      setOperationError(payload?.error ?? "创建目录失败");
      return;
    }

    setDirectoryName("");
    setIsCreateDirectoryOpen(false);
    await refreshPage();
  }

  async function handleDownloadSelection() {
    if (selectedEntries.length === 0) {
      return;
    }

    setOperationError(null);
    const response = await fetch(downloadEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        directoryIds: selectedDirectoryIds,
        documentIds: selectedDocumentIds,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      setOperationError(payload?.error ?? "下载失败");
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const disposition = response.headers.get("content-disposition") ?? "";
    const matchedFilename = disposition.match(/filename\*=UTF-8''([^;]+)/);
    const filename = matchedFilename?.[1]
      ? decodeURIComponent(matchedFilename[1])
      : "knowledge-base.zip";

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function runUploadBatch(targetItems: DocumentUploadItem[]) {
    if (targetItems.length === 0 || isUploading) {
      return;
    }

    if (invalidUploadFiles.length > 0) {
      setUploadStatus(uploadValidationMessage ?? `当前仅支持 ${SUPPORTED_UPLOAD_TYPES_LABEL} 上传。`);
      return;
    }

    const validUploadIds = new Set(validUploadItems.map((item) => item.id));
    let nextUploadItems = uploadItems;
    const applyUploadItemPatch = (
      itemId: string,
      patch: Partial<DocumentUploadItem>,
    ) => {
      nextUploadItems = updateDocumentUploadItem(nextUploadItems, itemId, patch);
      setUploadItems(nextUploadItems);
    };

    setIsUploading(true);
    setUploadStatus(`正在处理 1 / ${targetItems.length} 个文件。`);

    try {
      for (const [index, targetItem] of targetItems.entries()) {
        const currentItem =
          nextUploadItems.find((item) => item.id === targetItem.id) ?? targetItem;
        const file = currentItem.file;
        const contentType = file.type || "application/octet-stream";

        setUploadStatus(`正在处理 ${index + 1} / ${targetItems.length}：${file.name}`);

        let sha256 = currentItem.sha256;
        if (!sha256) {
          applyUploadItemPatch(currentItem.id, {
            step: DOCUMENT_UPLOAD_STEP.FINGERPRINTING,
            progress: 0,
            errorMessage: null,
          });
          sha256 = await computeFileSha256(file).catch((error: unknown) => {
            applyUploadItemPatch(currentItem.id, {
              step: DOCUMENT_UPLOAD_STEP.FAILED,
              progress: 0,
              errorMessage: readUploadErrorMessage(error, `计算 ${file.name} 指纹失败。`),
            });
            return null;
          });
        }

        if (!sha256) {
          continue;
        }

        applyUploadItemPatch(currentItem.id, {
          step: DOCUMENT_UPLOAD_STEP.PRESIGNING,
          progress: 0,
          errorMessage: null,
          sha256,
        });

        let presignResponse: Response;
        try {
          presignResponse = await fetch(presignEndpoint, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              filename: file.name,
              contentType,
              directoryPath: currentPath,
              sha256,
            }),
          });
        } catch (error) {
          applyUploadItemPatch(currentItem.id, {
            step: DOCUMENT_UPLOAD_STEP.FAILED,
            progress: 0,
            errorMessage: readUploadErrorMessage(error, "申请上传地址失败。"),
            sha256,
          });
          continue;
        }

        const presignBody = (await presignResponse.json().catch(() => null)) as
          | {
              uploadUrl: string | null;
              key: string;
              alreadyExists?: boolean;
              error?: string;
            }
          | null;

        if (!presignResponse.ok || !presignBody?.key) {
          applyUploadItemPatch(currentItem.id, {
            step: DOCUMENT_UPLOAD_STEP.FAILED,
            progress: 0,
            errorMessage: presignBody?.error ?? "申请上传地址失败。",
            sha256,
          });
          continue;
        }

        const storageKey = presignBody.key;

        if (!presignBody.alreadyExists) {
          if (!presignBody.uploadUrl) {
            applyUploadItemPatch(currentItem.id, {
              step: DOCUMENT_UPLOAD_STEP.FAILED,
              progress: 0,
              errorMessage: "申请上传地址失败。",
              sha256,
              storageKey,
            });
            continue;
          }

          applyUploadItemPatch(currentItem.id, {
            step: DOCUMENT_UPLOAD_STEP.UPLOADING,
            progress: 0,
            errorMessage: null,
            sha256,
            storageKey,
          });

          try {
            await uploadFileWithProgress({
              url: presignBody.uploadUrl,
              file,
              contentType,
              timeoutMs: DOCUMENT_UPLOAD_REQUEST_TIMEOUT_MS,
              onProgress(progress: number) {
                applyUploadItemPatch(currentItem.id, {
                  step: DOCUMENT_UPLOAD_STEP.UPLOADING,
                  progress,
                  errorMessage: null,
                  sha256,
                  storageKey,
                });
              },
            });
          } catch (error) {
            applyUploadItemPatch(currentItem.id, {
              step: DOCUMENT_UPLOAD_STEP.FAILED,
              progress: 0,
              errorMessage: readUploadErrorMessage(error, `上传文件失败：${file.name}`),
              sha256,
              storageKey,
            });
            continue;
          }
        }

        applyUploadItemPatch(currentItem.id, {
          step: DOCUMENT_UPLOAD_STEP.CREATING_DOCUMENT,
          progress: 100,
          errorMessage: null,
          sha256,
          storageKey,
        });

        let documentResponse: Response;
        try {
          documentResponse = await fetch(documentsEndpoint, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              storageKey,
              sha256,
              sourceFilename: file.name,
              mimeType: contentType,
              directoryPath: currentPath,
            }),
          });
        } catch (error) {
          applyUploadItemPatch(currentItem.id, {
            step: DOCUMENT_UPLOAD_STEP.FAILED,
            progress: 100,
            errorMessage: readUploadErrorMessage(error, `创建任务失败：${file.name}`),
            sha256,
            storageKey,
          });
          continue;
        }

        const documentBody = (await documentResponse.json().catch(() => null)) as
          | {
              error?: string;
              document?: { id?: string };
              documentVersion?: { id?: string };
              documentJob?: { id?: string };
            }
          | null;

        if (!documentResponse.ok) {
          applyUploadItemPatch(currentItem.id, {
            step: DOCUMENT_UPLOAD_STEP.FAILED,
            progress: 100,
            errorMessage: documentBody?.error ?? `创建任务失败：${file.name}`,
            sha256,
            storageKey,
          });
          continue;
        }

        applyUploadItemPatch(currentItem.id, {
          step: DOCUMENT_UPLOAD_STEP.SUCCEEDED,
          progress: 100,
          errorMessage: null,
          sha256,
          storageKey,
          documentId: documentBody?.document?.id ?? null,
          documentVersionId: documentBody?.documentVersion?.id ?? null,
          documentJobId: documentBody?.documentJob?.id ?? null,
        });
      }
    } finally {
      setIsUploading(false);
    }

    const finalValidItems = nextUploadItems.filter((item) => validUploadIds.has(item.id));
    const finalSummary = summarizeDocumentUploadItems(finalValidItems);
    const failedItemsAfterBatch = getRetryableDocumentUploadItems(finalValidItems);

    setUploadStatus(finalSummary);

    if (finalValidItems.some((item) => item.step === DOCUMENT_UPLOAD_STEP.SUCCEEDED)) {
      await refreshPage();
    }

    if (finalValidItems.length > 0 && failedItemsAfterBatch.length === 0) {
      setIsUploadOpen(false);
      resetUploadSelection();
    }
  }

  async function handleUpload() {
    if (pendingUploadItems.length === 0) {
      return;
    }

    await runUploadBatch(pendingUploadItems);
  }

  async function handleRetryFailedUploads() {
    if (failedUploadItems.length === 0) {
      return;
    }

    await runUploadBatch(failedUploadItems);
  }

  function handleDragStart(event: DragStartEvent) {
    const entry = event.active.data.current?.entry as ExplorerEntry | undefined;
    if (!entry) {
      return;
    }

    setActiveDragPayload(buildSelectionPayload(entry));
  }

  function handleDragEnd(event: DragEndEvent) {
    const directoryId = event.over?.data.current?.directoryId as string | undefined;
    const payload = activeDragPayload;
    setActiveDragPayload(null);

    if (!directoryId || !payload) {
      return;
    }

    void handleDropMove(directoryId, payload);
  }

  const toolbarButtonClass = cn(buttonStyles({ variant: "secondary", size: "sm" }), "shrink-0 whitespace-nowrap");
  const headerFieldClass =
    "h-9 rounded-[16px] border border-app-border bg-app-surface-soft/72 px-3 text-[13px]";

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className={cn("grid", showPageHeader ? "gap-8" : "gap-4")}>
        {showPageHeader ? (
          <EditorialPageHeader
            title="资料库"
          />
        ) : null}

        <section className="grid gap-4 rounded-[16px] bg-app-surface-low px-4 py-4">
          {shouldShowScopeMeta ? (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid gap-1">
                <span className={ui.eyebrow}>{scopeLabel}</span>
                {backLink ? (
                  <Link
                    href={backLink.href}
                    className="text-[13px] font-medium text-app-muted-strong transition hover:text-app-text"
                  >
                    {backLink.label}
                  </Link>
                ) : null}
              </div>
              {readOnlyNotice ? (
                <span className="inline-flex items-center rounded-full border border-app-border bg-app-surface-lowest px-3 py-1 text-[12px] text-app-muted-strong">
                  {readOnlyNotice}
                </span>
              ) : null}
            </div>
          ) : null}

          {shouldShowPathBreadcrumbs ? (
            <div
              className={cn(
                headerFieldClass,
                "flex min-w-0 items-center gap-2 overflow-x-auto whitespace-nowrap",
              )}
            >
              {pathBreadcrumbs.map((item, index) => (
                <div key={item.id} className="flex shrink-0 items-center gap-2">
                  {index > 0 ? <span className="text-app-muted">/</span> : null}
                  <button
                    type="button"
                    onClick={() => syncPath(item.path)}
                    className="text-sm font-medium text-app-text hover:text-app-accent"
                  >
                    {item.label}
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {editable ? (
                <>
                  <button
                    type="button"
                    className={buttonStyles({ size: "sm" })}
                    onClick={() => {
                      setUploadStatus(null);
                      setUploadItems([]);
                      setIsUploading(false);
                      setIsUploadOpen(true);
                    }}
                  >
                    上传资料
                  </button>
                  <button
                    type="button"
                    className={buttonStyles({ variant: "secondary", size: "sm" })}
                    onClick={() => {
                      setOperationError(null);
                      setDirectoryName("");
                      setIsCreateDirectoryOpen(true);
                    }}
                  >
                    新建目录
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className={toolbarButtonClass}
                disabled={selectedEntries.length === 0}
                onClick={() => void handleDownloadSelection()}
              >
                下载
              </button>
              {editable ? (
                <>
                  <button
                    type="button"
                    className={toolbarButtonClass}
                    disabled={selectedEntries.length === 0}
                    onClick={() => {
                      setTargetDirectoryId(currentDirectory ?? "");
                      setIsMoveOpen(true);
                    }}
                  >
                    移动
                  </button>
                  <button
                    type="button"
                    className={toolbarButtonClass}
                    disabled={selectedEntries.length === 0}
                    onClick={() => void handleDeleteSelection()}
                  >
                    删除
                  </button>
                </>
              ) : null}
            </div>

            <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
              <label className="min-w-[220px] flex-1 xl:max-w-[320px]">
                <span className="sr-only">搜索资料</span>
                <input
                  className={cn(
                    inputStyles({ size: "compact" }),
                    "bg-app-surface-lowest/92 focus:bg-app-surface-lowest",
                  )}
                  type="search"
                  placeholder="搜索目录、文件名或类型"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </label>
              {canManageTasks ? (
                <button
                  type="button"
                  className={toolbarButtonClass}
                  onClick={() => setIsTasksOpen(true)}
                >
                  处理中任务 {processingDocuments.length > 0 ? `(${processingDocuments.length})` : ""}
                </button>
              ) : null}
              <button
                type="button"
                className={toolbarButtonClass}
                disabled={isPending}
                onClick={() => void refreshPage()}
              >
                {isPending ? "刷新中..." : "刷新"}
              </button>
            </div>
          </div>

          {operationError ? <p className={ui.error}>{operationError}</p> : null}

          {mountedLibraries.length > 0 && currentPath === "资料库" ? (
            <section className="grid gap-2.5 rounded-[16px] bg-app-surface-lowest px-4 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="grid gap-0.5">
                  <h3 className="text-[14px] font-semibold text-app-text">已挂载全局资料库</h3>
                  <p className="text-[13px] text-app-muted-strong">当前空间以只读方式查看</p>
                </div>
                <span className="rounded-full border border-app-border bg-white/90 px-2.5 py-0.5 text-[12px] text-app-muted">
                  {mountedLibraries.length} 个
                </span>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {mountedLibraries.map((library) => (
                  <Link
                    key={library.id}
                    href={library.href}
                    className="grid gap-1.5 rounded-[16px] border border-app-border bg-white/90 px-3.5 py-2.5 transition hover:border-app-border-strong hover:bg-white"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <strong className="truncate text-[13px] text-app-text">{library.title}</strong>
                      <span className="shrink-0 text-[12px] text-app-muted">{library.documentCount} 份资料</span>
                    </div>
                    {library.description ? (
                      <p className="line-clamp-2 text-[13px] leading-5 text-app-muted-strong">
                        {library.description}
                      </p>
                    ) : null}
                    <p className="text-[12px] text-app-muted">更新于 {formatTime(library.updatedAt)}</p>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <div className="rounded-[16px] bg-app-surface-lowest px-4 py-4">
            <div className="overflow-hidden rounded-[16px] bg-app-surface-lowest">
              <table className="w-full border-collapse text-left">
                <thead className="bg-app-surface-low/70">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          className="px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-app-secondary"
                        >
                          {header.isPlaceholder
                            ? null
                            : header.column.getCanSort()
                              ? (
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-2 hover:text-app-text"
                                    onClick={header.column.getToggleSortingHandler()}
                                  >
                                    {flexRender(header.column.columnDef.header, header.getContext())}
                                    <span className="text-[10px]">
                                      {header.column.getIsSorted() === "desc"
                                        ? "↓"
                                        : header.column.getIsSorted() === "asc"
                                          ? "↑"
                                          : ""}
                                    </span>
                                  </button>
                                )
                              : (
                                  <div className="inline-flex items-center gap-2">
                                    {flexRender(header.column.columnDef.header, header.getContext())}
                                  </div>
                                )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.length > 0 ? (
                    table.getRowModel().rows.map((row) => (
                      <TableRow
                        key={row.id}
                        row={row}
                        documentHrefBase={documentHrefBase}
                        editable={editable}
                        onOpenDirectory={syncPath}
                      />
                    ))
                  ) : (
                    <tr>
                      <td colSpan={columns.length} className="px-3.5 py-8 text-center text-[13px] text-app-muted">
                        当前目录没有资料。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-app-muted">
            <span>
              当前目录 {entries.length} 项
              {selectedEntries.length > 0 ? ` · 已选 ${selectedEntries.length} 项` : ""}
            </span>
            {activeDragPayload ? <span>拖拽中：{activeDragPayload.label}</span> : null}
          </div>
        </section>
      </div>

      <ModalShell
        open={isUploadOpen}
        title="上传资料"
        description={`当前目录：${currentPath}`}
        width="lg"
        onClose={closeUploadModal}
      >
        <div className="grid gap-4">
          <button
            type="button"
            {...dropzone.getRootProps()}
            className="grid min-h-[168px] place-items-center rounded-[20px] border border-dashed border-app-border bg-app-surface-soft/55 px-5 py-6 text-center"
          >
            <input {...dropzone.getInputProps({ accept: SUPPORTED_UPLOAD_ACCEPT })} />
            <div className="grid gap-1.5">
              <strong className="text-[14px]">拖入文件，或点击选择文件</strong>
              <span className={ui.muted}>
                支持 {SUPPORTED_UPLOAD_TYPES_LABEL}。图片和扫描件暂不开放上传。
              </span>
            </div>
          </button>
          {validUploadItems.length > 0 ? (
            <div className="grid gap-2 rounded-[18px] border border-app-border bg-white p-3.5">
              {validUploadItems.map((item) => {
                const isFailed = item.step === DOCUMENT_UPLOAD_STEP.FAILED;
                const isSucceeded = item.step === DOCUMENT_UPLOAD_STEP.SUCCEEDED;
                const progressToneClass = isFailed
                  ? "bg-red-500"
                  : isSucceeded
                    ? "bg-emerald-500"
                    : "bg-app-primary";

                return (
                  <div
                    key={item.id}
                    className={cn(
                      "grid gap-1.5 rounded-[16px] border px-3 py-2.5",
                      isFailed
                        ? "border-red-200 bg-red-50/60"
                        : isSucceeded
                          ? "border-emerald-200 bg-emerald-50/40"
                          : "border-app-border bg-app-surface-soft/35",
                    )}
                  >
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm">
                      <span className="min-w-0 truncate text-app-text" title={item.file.name}>
                        {item.file.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-app-muted">
                        {formatFileSize(item.file.size)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-[12px]">
                      <span
                        className={cn(
                          "min-w-0 truncate",
                          isFailed
                            ? "text-red-600"
                            : isSucceeded
                              ? "text-emerald-800"
                              : "text-app-muted-strong",
                        )}
                        title={getDocumentUploadStepLabel(item)}
                      >
                        {getDocumentUploadStepLabel(item)}
                      </span>
                      <span className="shrink-0 tabular-nums text-app-muted">
                        {item.progress}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-app-surface-strong/70">
                      <div
                        className={cn("h-full rounded-full transition-[width]", progressToneClass)}
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
          {invalidUploadFiles.length > 0 ? (
            <div className="grid gap-2 rounded-[18px] border border-red-200 bg-red-50/70 p-3.5">
              {invalidUploadFiles.map(({ file, message }) => (
                <div
                  key={`${file.name}-${file.lastModified}`}
                  className="grid gap-1 rounded-[18px] border border-red-200 bg-white px-3 py-2"
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm">
                    <span className="min-w-0 truncate text-app-text" title={file.name}>
                      {file.name}
                    </span>
                    <span className="shrink-0 tabular-nums text-app-muted">
                      {formatFileSize(file.size)}
                    </span>
                  </div>
                  <p className="text-xs leading-5 text-red-600">{message}</p>
                </div>
              ))}
            </div>
          ) : null}
          {uploadValidationMessage ? <p className={ui.error}>{uploadValidationMessage}</p> : null}
          {!uploadValidationMessage && (uploadStatus ?? uploadSummary) ? (
            <p
              className={
                failedUploadItems.length > 0 && !isUploading ? ui.error : ui.muted
              }
            >
              {uploadStatus ?? uploadSummary}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={buttonStyles({ variant: "secondary" })}
              disabled={isUploading}
              onClick={closeUploadModal}
            >
              取消
            </button>
            {failedUploadItems.length > 0 ? (
              <button
                type="button"
                className={buttonStyles({ variant: "secondary" })}
                disabled={isUploading}
                onClick={() => void handleRetryFailedUploads()}
              >
                {isUploading
                  ? "重试中..."
                  : `重试失败项${failedUploadItems.length > 1 ? `（${failedUploadItems.length}）` : ""}`}
              </button>
            ) : null}
            <button
              type="button"
              className={buttonStyles()}
              disabled={
                pendingUploadItems.length === 0 ||
                invalidUploadFiles.length > 0 ||
                isUploading
              }
              onClick={() => void handleUpload()}
            >
              {isUploading ? "上传中..." : "提交上传"}
            </button>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        open={isCreateDirectoryOpen}
        title="新建文件夹"
        description={`父目录：${currentPath}`}
        onClose={() => setIsCreateDirectoryOpen(false)}
      >
        <div className="grid gap-4">
          <label className={ui.label}>
            目录名称
            <input
              className={ui.input}
              value={directoryName}
              onChange={(event) => setDirectoryName(event.target.value)}
              placeholder="例如：发布说明"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={buttonStyles({ variant: "secondary" })}
              onClick={() => setIsCreateDirectoryOpen(false)}
            >
              取消
            </button>
            <button
              type="button"
              className={buttonStyles()}
              disabled={!directoryName.trim()}
              onClick={() => void handleCreateDirectory()}
            >
              创建
            </button>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        open={isMoveOpen}
        title="移动到目录"
        description={`已选 ${selectedEntries.length} 项`}
        onClose={() => setIsMoveOpen(false)}
      >
        <div className="grid gap-4">
          <label className={ui.label}>
            目标目录
            <select
              className={ui.select}
              value={targetDirectoryId}
              onChange={(event) => setTargetDirectoryId(event.target.value)}
            >
              {directories.map((directory) => (
                <option key={directory.id} value={directory.id}>
                  {directory.path}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={buttonStyles({ variant: "secondary" })}
              onClick={() => setIsMoveOpen(false)}
            >
              取消
            </button>
            <button
              type="button"
              className={buttonStyles()}
              disabled={selectedEntries.length === 0}
              onClick={() => void handleMoveSelection(targetDirectoryId)}
            >
              确认移动
            </button>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        open={isTasksOpen}
        title="处理中任务"
        description="这里只展示正在处理和失败的资料任务。"
        width="xl"
        onClose={() => setIsTasksOpen(false)}
      >
        <div className="grid gap-3">
          {processingDocuments.length > 0 ? (
            processingDocuments.map((document) => (
              <div
                key={document.id}
                className="grid gap-2.5 rounded-[18px] border border-app-border bg-app-surface-soft/55 p-3.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-1">
                    {documentHrefBase ? (
                      <Link
                        href={`${documentHrefBase}/${document.id}`}
                        className="font-medium text-app-text hover:text-app-accent"
                        target="_blank"
                      >
                        {document.sourceFilename}
                      </Link>
                    ) : (
                      <span className="font-medium text-app-text">
                        {document.sourceFilename}
                      </span>
                    )}
                    <p className="text-sm text-app-muted">
                      {document.latestJob?.stage ?? document.latestVersion?.parseStatus ?? document.status}
                      {document.latestJob ? ` · ${document.latestJob.progress}%` : ""}
                    </p>
                    <p className="text-xs text-app-muted">{document.logicalPath}</p>
                  </div>
                  <span className="text-xs text-app-muted">
                    {document.latestJob ? formatTime(document.latestJob.updatedAt) : formatTime(document.updatedAt)}
                  </span>
                </div>
                {document.latestJob?.status === RUN_STATUS.FAILED ? (
                  <div className="grid gap-3">
                    <div className="rounded-xl border border-red-200/60 bg-red-50/50 p-3 text-red-600/90 shadow-sm">
                      <div className="max-h-32 overflow-y-auto pr-2 text-[12px] font-mono leading-relaxed custom-scrollbar">
                        {describeDocumentJobFailure({
                          stage: document.latestJob.stage,
                          errorCode: document.latestJob.errorCode,
                          errorMessage: document.latestJob.errorMessage,
                        })}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                       <RetryDocumentJobButton jobId={document.latestJob.id} />
                       <button
                         type="button"
                         className={buttonStyles({ variant: "dangerGhost", size: "sm" })}
                         onClick={() => void handleDeleteSingleDocument(document.id)}
                       >
                         删除并放弃任务
                       </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                     <button
                       type="button"
                       className={buttonStyles({ variant: "dangerGhost", size: "sm" })}
                       onClick={() => void handleDeleteSingleDocument(document.id)}
                     >
                       取消任务并删除
                     </button>
                  </div>
                )}
              </div>
            ))
          ) : (
            <p className={ui.muted}>当前没有正在处理或失败的资料任务。</p>
          )}
        </div>
      </ModalShell>
    </DndContext>
  );
}
