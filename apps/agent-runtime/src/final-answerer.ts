import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  MESSAGE_ROLE,
  groundedAnswerSchema,
  type GroundedAnswer,
  type GroundedEvidence,
} from "@knowledge-assistant/contracts";

import {
  buildGroundedAnswerPrompt,
  normalizeGroundedAnswer,
} from "./grounded-answer";

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
  "If the evidence is insufficient, set unsupported_reason to a concrete explanation.",
  "If a citation is not supported by the provided evidence list, omit it.",
  "Keep the answer concise, professional, and explicit about uncertainty.",
].join("\n");

let anthropicClient: Anthropic | null = null;

function getAnthropicClient() {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  return anthropicClient;
}

export async function renderGroundedAnswer(input: {
  prompt: string;
  draftText: string;
  evidence: GroundedEvidence[];
}): Promise<GroundedAnswer> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return normalizeGroundedAnswer({
      draftText: input.draftText,
      evidence: input.evidence,
    });
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

    return normalizeGroundedAnswer({
      parsed: message.parsed_output,
      draftText: input.draftText,
      evidence: input.evidence,
    });
  } catch {
    return normalizeGroundedAnswer({
      draftText: input.draftText,
      evidence: input.evidence,
    });
  }
}
