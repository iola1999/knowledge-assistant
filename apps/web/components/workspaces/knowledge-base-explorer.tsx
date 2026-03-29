"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { DndContext, type DragEndEvent, type DragStartEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { flexRender, getCoreRowModel, getSortedRowModel, type SortingState, useReactTable, type ColumnDef, type Row } from "@tanstack/react-table";
import { useDropzone } from "react-dropzone";

import { RUN_STATUS } from "@knowledge-assistant/contracts";

import { RetryDocumentJobButton } from "@/components/workspaces/retry-document-job-button";
import { ModalShell } from "@/components/shared/modal-shell";
import { describeDocumentJobFailure } from "@/lib/api/document-jobs";
import { computeFileSha256 } from "@/lib/api/file-digests";
import { validateUploadSupport } from "@/lib/api/upload-policy";
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

function buildPathHref(pathname: string, path: string) {
  return `${pathname}?path=${encodeURIComponent(path)}`;
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
  workspaceId,
  onOpenDirectory,
}: {
  row: Row<ExplorerEntry>;
  workspaceId: string;
  onOpenDirectory: (path: string) => void;
}) {
  const entry = row.original;
  const droppable = useDroppable({
    id: `directory:${entry.id}`,
    data:
      entry.kind === "directory"
        ? { directoryId: entry.id, directoryPath: entry.path }
        : undefined,
    disabled: entry.kind !== "directory",
  });
  const draggable = useDraggable({
    id: `entry:${entry.rowId}`,
    data: { entry },
  });

  return (
    <tr
      ref={droppable.setNodeRef}
      className={cn(
        "border-b border-app-border/80 transition",
        row.getIsSelected() ? "bg-app-surface-soft/72" : "bg-white/84",
        droppable.isOver && entry.kind === "directory" && "bg-app-surface-strong/55",
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
                  className={cn(
                    buttonStyles({ variant: "ghost", size: "sm", shape: "icon" }),
                    "mt-0.5 size-8 shrink-0 rounded-xl border border-transparent text-app-muted-strong hover:border-app-border hover:bg-app-surface-soft",
                    draggable.isDragging && "opacity-40",
                  )}
                  {...draggable.attributes}
                  {...draggable.listeners}
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
                  ) : (
                    <Link
                      href={`/workspaces/${workspaceId}/documents/${entry.id}`}
                      className="truncate font-medium text-app-text hover:text-app-accent"
                    >
                      {entry.name}
                    </Link>
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
          <td key={cell.id} className="px-4 py-3 align-middle text-sm text-app-muted-strong">
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        );
      })}
    </tr>
  );
}

