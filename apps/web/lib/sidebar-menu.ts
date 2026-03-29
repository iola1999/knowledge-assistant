type FloatingMenuTriggerRect = {
  top: number;
  right: number;
  height: number;
};

export function resolveSidebarConversationMenuPosition({
  triggerRect,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
  offset = 12,
  margin = 12,
}: {
  triggerRect: FloatingMenuTriggerRect;
  menuWidth: number;
  menuHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  offset?: number;
  margin?: number;
}) {
  const preferredLeft = triggerRect.right + offset;
  const maxLeft = Math.max(margin, viewportWidth - menuWidth - margin);
  const centeredTop = triggerRect.top + triggerRect.height / 2 - menuHeight / 2;
  const maxTop = Math.max(margin, viewportHeight - menuHeight - margin);

  return {
    left: Math.min(preferredLeft, maxLeft),
    top: Math.max(margin, Math.min(centeredTop, maxTop)),
  };
}
