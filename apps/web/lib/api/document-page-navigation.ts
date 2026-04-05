export function resolveDocumentPreviewBackTarget(workspaceId?: string | null) {
  const normalizedWorkspaceId = String(workspaceId ?? "").trim();

  if (normalizedWorkspaceId) {
    return {
      href: `/workspaces/${normalizedWorkspaceId}`,
      label: "返回工作区",
    };
  }

  return {
    href: "/",
    label: "返回首页",
  };
}
