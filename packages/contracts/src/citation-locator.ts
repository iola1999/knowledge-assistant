export type CitationLocator = {
  lineStart?: number | null;
  lineEnd?: number | null;
  pageLineStart?: number | null;
  pageLineEnd?: number | null;
  blockIndex?: number | null;
};

function formatLineRange(prefix: string, start?: number | null, end?: number | null) {
  if (!Number.isFinite(start) || (end !== undefined && end !== null && !Number.isFinite(end))) {
    return null;
  }

  const safeStart = Math.max(1, Math.trunc(start ?? 0));
  const safeEnd =
    end === undefined || end === null ? safeStart : Math.max(safeStart, Math.trunc(end));

  return safeStart === safeEnd
    ? `${prefix}第${safeStart}行`
    : `${prefix}第${safeStart}-${safeEnd}行`;
}

export function formatCitationLocator(locator?: CitationLocator | null) {
  if (!locator) {
    return null;
  }

  const lineRange = formatLineRange("", locator.lineStart, locator.lineEnd);
  if (lineRange) {
    return lineRange;
  }

  const pageLineRange = formatLineRange("页内", locator.pageLineStart, locator.pageLineEnd);
  if (pageLineRange) {
    return pageLineRange;
  }

  if (Number.isFinite(locator.blockIndex)) {
    return `第${Math.max(1, Math.trunc(locator.blockIndex ?? 1))}段`;
  }

  return null;
}

export function buildCitationReferenceLabel(input: {
  subject: string;
  pageNo?: number | null;
  locator?: CitationLocator | null;
  sectionLabel?: string | null;
}) {
  return [
    input.subject.trim(),
    Number.isFinite(input.pageNo) ? `第${Math.trunc(input.pageNo ?? 0)}页` : null,
    formatCitationLocator(input.locator),
    input.sectionLabel?.trim() || null,
  ]
    .filter(Boolean)
    .join(" · ");
}
