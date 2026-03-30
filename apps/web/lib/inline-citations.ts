import { replaceDisplayInlineCitationTokens } from "@anchordesk/contracts";

export function renderInlineCitationMarkers(content: string) {
  return replaceDisplayInlineCitationTokens(content, (index) => {
    return `<citation-marker data-citation-index="${index}"></citation-marker>`;
  });
}
