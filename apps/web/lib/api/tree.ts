type TreeNode = {
  name: string;
  path: string;
  type: "directory" | "file";
  children?: TreeNode[];
};

export function buildDocumentTree(paths: string[]) {
  const root: TreeNode = {
    name: "root",
    path: "",
    type: "directory",
    children: [],
  };

  for (const path of paths) {
    const parts = path.split("/").filter(Boolean);
    let current = root;
    let currentPath = "";

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = index === parts.length - 1;

      current.children ??= [];

      let node = current.children.find((child) => child.name === part);
      if (!node) {
        node = {
          name: part,
          path: currentPath,
          type: isFile ? "file" : "directory",
          children: isFile ? undefined : [],
        };
        current.children.push(node);
        current.children.sort((left, right) => {
          if (left.type !== right.type) {
            return left.type === "directory" ? -1 : 1;
          }

          return left.name.localeCompare(right.name, "zh-CN");
        });
      }

      if (!isFile) {
        node.children ??= [];
        current = node;
      }
    });
  }

  return root.children ?? [];
}
