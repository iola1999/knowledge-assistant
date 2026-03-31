import { KNOWLEDGE_SOURCE_SCOPE } from "@anchordesk/contracts";

import { type ConversationMessageCitation } from "@/lib/api/conversation-session";

const COMMON_HOST_SUFFIX = /\.(com|cn|net|org|io|ai|co)$/i;
const MARKDOWN_SIGNAL_PATTERN =
  /(^|\n)\s*(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|`{1,3}|(?:\[[^\]]+\]\([^)]+\)))/m;
const NOISY_WEB_TITLES = new Set(["converted content", "百度首页"]);
const NAVIGATION_KEYWORDS = [
  "首页",
  "番剧",
  "直播",
  "游戏中心",
  "会员购",
  "漫画",
  "赛事",
  "投稿",
  "登录",
  "注册",
  "下载",
  "打开",
  "更多",
];

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripMarkdownArtifacts(value: string) {
  return normalizeWhitespace(
    value
      .replace(/!\[([^\]]*)\]\((?:[^)]+)\)/g, "$1")
      .replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, "$1")
      .replace(/<https?:\/\/[^>]+>/gi, "")
      .replace(/https?:\/\/[^\s)]+/gi, "")
      .replace(/(^|\s)\/\/[^\s)]+/g, " ")
      .replace(/[*_`>#]+/g, " ")
      .replace(/^\s*[-+]\s+/gm, "")
      .replace(/\s*[|｜]+\s*/g, " · "),
  );
}

function preprocessPreviewSource(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
}

