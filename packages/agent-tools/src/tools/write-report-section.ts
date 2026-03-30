import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { writeReportSectionInputSchema } from "@anchordesk/contracts";
import {
  getConfiguredAnthropicApiKey,
  getDb,
  reports,
  reportSections,
} from "@anchordesk/db";

import {
  buildReportSectionMarkdown,
  buildReportSectionPrompt,
} from "../report-generation";
import {
  getAnthropicClient,
  getReportModel,
  resolveEvidenceAnchors,
} from "../report-runtime";
import { buildToolFailure, uniqueStrings } from "../tool-output";

const DEFAULT_REPORT_SECTION_MAX_TOKENS = 1_400;

const REPORT_SECTION_SYSTEM_PROMPT = [
  "You draft a single report section for a grounded workspace assistant.",
  "Use only the provided evidence dossier.",
  "If evidence is insufficient, say so plainly and list the missing information.",
  "Never invent anchor IDs, quotes, or claims beyond the evidence dossier.",
].join("\n");

const reportSectionModelSchema = z.object({
  markdown_body: z.string().trim().min(1),
  citation_anchor_ids: z.array(z.string().uuid()).default([]),
  missing_information: z.array(z.string().trim().min(1)).default([]),
});

export async function writeReportSectionHandler(input: unknown) {
  const args = writeReportSectionInputSchema.parse(input);
  const db = getDb();
  const [reportSection] = await db
    .select({
      reportTitle: reports.title,
      workspaceId: reports.workspaceId,
      title: reportSections.title,
    })
    .from(reportSections)
    .innerJoin(reports, eq(reports.id, reportSections.reportId))
    .where(and(eq(reportSections.id, args.section_id), eq(reports.id, args.report_id)))
    .limit(1);

  if (!reportSection) {
    return buildToolFailure("REPORT_SECTION_NOT_FOUND", "Report section not found.", false);
  }

  if (!getConfiguredAnthropicApiKey()) {
    return buildToolFailure(
      "REPORT_SECTION_NOT_CONFIGURED",
      "Anthropic API key is not configured for report generation.",
      false,
    );
  }

  try {
    const evidence = await resolveEvidenceAnchors({
      workspaceId: reportSection.workspaceId,
      evidenceAnchorIds: args.evidence_anchor_ids,
      fallbackQuery: [reportSection.reportTitle, reportSection.title, args.instruction]
        .filter(Boolean)
        .join(" "),
    });
    const evidenceById = new Map(
      evidence.map((item) => [item.anchor_id, item] as const),
    );
    const message = await getAnthropicClient().messages.parse({
      model: getReportModel(),
      max_tokens: DEFAULT_REPORT_SECTION_MAX_TOKENS,
      system: REPORT_SECTION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildReportSectionPrompt({
            reportTitle: reportSection.reportTitle,
            sectionTitle: reportSection.title,
            instruction: args.instruction,
            evidence,
          }),
        },
      ],
      output_config: {
        format: zodOutputFormat(reportSectionModelSchema),
      },
    });
    const parsedOutput = message.parsed_output;
    if (!parsedOutput) {
      return buildToolFailure(
        "REPORT_SECTION_EMPTY",
        "Report section generation returned no structured output.",
        true,
      );
    }

    const citations = uniqueStrings(parsedOutput.citation_anchor_ids)
      .map((anchorId) => evidenceById.get(anchorId))
      .filter((item): item is NonNullable<typeof item> => item !== undefined)
      .map((item) => ({
        anchor_id: item.anchor_id,
        label: item.label,
      }));
    const markdown = buildReportSectionMarkdown({
      title: reportSection.title,
      body: parsedOutput.markdown_body,
      citations,
      missingInformation: parsedOutput.missing_information,
    });

    return {
      ok: true,
      section: {
        markdown,
        citations,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Report section generation failed";
    return buildToolFailure("REPORT_SECTION_UNAVAILABLE", message, true);
  }
}
