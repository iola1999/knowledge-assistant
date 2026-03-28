import Link from "next/link";

import { buildDocumentTree } from "@/lib/api/tree";
import { documentTypeOptions } from "@/lib/api/document-metadata";
import { cn, ui } from "@/lib/ui";

type DocumentTreeItem = {
  id: string;
  title: string;
  logicalPath: string;
  docType: string;
  tags: string[];
};

type TreeNode = ReturnType<typeof buildDocumentTree>[number];

function renderTreeNode(
  workspaceId: string,
  node: TreeNode,
  documentByPath: Map<string, DocumentTreeItem>,
) {
  if (node.type === "file") {
    const document = documentByPath.get(node.path);
    if (!document) {
      return (
        <li key={node.path}>
          <span className={ui.muted}>{node.name}</span>
        </li>
      );
    }

    return (
      <li key={node.path} className="grid gap-1">
        <Link
          href={`/workspaces/${workspaceId}/documents/${document.id}`}
          className="font-medium text-app-text hover:text-app-accent"
        >
          {document.title}
        </Link>
        <div className={cn(ui.muted, "text-xs")}>{document.logicalPath}</div>
        <div className={cn(ui.muted, "text-xs")}>
          {documentTypeOptions.find((item) => item.value === document.docType)?.label ??
            document.docType}
          {document.tags.length > 0 ? ` · ${document.tags.join("、")}` : ""}
        </div>
      </li>
    );
  }

  return (
    <li key={node.path}>
      <div className="text-sm font-semibold text-app-text">{node.name}</div>
      {node.children?.length ? (
        <ul className="mt-3 grid gap-3 border-l border-app-border pl-4">
          {node.children.map((child) =>
            renderTreeNode(workspaceId, child, documentByPath),
          )}
        </ul>
      ) : null}
    </li>
  );
}

export function DocumentTreePanel({
  workspaceId,
  documents,
}: {
  workspaceId: string;
  documents: DocumentTreeItem[];
}) {
  const tree = buildDocumentTree(documents.map((item) => item.logicalPath));
  const documentByPath = new Map(documents.map((item) => [item.logicalPath, item] as const));

  return (
    <div className={cn(ui.subcard, "grid gap-4")}>
      <h3>资料目录</h3>
      {tree.length ? (
        <ul className="grid gap-3">
          {tree.map((node) => renderTreeNode(workspaceId, node, documentByPath))}
        </ul>
      ) : (
        <p className={ui.muted}>当前还没有资料。</p>
      )}
    </div>
  );
}
