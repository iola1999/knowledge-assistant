import { eq } from "drizzle-orm";

import { searchConversationAttachmentsInputSchema } from "@anchordesk/contracts";
import {
  citationAnchors,
  conversationAttachments,
  documentChunks,
  documents,
  getDb,
} from "@anchordesk/db";
import { searchLocalChunks } from "@anchordesk/retrieval";

import { buildToolFailure } from "../tool-output";

export async function searchConversationAttachmentsHandler(input: unknown) {
  const args = searchConversationAttachmentsInputSchema.parse(input);
  const db = getDb();

  try {
    const hydrated = await db
      .select({
        anchorId: citationAnchors.id,
        libraryId: documents.libraryId,
        chunkId: documentChunks.id,
        documentId: documents.id,
        documentVersionId: documentChunks.documentVersionId,
        documentPath: citationAnchors.documentPath,
        documentTitle: documents.title,
        anchorLabel: citationAnchors.anchorLabel,
        pageNo: citationAnchors.pageNo,
        sectionLabel: documentChunks.sectionLabel,
        headingPath: documentChunks.headingPath,
        docType: documents.docType,
        keywords: documentChunks.keywords,
        snippet: citationAnchors.anchorText,
      })
      .from(conversationAttachments)
      .innerJoin(
        documentChunks,
        eq(documentChunks.documentVersionId, conversationAttachments.documentVersionId),
      )
      .innerJoin(citationAnchors, eq(citationAnchors.chunkId, documentChunks.id))
      .innerJoin(documents, eq(documents.id, conversationAttachments.documentId))
      .where(eq(conversationAttachments.conversationId, args.conversation_id));

    const ranked = searchLocalChunks({
      query: args.query,
      topK: args.top_k,
      chunks: hydrated.map((row) => ({
        anchorId: row.anchorId,
        chunkId: row.chunkId,
        documentId: row.documentId,
        documentVersionId: row.documentVersionId,
        documentPath: row.documentPath,
        libraryId: row.libraryId ?? "",
        pageStart: row.pageNo,
        pageEnd: row.pageNo,
        sectionLabel: row.sectionLabel ?? null,
        headingPath: row.headingPath ?? [],
        docType: row.docType,
        keywords: row.keywords ?? [],
        snippet: row.snippet,
      })),
    });

    const hydratedByAnchorId = new Map(
      hydrated.map((item) => [item.anchorId, item] as const),
    );

    return {
      ok: true,
      results: ranked
        .map((item) => {
          const row = hydratedByAnchorId.get(item.anchorId);
          if (!row) {
            return null;
          }

          return {
            anchor_id: row.anchorId,
            document_id: row.documentId,
            document_title: row.documentTitle,
            document_path: row.documentPath,
            anchor_label: row.anchorLabel,
            page_no: row.pageNo,
            section_label: row.sectionLabel ?? null,
            snippet: row.snippet,
            score: item.score,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Conversation attachment search failed";
    return buildToolFailure("CONVERSATION_ATTACHMENT_SEARCH_UNAVAILABLE", message, true);
  }
}
