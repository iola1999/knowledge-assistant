import { extractDisplayInlineCitationOrdinals } from "@anchordesk/contracts";

const INLINE_CITATION_GROUP_PATTERN = /(?:\[\^\d+\])+/g;

export function parseInlineCitationIndices(value: string) {
  return value
    .split(",")
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
}

export function renderInlineCitationMarkers(content: string) {
  return content.replace(INLINE_CITATION_GROUP_PATTERN, (group) => {
    const indices = extractDisplayInlineCitationOrdinals(group);
    return indices.length > 0
      ? `<citation-group data-citation-indices="${indices.join(",")}"></citation-group>`
      : "";
  });
}
