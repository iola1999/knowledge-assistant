import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  MESSAGE_ROLE,
  groundedAnswerSchema,
  type GroundedAnswer,
  type GroundedEvidence,
} from "@anchordesk/contracts";
import {
  buildAnthropicClientConfig,
  getConfiguredAnthropicApiKey,
} from "@anchordesk/db";

import {
  buildGroundedAnswerPrompt,
  normalizeGroundedAnswer,
} from "./grounded-answer";

export type FinalAnswerRenderMode =
  | "model_parsed"
  | "model_error_fallback"
  | "missing_api_key_fallback";

export type RenderGroundedAnswerResult = {
  groundedAnswer: GroundedAnswer;
  meta: {
    mode: FinalAnswerRenderMode;
    parsedCitationReferenceCount: number;
    parsedOutputPresent: boolean;
  };
};

function getModel() {
  return (
    process.env.ANTHROPIC_FINAL_ANSWER_MODEL ??
    process.env.ANTHROPIC_MODEL ??
    "claude-sonnet-4-5"
  );
}

function getMaxTokens() {
  const n = Number(process.env.ANTHROPIC_FINAL_ANSWER_MAX_TOKENS ?? "1400");
  return Number.isFinite(n) ? n : 1400;
}

const FINAL_ANSWER_SYSTEM_PROMPT = [
  "You render the final answer for a grounded workspace assistant.",
  "Use only the validated evidence supplied by the application.",
  "Never invent anchor IDs, directory paths, quotes, or citations.",
  "If a citation is not supported by the provided evidence list, omit it.",
  "Return JSON matching the requested schema.",
  "In answer_markdown, place inline citation markers using the exact citation_token values supplied in the evidence registry.",
  "In citations, include only evidence_id values that were actually used.",
  "Keep the answer concise, professional, and explicit about uncertainty.",
].join("\n");

let anthropicClient: Anthropic | null = null;

function getAnthropicClient() {
  if (!anthropicClient) {
    anthropicClient = new Anthropic(buildAnthropicClientConfig());
  }

  return anthropicClient;
}

export async function renderGroundedAnswer(input: {
  prompt: string;
  draftText: string;
  evidence: GroundedEvidence[];
}): Promise<RenderGroundedAnswerResult> {
  if (!getConfiguredAnthropicApiKey()) {
    return {
      groundedAnswer: normalizeGroundedAnswer({
        draftText: input.draftText,
        evidence: input.evidence,
      }),
      meta: {
        mode: "missing_api_key_fallback",
        parsedCitationReferenceCount: 0,
        parsedOutputPresent: false,
      },
    };
  }

  try {
    const message = await getAnthropicClient().messages.parse({
      model: getModel(),
      max_tokens: getMaxTokens(),
      system: FINAL_ANSWER_SYSTEM_PROMPT,
      messages: [
        {
          role: MESSAGE_ROLE.USER,
          content: buildGroundedAnswerPrompt(input),
        },
      ],
      output_config: {
        format: zodOutputFormat(groundedAnswerSchema),
      },
    });

    return {
      groundedAnswer: normalizeGroundedAnswer({
        parsed: message.parsed_output,
        draftText: input.draftText,
        evidence: input.evidence,
      }),
      meta: {
        mode: "model_parsed",
        parsedCitationReferenceCount: Array.isArray(message.parsed_output?.citations)
          ? message.parsed_output.citations.length
          : 0,
        parsedOutputPresent: Boolean(message.parsed_output),
      },
    };
  } catch {
    return {
      groundedAnswer: normalizeGroundedAnswer({
        draftText: input.draftText,
        evidence: input.evidence,
      }),
      meta: {
        mode: "model_error_fallback",
        parsedCitationReferenceCount: 0,
        parsedOutputPresent: false,
      },
    };
  }
}
