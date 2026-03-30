import { eq } from "drizzle-orm";

import { readCitationAnchorInputSchema } from "@anchordesk/contracts";
import { citationAnchors, documentBlocks, documents, getDb } from "@anchordesk/db";

import { readCitationLocator } from "../citation-locator";
import { buildToolFailure } from "../tool-output";

export async function readCitationAnchorHandler(input: unknown) {
  const args = readCitationAnchorInputSchema.parse(input);
  const db = getDb();

  const result = await db
    .select({
      anchorId: citationAnchors.id,
      documentId: citationAnchors.documentId,
      documentPath: citationAnchors.documentPath,
      pageNo: citationAnchors.pageNo,
      anchorText: citationAnchors.anchorText,
      anchorLabel: citationAnchors.anchorLabel,
      bboxJson: citationAnchors.bboxJson,
      blockMetadataJson: documentBlocks.metadataJson,
      documentTitle: documents.title,
    })
    .from(citationAnchors)
    .innerJoin(documents, eq(documents.id, citationAnchors.documentId))
    .leftJoin(documentBlocks, eq(documentBlocks.id, citationAnchors.blockId))
    .where(eq(citationAnchors.id, args.anchor_id))
    .limit(1);

  const anchor = result[0];
  if (!anchor) {
    return buildToolFailure("ANCHOR_NOT_FOUND", "Anchor not found", false);
  }

  return {
    ok: true,
    anchor: {
      anchor_id: anchor.anchorId,
      document_id: anchor.documentId,
      document_title: anchor.documentTitle,
      document_path: anchor.documentPath,
      anchor_label: anchor.anchorLabel,
      page_no: anchor.pageNo,
      bbox: anchor.bboxJson ?? null,
      locator: readCitationLocator(
        (anchor.blockMetadataJson as Record<string, unknown> | null | undefined) ?? null,
      ),
      text: anchor.anchorText,
      context_before: "",
      context_after: "",
    },
  };
}
