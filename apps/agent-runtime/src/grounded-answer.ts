import {
  buildDisplayInlineCitationToken,
  buildRawInlineCitationToken,
  extractRawInlineCitationSlots,
  groundedAnswerSchema,
  replaceRawInlineCitationTokens,
  type GroundedAnswer,
  type GroundedEvidence,
} from "@anchordesk/contracts";

const DEFAULT_UNSUPPORTED_ANSWER =
  "当前没有足够依据支持直接回答，请补充资料或调整检索范围。";

function uniqueStrings(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function uniqueEvidence(values: GroundedEvidence[]) {
  return values.filter(
    (value, index, items) =>
      items.findIndex((item) => item.evidence_id === value.evidence_id) === index,
  );
}

function buildEvidencePromptRegistry(evidence: GroundedEvidence[]) {
  return evidence.map((item, index) => ({
    citation_slot: index + 1,
    citation_token: buildRawInlineCitationToken(index + 1),
    evidence: item,
  }));
}

function normalizeForMatching(value: string) {
  return value.trim().toLowerCase();
}

function buildEvidenceMentionNeedles(evidence: GroundedEvidence) {
  if (evidence.kind === "web_page") {
    return [evidence.url, evidence.title, evidence.label].filter(
      (value) => value.trim().length >= 8,
    );
  }

  return [evidence.document_path, evidence.label].filter(
    (value) => value.trim().length >= 8,
  );
}

function collectMentionedEvidence(answerMarkdown: string, evidence: GroundedEvidence[]) {
  const haystack = normalizeForMatching(answerMarkdown);
  if (!haystack) {
    return [];
  }

  return evidence.filter((item) =>
    buildEvidenceMentionNeedles(item).some((needle) =>
      haystack.includes(normalizeForMatching(needle)),
    ),
  );
}

function rewriteInlineCitationTokens(input: {
  answerMarkdown: string;
  evidenceByPromptSlot: Map<number, GroundedEvidence>;
}) {
  const slotSequence = extractRawInlineCitationSlots(input.answerMarkdown);
  const citedEvidence = uniqueEvidence(
    slotSequence
      .map((slot) => input.evidenceByPromptSlot.get(slot))
      .filter((item): item is GroundedEvidence => Boolean(item)),
  );

  if (citedEvidence.length === 0) {
    return {
      answerMarkdown: input.answerMarkdown,
      citations: [] as GroundedEvidence[],
      hasInlineMarkers: false,
    };
  }

  const displayIndexByEvidenceId = new Map(
    citedEvidence.map((item, index) => [item.evidence_id, index + 1] as const),
  );
  const answerMarkdown = replaceRawInlineCitationTokens(
    input.answerMarkdown,
    (slot) => {
      const evidence = input.evidenceByPromptSlot.get(slot);
      if (!evidence) {
        return "";
      }

      const displayIndex = displayIndexByEvidenceId.get(evidence.evidence_id);
      return displayIndex ? buildDisplayInlineCitationToken(displayIndex) : "";
    },
  );

  return {
    answerMarkdown,
    citations: citedEvidence,
    hasInlineMarkers: true,
  };
}

function appendCitationCluster(
  answerMarkdown: string,
  citations: GroundedEvidence[],
) {
  if (citations.length === 0) {
    return answerMarkdown;
  }

  const cluster = citations
    .map((_, index) => buildDisplayInlineCitationToken(index + 1))
    .join("");
  const trimmedAnswer = answerMarkdown.trimEnd();
  if (!trimmedAnswer) {
    return cluster;
  }

  return /[。！？.!?：:）)]$/u.test(trimmedAnswer)
    ? `${trimmedAnswer}${cluster}`
    : `${trimmedAnswer} ${cluster}`;
}

export function buildGroundedAnswerPrompt(input: {
  prompt: string;
  draftText: string;
  evidence: GroundedEvidence[];
}) {
  return [
    "User question:",
    input.prompt,
    "",
    "Agent draft answer:",
    input.draftText || "(empty)",
    "",
    "Citation instructions:",
    [
      `- Use ${buildRawInlineCitationToken(1)} style markers in answer_markdown.`,
      "- Place markers immediately after the supported claim, sentence, or bullet.",
      "- Use only citation_slot values from the evidence registry below.",
      "- If one claim relies on multiple sources, place multiple markers consecutively.",
      "- Do not invent citation slots or evidence IDs.",
      `- Example: 俄方表示希望局势尽快和平解决${buildRawInlineCitationToken(1)}。`,
    ].join("\n"),
    "",
    "Validated evidence JSON:",
    JSON.stringify(buildEvidencePromptRegistry(input.evidence), null, 2),
  ].join("\n");
}

export function normalizeGroundedAnswer(input: {
  parsed?: unknown;
  draftText: string;
  evidence: GroundedEvidence[];
}): GroundedAnswer {
  const evidenceById = new Map(
    input.evidence.map((item) => [item.evidence_id, item] as const),
  );
  const evidenceByPromptSlot = new Map(
    input.evidence.map((item, index) => [index + 1, item] as const),
  );
  const parsed = groundedAnswerSchema.safeParse(input.parsed);
  const parsedData = parsed.success ? parsed.data : null;

  const answerMarkdown = uniqueStrings([
    parsedData?.answer_markdown ?? "",
    input.draftText,
    DEFAULT_UNSUPPORTED_ANSWER,
  ])[0];
  const inlineCitations = rewriteInlineCitationTokens({
    answerMarkdown,
    evidenceByPromptSlot,
  });
  const parsedCitations = uniqueEvidence(
    parsedData?.citations
      .map((citation) => evidenceById.get(citation.evidence_id))
      .filter((citation): citation is GroundedEvidence => Boolean(citation)) ?? [],
  );
  const mentionedCitations = uniqueEvidence(
    collectMentionedEvidence(inlineCitations.answerMarkdown, input.evidence),
  );
  const citations =
    inlineCitations.citations.length > 0
      ? inlineCitations.citations
      : parsedCitations.length > 0
        ? parsedCitations
        : mentionedCitations.length > 0
          ? mentionedCitations
          : input.evidence;
  const nextAnswerMarkdown =
    inlineCitations.hasInlineMarkers || citations.length === 0
      ? inlineCitations.answerMarkdown
      : appendCitationCluster(inlineCitations.answerMarkdown, citations);

  return {
    answer_markdown: nextAnswerMarkdown || DEFAULT_UNSUPPORTED_ANSWER,
    citations,
  };
}
