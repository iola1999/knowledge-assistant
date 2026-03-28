export function resolveWorkspaceDeletedAt(input: {
  currentDeletedAt?: Date | null;
  now?: Date;
}) {
  return input.currentDeletedAt ?? input.now ?? new Date();
}

export function isWorkspaceDeleted(deletedAt: Date | null | undefined) {
  return deletedAt instanceof Date;
}
