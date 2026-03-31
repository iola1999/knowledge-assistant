import Anthropic from "@anthropic-ai/sdk";
import {
  buildDisplayInlineCitationToken,
  replaceRawInlineCitationTokens,
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
  | "model_streamed";

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
  "Return Markdown only. Do not wrap the answer in JSON.",
  "Place inline citation markers using the exact citation_token values supplied in the evidence registry.",
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
}, hooks: {
  onTextDelta?: (input: {
    textDelta: string;
    fullText: string;
    displayText: string;
  }) => Promise<void> | void;
} = {}): Promise<RenderGroundedAnswerResult> {
  if (!getConfiguredAnthropicApiKey()) {
    throw new Error("Anthropic API key is not configured.");
  }

  let streamedText = "";

  try {
    const stream = await getAnthropicClient().messages.create({
      model: getModel(),
      max_tokens: getMaxTokens(),
      system: FINAL_ANSWER_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildGroundedAnswerPrompt(input),
        },
      ],
      stream: true,
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        streamedText += event.delta.text;
        await hooks.onTextDelta?.({
          textDelta: event.delta.text,
          fullText: streamedText,
          displayText: replaceRawInlineCitationTokens(streamedText, (slot) =>
            buildDisplayInlineCitationToken(slot),
          ),
        });
      }
    }

    return {
      groundedAnswer: normalizeGroundedAnswer({
        draftText: streamedText || input.draftText,
        evidence: input.evidence,
      }),
      meta: {
        mode: "model_streamed",
        parsedCitationReferenceCount: 0,
        parsedOutputPresent: streamedText.trim().length > 0,
      },
    };
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message.trim()
        ? error.message
        : "Grounded final answer render failed.",
    );
  }
}
