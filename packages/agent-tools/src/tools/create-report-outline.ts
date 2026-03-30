import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { createReportOutlineInputSchema } from "@anchordesk/contracts";
import { getConfiguredAnthropicApiKey } from "@anchordesk/db";

import {
  buildReportOutlinePrompt,
  normalizeOutlineSections,
} from "../report-generation";
import {
  getAnthropicClient,
  getReportModel,
  resolveEvidenceAnchors,
} from "../report-runtime";
import { buildToolFailure } from "../tool-output";

const DEFAULT_REPORT_OUTLINE_MAX_TOKENS = 900;

const REPORT_OUTLINE_SYSTEM_PROMPT = [
  "You generate a concise report outline for a grounded workspace assistant.",
  "Use the task and workspace evidence when they are available.",
  "Keep the outline practical and easy to execute.",
  "Do not invent citations, evidence, or section requirements that are not supported.",
].join("\n");

const reportOutlineModelSchema = z.object({
  title: z.string().trim().min(1),
  sections: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        section_key: z.string().trim().optional(),
      }),
    )
    .min(3)
    .max(6),
});

export async function createReportOutlineHandler(input: unknown) {
  const args = createReportOutlineInputSchema.parse(input);

  if (!getConfiguredAnthropicApiKey()) {
    return buildToolFailure(
      "REPORT_OUTLINE_NOT_CONFIGURED",
      "Anthropic API key is not configured for report generation.",
      false,
    );
  }

  try {
    const evidence = await resolveEvidenceAnchors({
      workspaceId: args.workspace_id,
      evidenceAnchorIds: args.evidence_anchor_ids,
      fallbackQuery: [args.title, args.task].filter(Boolean).join(" "),
    });
    const message = await getAnthropicClient().messages.parse({
      model: getReportModel(),
      max_tokens: DEFAULT_REPORT_OUTLINE_MAX_TOKENS,
      system: REPORT_OUTLINE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildReportOutlinePrompt({
            title: args.title,
            task: args.task,
            evidence,
          }),
        },
      ],
      output_config: {
        format: zodOutputFormat(reportOutlineModelSchema),
      },
    });
    const parsedOutput = message.parsed_output;
    if (!parsedOutput) {
      return buildToolFailure(
        "REPORT_OUTLINE_EMPTY",
        "Report outline generation returned no structured output.",
        true,
      );
    }

    const sections = normalizeOutlineSections(parsedOutput.sections);
    if (sections.length === 0) {
      return buildToolFailure(
        "REPORT_OUTLINE_EMPTY",
        "Report outline generation did not return any valid sections.",
        true,
      );
    }

    return {
      ok: true,
      outline: {
        title: parsedOutput.title.trim() || args.title,
        sections,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Report outline generation failed";
    return buildToolFailure("REPORT_OUTLINE_UNAVAILABLE", message, true);
  }
}
