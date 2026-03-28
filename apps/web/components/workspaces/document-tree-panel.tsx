import Link from "next/link";

import { buildDocumentTree } from "@/lib/api/tree";

type DocumentTreeItem = {
  id: string;
  title: string;
  logicalPath: string;
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
          <span className="muted">{node.name}</span>
        </li>
      );
    }

    return (
      <li key={node.path}>
        <Link href={`/workspaces/${workspaceId}/documents/${document.id}`} className="tree-file">
          {document.title}
        </Link>
        <div className="muted tree-path">{document.logicalPath}</div>
      </li>
    );
  }

  return (
    <li key={node.path}>
      <div className="tree-directory">{node.name}</div>
      {node.children?.length ? (
        <ul className="tree-list tree-children">
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
    <div className="card">
      <h3>资料目录</h3>
      {tree.length ? (
        <ul className="tree-list">
          {tree.map((node) => renderTreeNode(workspaceId, node, documentByPath))}
        </ul>
      ) : (
        <p className="muted">当前还没有资料。</p>
      )}
    </div>
  );
}
