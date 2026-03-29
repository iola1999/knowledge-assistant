import {
  groundedAnswerSchema,
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
    "Validated evidence JSON:",
    JSON.stringify(input.evidence, null, 2),
  ].join("\n");
}

export function normalizeGroundedAnswer(input: {
  parsed?: unknown;
  draftText: string;
  evidence: GroundedEvidence[];
}): GroundedAnswer {
  const evidenceByAnchorId = new Map(
    input.evidence.map((item) => [item.anchor_id, item] as const),
  );
  const parsed = groundedAnswerSchema.safeParse(input.parsed);
  const parsedData = parsed.success ? parsed.data : null;

  const citations =
    parsedData?.citations
      .map((citation) => evidenceByAnchorId.get(citation.anchor_id))
      .filter((citation): citation is GroundedEvidence => Boolean(citation))
      .filter(
        (citation, index, items) =>
          items.findIndex((item) => item.anchor_id === citation.anchor_id) === index,
      )
      .map((citation) => ({
        anchor_id: citation.anchor_id,
        label: citation.label,
        quote_text: citation.quote_text,
      })) ?? [];

  const answerMarkdown = uniqueStrings([
    parsedData?.answer_markdown ?? "",
    input.draftText,
    DEFAULT_UNSUPPORTED_ANSWER,
  ])[0];

  return {
    answer_markdown: answerMarkdown || DEFAULT_UNSUPPORTED_ANSWER,
    citations,
  };
}
