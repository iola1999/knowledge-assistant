type TreeNode = {
  name: string;
  path: string;
  type: "directory" | "file";
  children?: TreeNode[];
};

export function buildDocumentTree(paths: string[]) {
  const root = new Map<string, TreeNode>();

  for (const path of paths) {
    const parts = path.split("/").filter(Boolean);
    let level = root;
    let currentPath = "";

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = index === parts.length - 1;

      if (!level.has(part)) {
        level.set(part, {
          name: part,
          path: currentPath,
          type: isFile ? "file" : "directory",
          children: isFile ? undefined : [],
        });
      }

      const node = level.get(part)!;
      if (!isFile) {
        const next = new Map<string, TreeNode>();
        for (const child of node.children ?? []) {
          next.set(child.name, child);
        }
        level = next;
        node.children = Array.from(level.values());
      }
    });
  }

  return Array.from(root.values());
}
