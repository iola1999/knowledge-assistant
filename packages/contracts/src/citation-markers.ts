const RAW_INLINE_CITATION_PATTERN = /\[\[cite:(\d+)\]\]/g;
const DISPLAY_INLINE_CITATION_PATTERN = /\[\^(\d+)\]/g;

export function buildRawInlineCitationToken(slot: number) {
  return `[[cite:${slot}]]`;
}

export function buildDisplayInlineCitationToken(index: number) {
  return `[^${index}]`;
}

export function extractRawInlineCitationSlots(value: string) {
  return Array.from(
    value.matchAll(RAW_INLINE_CITATION_PATTERN),
    (match) => Number(match[1]),
  ).filter((slot) => Number.isInteger(slot) && slot > 0);
}

export function extractDisplayInlineCitationOrdinals(value: string) {
  return Array.from(
    value.matchAll(DISPLAY_INLINE_CITATION_PATTERN),
    (match) => Number(match[1]),
  ).filter((index) => Number.isInteger(index) && index > 0);
}

export function replaceRawInlineCitationTokens(
  value: string,
  replacer: (slot: number) => string,
) {
  return value.replace(RAW_INLINE_CITATION_PATTERN, (_match, rawSlot) => {
    const slot = Number(rawSlot);
    if (!Number.isInteger(slot) || slot <= 0) {
      return "";
    }

    return replacer(slot);
  });
}

export function replaceDisplayInlineCitationTokens(
  value: string,
  replacer: (index: number) => string,
) {
  return value.replace(DISPLAY_INLINE_CITATION_PATTERN, (_match, rawIndex) => {
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index <= 0) {
      return "";
    }

    return replacer(index);
  });
}
