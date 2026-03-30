function readLocatorValue(locator: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = locator?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(1, Math.trunc(value));
    }
  }

  return null;
}

export function readCitationLocator(
  metadataJson: Record<string, unknown> | null | undefined,
) {
  const locator =
    metadataJson?.locator && typeof metadataJson.locator === "object"
      ? (metadataJson.locator as Record<string, unknown>)
      : null;

  if (!locator) {
    return null;
  }

  return {
    lineStart: readLocatorValue(locator, ["line_start", "lineStart"]),
    lineEnd: readLocatorValue(locator, ["line_end", "lineEnd"]),
    pageLineStart: readLocatorValue(locator, ["page_line_start", "pageLineStart"]),
    pageLineEnd: readLocatorValue(locator, ["page_line_end", "pageLineEnd"]),
    blockIndex: readLocatorValue(locator, ["block_index", "blockIndex"]),
  };
}