export function KnowledgeBaseExplorer({
  workspaceId,
  initialCurrentPath,
  currentDirectoryId,
  directories,
  documents,
}: {
  workspaceId: string;
  initialCurrentPath: string;
  currentDirectoryId: string;
  directories: DirectoryRecord[];
  documents: DocumentRecord[];
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
  const [targetDirectoryId, setTargetDirectoryId] = useState(currentDirectoryId);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [activeDragPayload, setActiveDragPayload] = useState<DragPayload | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setCurrentPath(initialCurrentPath);
    setCurrentDirectory(currentDirectoryId);
    setTargetDirectoryId(currentDirectoryId);
  }, [currentDirectoryId, initialCurrentPath]);

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
        searchText: `${directory.name} ${directory.path}`.toLowerCase(),
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
        searchText: `${document.sourceFilename} ${document.logicalPath}`.toLowerCase(),
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
      setUploadFiles(acceptedFiles);
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
    router.replace(buildPathHref(pathname, directory.path), { scroll: false });
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

  async function runJsonOperation(body: Record<string, unknown>) {
    setOperationError(null);
    const response = await fetch(`/api/workspaces/${workspaceId}/knowledge-base/operations`, {
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
    setOperationError(null);
    const response = await fetch(`/api/workspaces/${workspaceId}/directories`, {
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
    const response = await fetch(`/api/workspaces/${workspaceId}/knowledge-base/download`, {
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

  async function handleUpload() {
    if (uploadFiles.length === 0) {
      return;
    }

    setUploadStatus("正在上传...");

    for (const file of uploadFiles) {
      const support = validateUploadSupport({
        filename: file.name,
        contentType: file.type,
      });
      if (!support.ok) {
        setUploadStatus(support.message);
        return;
      }

      setUploadStatus(`正在计算 ${file.name} 的指纹...`);
      const sha256 = await computeFileSha256(file).catch((error: unknown) => {
        setUploadStatus(error instanceof Error ? error.message : `计算 ${file.name} 指纹失败`);
        return null;
      });
      if (!sha256) {
        return;
      }

      const presignResponse = await fetch(`/api/workspaces/${workspaceId}/uploads/presign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          directoryPath: currentPath,
          sha256,
        }),
      });
      const presignBody = (await presignResponse.json().catch(() => null)) as
        | {
            uploadUrl: string | null;
            key: string;
            alreadyExists?: boolean;
            error?: string;
          }
        | null;

      if (!presignResponse.ok || !presignBody?.key) {
        setUploadStatus(presignBody?.error ?? "申请上传地址失败");
        return;
      }

      if (!presignBody.alreadyExists) {
        if (!presignBody.uploadUrl) {
          setUploadStatus("申请上传地址失败");
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
          setUploadStatus(`上传文件失败：${file.name}`);
          return;
        }
      }

      const documentResponse = await fetch(`/api/workspaces/${workspaceId}/documents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          storageKey: presignBody.key,
          sha256,
          sourceFilename: file.name,
          mimeType: file.type || "application/octet-stream",
          directoryPath: currentPath,
        }),
      });
      const documentBody = (await documentResponse.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!documentResponse.ok) {
        setUploadStatus(documentBody?.error ?? `创建任务失败：${file.name}`);
        return;
      }
    }

    setUploadStatus(`已提交 ${uploadFiles.length} 个文件`);
    setUploadFiles([]);
    setIsUploadOpen(false);
    await refreshPage();
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

  const toolbarButtonClass = cn(
    buttonStyles({ variant: "secondary" }),
    "shrink-0 whitespace-nowrap",
  );
  const headerFieldClass =
    "h-10 rounded-[18px] border border-app-border bg-app-surface-soft/72 px-3.5 text-[14px]";

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className={cn(ui.panelLarge, "grid gap-5 px-5 py-5 md:px-6")}>
        <div className="flex flex-wrap items-center gap-3">
          <div
            className={cn(
              headerFieldClass,
              "flex min-w-0 flex-1 items-center gap-2 overflow-x-auto whitespace-nowrap",
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
          <input
            className={cn(inputStyles({ size: "compact" }), "w-full max-w-[260px]")}
            placeholder="搜索当前目录"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={toolbarButtonClass}
              onClick={() => {
                setUploadStatus(null);
                setUploadFiles([]);
                setIsUploadOpen(true);
              }}
            >
              上传
            </button>
            <button
              type="button"
              className={toolbarButtonClass}
              onClick={() => {
                setOperationError(null);
                setDirectoryName("");
                setIsCreateDirectoryOpen(true);
              }}
            >
              新建文件夹
            </button>
            <button
              type="button"
              className={toolbarButtonClass}
              disabled={selectedEntries.length === 0}
              onClick={() => void handleDownloadSelection()}
            >
              下载
            </button>
            <button
              type="button"
              className={toolbarButtonClass}
              disabled={selectedEntries.length === 0}
              onClick={() => {
                setTargetDirectoryId(currentDirectory);
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
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={toolbarButtonClass}
              onClick={() => setIsTasksOpen(true)}
            >
              处理中任务 {processingDocuments.length > 0 ? `(${processingDocuments.length})` : ""}
            </button>
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

        <div className="overflow-hidden rounded-[24px] border border-app-border bg-white">
          <table className="w-full border-collapse text-left">
            <thead className="border-b border-app-border bg-app-surface-soft/70">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-app-muted-strong"
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
                    workspaceId={workspaceId}
                    onOpenDirectory={syncPath}
                  />
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-app-muted">
                    当前目录没有资料。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-app-muted">
          <span>
            当前目录 {entries.length} 项
            {selectedEntries.length > 0 ? ` · 已选 ${selectedEntries.length} 项` : ""}
          </span>
          {activeDragPayload ? <span>拖拽中：{activeDragPayload.label}</span> : null}
        </div>
      </div>

      <ModalShell
        open={isUploadOpen}
        title="上传资料"
        description={`当前目录：${currentPath}`}
        width="lg"
        onClose={() => setIsUploadOpen(false)}
      >
        <div className="grid gap-4">
          <button
            type="button"
            {...dropzone.getRootProps()}
            className="grid min-h-[180px] place-items-center rounded-[24px] border border-dashed border-app-border bg-app-surface-soft/55 px-6 py-8 text-center"
          >
            <input {...dropzone.getInputProps()} />
            <div className="grid gap-2">
              <strong className="text-base">拖入文件，或点击选择文件</strong>
              <span className={ui.muted}>
                支持 PDF、DOCX、TXT、Markdown。图片和扫描件暂不开放上传。
              </span>
            </div>
          </button>
          {uploadFiles.length > 0 ? (
            <div className="grid gap-2 rounded-[22px] border border-app-border bg-white p-4">
              {uploadFiles.map((file) => (
                <div key={`${file.name}-${file.lastModified}`} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-app-text">{file.name}</span>
                  <span className="text-app-muted">{formatFileSize(file.size)}</span>
                </div>
              ))}
            </div>
          ) : null}
          {uploadStatus ? <p className={ui.muted}>{uploadStatus}</p> : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={buttonStyles({ variant: "secondary" })}
              onClick={() => setIsUploadOpen(false)}
            >
              取消
            </button>
            <button
              type="button"
              className={buttonStyles()}
              disabled={uploadFiles.length === 0}
              onClick={() => void handleUpload()}
            >
              提交上传
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
                className="grid gap-3 rounded-[22px] border border-app-border bg-app-surface-soft/55 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-1">
                    <Link
                      href={`/workspaces/${workspaceId}/documents/${document.id}`}
                      className="font-medium text-app-text hover:text-app-accent"
                    >
                      {document.sourceFilename}
                    </Link>
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
                  <p className={ui.error}>
                    {describeDocumentJobFailure({
                      stage: document.latestJob.stage,
                      errorCode: document.latestJob.errorCode,
                      errorMessage: document.latestJob.errorMessage,
                    })}
                  </p>
                ) : null}
                {document.latestJob?.status === RUN_STATUS.FAILED ? (
                  <RetryDocumentJobButton jobId={document.latestJob.id} />
                ) : null}
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