function normalizeMarkdownPreviewLine(value: string) {
  const preservedLinks: string[] = [];
  const cleaned = value
    .trim()
    .replace(/!\[([^\]]*)\]\((?:[^)]+)\)/g, (_match, alt: string) =>
      alt.trim() ? `_${alt.trim()}_` : "",
    )
    .replace(/\[[^\]]+\]\((?:[^)]+)\)/g, (match) => {
      const placeholder = `__ANCHORDESK_LINK_${preservedLinks.length}__`;
      preservedLinks.push(match);
      return placeholder;
    })
    .replace(/<https?:\/\/[^>]+>/gi, "")
    .replace(/(^|\s)\/\/[^\s)]+/g, " ")
    .replace(/https?:\/\/[^\s)]+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!cleaned || /^```/.test(cleaned) || /^>?\s*[-*_]{3,}\s*$/.test(cleaned)) {
    return "";
  }

  if (/^\|.*\|$/.test(cleaned)) {
    return stripMarkdownArtifacts(cleaned);
  }

  return preservedLinks.reduce(
    (result, link, index) => result.replace(`__ANCHORDESK_LINK_${index}__`, link),
    cleaned,
  );
}

function normalizePreviewComparisonText(value: string) {
  return stripMarkdownArtifacts(value).toLowerCase();
}

function looksLikeMarkdownPreview(value: string) {
  return MARKDOWN_SIGNAL_PATTERN.test(value);
}

function collectPreviewLines(input: {
  quoteText: string;
  filterNoise: boolean;
  minimumPlainLength: number;
}) {
  return preprocessPreviewSource(input.quoteText)
    .split(/\n+/)
    .map((line) => normalizeMarkdownPreviewLine(line))
    .filter(Boolean)
    .filter((line) => stripMarkdownArtifacts(line).length >= input.minimumPlainLength)
    .filter((line) =>
      input.filterNoise ? !looksLikeNavigationNoise(stripMarkdownArtifacts(line)) : true,
    );
}

function trimPreviewLines(lines: string[], maxLines = 5, maxPlainLength = 280) {
  const selected: string[] = [];
  let plainLength = 0;

  for (const line of lines) {
    const plain = stripMarkdownArtifacts(line);
    if (!plain) {
      continue;
    }

    if (selected.length >= maxLines) {
      break;
    }

    if (selected.length > 0 && plainLength + plain.length > maxPlainLength) {
      break;
    }

    selected.push(line);
    plainLength += plain.length;
  }

  return selected;
}

function buildPreviewExcerptFromLines(lines: string[]) {
  const selectedLines = trimPreviewLines(lines);
  if (selectedLines.length === 0) {
    return {
      excerpt: null,
      excerptFormat: "text" as const,
    };
  }

  const markdownExcerpt = selectedLines.join("\n").trim();
  const textExcerpt = normalizeWhitespace(
    selectedLines.map((line) => stripMarkdownArtifacts(line)).join(" "),
  )
    .slice(0, 220)
    .trim();

  if (!textExcerpt) {
    return {
      excerpt: null,
      excerptFormat: "text" as const,
    };
  }

  return looksLikeMarkdownPreview(markdownExcerpt)
    ? {
        excerpt: markdownExcerpt,
        excerptFormat: "markdown" as const,
      }
    : {
        excerpt: textExcerpt,
        excerptFormat: "text" as const,
      };
}

function readCitationHostname(citation: ConversationMessageCitation) {
  const domain = citation.sourceDomain?.trim().replace(/^www\./i, "") || null;
  if (domain) {
    return domain.toLowerCase();
  }

  if (!citation.sourceUrl) {
    return null;
  }

  try {
    return new URL(citation.sourceUrl).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function simplifyHostnameForBadge(hostname: string | null) {
  if (!hostname) {
    return null;
  }

  return hostname.replace(COMMON_HOST_SUFFIX, "") || hostname;
}

function looksLikeNavigationNoise(line: string) {
  const normalized = normalizeWhitespace(line);
  if (!normalized) {
    return true;
  }

  if (/^(https?:\/\/|\/|www\.)/i.test(normalized)) {
    return true;
  }

  const keywordHits = NAVIGATION_KEYWORDS.filter((keyword) =>
    normalized.includes(keyword),
  ).length;
  if (keywordHits >= 3) {
    return true;
  }

  const linkishTokenCount = (
    normalized.match(/\[[^\]]+\]|\([^)]+\)|https?:\/\/|www\.|\/[A-Za-z0-9_-]/g) ?? []
  ).length;
  if (linkishTokenCount >= 2) {
    return true;
  }

  const slashCount = (normalized.match(/[\\/]/g) ?? []).length;
  if (slashCount >= 4) {
    return true;
  }

  return false;
}

function normalizeWebTitle(value: string, hostname: string | null) {
  const cleaned = stripMarkdownArtifacts(value)
    .replace(/^[_\-·\s]+/, "")
    .replace(/\s*·\s*(www\.)?[\w.-]+\s*$/i, "")
    .trim();
  if (!cleaned) {
    return null;
  }

  const lowercase = cleaned.toLowerCase();
  if (NOISY_WEB_TITLES.has(lowercase)) {
    return null;
  }

  if (hostname && lowercase === hostname.toLowerCase()) {
    return null;
  }

  if (/^(https?:\/\/|www\.)/i.test(cleaned)) {
    return null;
  }

  return cleaned;
}

function collectMeaningfulWebLines(citation: ConversationMessageCitation) {
  return collectPreviewLines({
    quoteText: citation.quoteText,
    filterNoise: true,
    minimumPlainLength: 6,
  });
}

function buildWebCitationTitle(citation: ConversationMessageCitation, hostname: string | null) {
  const titleCandidates = [
    normalizeWebTitle(citation.sourceTitle ?? "", hostname),
    normalizeWebTitle(citation.label, hostname),
    ...collectMeaningfulWebLines(citation)
      .map((line) => normalizeWebTitle(line, hostname))
      .filter((line): line is string => Boolean(line)),
  ];

  return (
    titleCandidates.find((candidate) => Boolean(candidate)) ??
    simplifyHostnameForBadge(hostname) ??
    "网页来源"
  );
}

function buildWebCitationExcerpt(input: {
  citation: ConversationMessageCitation;
  hostname: string | null;
  title: string;
}) {
  const normalizedTitle = normalizePreviewComparisonText(input.title);
  const normalizedHostname = (input.hostname ?? "").toLowerCase();
  const lines = collectMeaningfulWebLines(input.citation).filter((line) => {
    const normalized = normalizePreviewComparisonText(line);
    return (
      normalized !== normalizedTitle &&
      !normalizedTitle.startsWith(normalized) &&
      !normalized.includes(normalizedTitle) &&
      normalized !== normalizedHostname
    );
  });
  return buildPreviewExcerptFromLines(lines);
}

function buildDocumentBadgeLabel(citation: ConversationMessageCitation) {
  const labelBase = stripMarkdownArtifacts(citation.label.split(" · ")[0] ?? "");
  if (!labelBase) {
    return "资料";
  }

  const filename = labelBase.split("/").filter(Boolean).at(-1) ?? labelBase;
  return filename.replace(/\.[a-z0-9]+$/i, "") || filename;
}

function buildDocumentCitationExcerpt(citation: ConversationMessageCitation) {
  return buildPreviewExcerptFromLines(
    collectPreviewLines({
      quoteText: citation.quoteText,
      filterNoise: false,
      minimumPlainLength: 2,
    }),
  );
}

export function isWebCitation(citation: ConversationMessageCitation) {
  return citation.sourceScope === KNOWLEDGE_SOURCE_SCOPE.WEB || Boolean(citation.sourceUrl);
}

export type CitationLinkTarget = {
  href: string;
};

export type CitationPreviewModel = {
  isWeb: boolean;
  badgeLabel: string;
  title: string;
  meta: string | null;
  excerpt: string | null;
  excerptFormat: "text" | "markdown";
};

export function buildCitationLinkTarget(input: {
  citation: ConversationMessageCitation;
  sourceLinksEnabled: boolean;
  workspaceId?: string | null;
}): CitationLinkTarget | null {
  if (!input.sourceLinksEnabled) {
    return null;
  }

  if (input.workspaceId && input.citation.documentId && input.citation.anchorId) {
    return {
      href: `/workspaces/${input.workspaceId}/documents/${input.citation.documentId}?anchorId=${input.citation.anchorId}`,
    };
  }

  if (input.citation.sourceUrl) {
    return {
      href: input.citation.sourceUrl,
    };
  }

  return null;
}

export function buildCitationBadgeSummary(citations: ConversationMessageCitation[]) {
  const firstCitation = citations[0] ?? null;
  if (!firstCitation) {
    return {
      label: "资料",
      extraCount: 0,
    };
  }

  if (isWebCitation(firstCitation)) {
    return {
      label: simplifyHostnameForBadge(readCitationHostname(firstCitation)) ?? "网页来源",
      extraCount: Math.max(0, citations.length - 1),
    };
  }

  return {
    label: buildDocumentBadgeLabel(firstCitation),
    extraCount: Math.max(0, citations.length - 1),
  };
}

export function buildCitationPreviewModel(
  citation: ConversationMessageCitation,
): CitationPreviewModel {
  if (isWebCitation(citation)) {
    const hostname = readCitationHostname(citation);
    const title = buildWebCitationTitle(citation, hostname);
    const excerpt = buildWebCitationExcerpt({
      citation,
      hostname,
      title,
    });

    return {
      isWeb: true,
      badgeLabel: simplifyHostnameForBadge(hostname) ?? "网页来源",
      title,
      meta: hostname,
      excerpt: excerpt.excerpt,
      excerptFormat: excerpt.excerptFormat,
    };
  }

  const excerpt = buildDocumentCitationExcerpt(citation);

  return {
    isWeb: false,
    badgeLabel: buildDocumentBadgeLabel(citation),
    title: stripMarkdownArtifacts(citation.label) || citation.label,
    meta: null,
    excerpt: excerpt.excerpt,
    excerptFormat: excerpt.excerptFormat,
  };
}
