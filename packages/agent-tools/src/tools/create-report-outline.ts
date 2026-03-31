import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { createReportOutlineInputSchema } from "@anchordesk/contracts";

import {
  buildReportOutlinePrompt,
  normalizeOutlineSections,
} from "../report-generation";
import {
  getReportModelRuntime,
  resolveEvidenceAnchors,
} from "../report-runtime";
import type { AssistantToolRuntimeContext } from "../runtime-context";
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

export async function createReportOutlineHandler(
  input: unknown,
  context: AssistantToolRuntimeContext = {},
) {
  const args = createReportOutlineInputSchema.parse(input);
  let reportRuntime;

  try {
    reportRuntime = await getReportModelRuntime(context.modelProfile);
  } catch (error) {
    return buildToolFailure(
      "REPORT_OUTLINE_NOT_CONFIGURED",
      error instanceof Error && error.message
        ? error.message
        : "Report outline model profile is not configured.",
      false,
    );
  }

  try {
    const evidence = await resolveEvidenceAnchors({
      workspaceId: args.workspace_id,
      evidenceAnchorIds: args.evidence_anchor_ids,
      fallbackQuery: [args.title, args.task].filter(Boolean).join(" "),
    });
    const message = await reportRuntime.client.messages.parse({
      model: reportRuntime.model,
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
