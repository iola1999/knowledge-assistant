type ViewerBlockInput = {
  id: string;
  pageNo: number;
  orderIndex: number;
  blockType: string;
  text: string;
  headingPath: string[] | null;
  sectionLabel: string | null;
  metadataJson?: Record<string, unknown> | null;
};

type ViewerAnchorInput = {
  id: string;
  pageNo: number;
  blockId: string | null;
  anchorText: string;
  anchorLabel: string;
};

type DocumentViewerPageInput = {
  blocks: ViewerBlockInput[];
  anchors: ViewerAnchorInput[];
  highlightedAnchorId?: string;
};

export type DocumentViewerPage = {
  pageNo: number;
  blocks: Array<
    ViewerBlockInput & {
      headingPath: string[];
      anchorCount: number;
      isHighlighted: boolean;
    }
  >;
  anchors: Array<
    ViewerAnchorInput & {
      isHighlighted: boolean;
    }
  >;
};

export function buildDocumentViewerPages(
  input: DocumentViewerPageInput,
): DocumentViewerPage[] {
  const anchorsByPage = new Map<number, Array<DocumentViewerPage["anchors"][number]>>();
  const highlightedBlockIds = new Set<string>();

  for (const anchor of input.anchors) {
    const item = {
      ...anchor,
      isHighlighted: anchor.id === input.highlightedAnchorId,
    };
    const pageAnchors = anchorsByPage.get(anchor.pageNo) ?? [];
    pageAnchors.push(item);
    anchorsByPage.set(anchor.pageNo, pageAnchors);

    if (item.isHighlighted && anchor.blockId) {
      highlightedBlockIds.add(anchor.blockId);
    }
  }

  const anchorCountByBlockId = new Map<string, number>();
  for (const anchor of input.anchors) {
    if (!anchor.blockId) {
      continue;
    }

    anchorCountByBlockId.set(
      anchor.blockId,
      (anchorCountByBlockId.get(anchor.blockId) ?? 0) + 1,
    );
  }

  const pages = new Map<number, DocumentViewerPage>();
  for (const block of input.blocks) {
    const page =
      pages.get(block.pageNo) ??
      {
        pageNo: block.pageNo,
        blocks: [],
        anchors: anchorsByPage.get(block.pageNo) ?? [],
      };

    page.blocks.push({
      ...block,
      headingPath: block.headingPath ?? [],
      anchorCount: anchorCountByBlockId.get(block.id) ?? 0,
      isHighlighted: highlightedBlockIds.has(block.id),
    });
    pages.set(block.pageNo, page);
  }

  for (const [pageNo, anchors] of anchorsByPage.entries()) {
    if (!pages.has(pageNo)) {
      pages.set(pageNo, {
        pageNo,
        blocks: [],
        anchors,
      });
    }
  }

  return Array.from(pages.values())
    .sort((left, right) => left.pageNo - right.pageNo)
    .map((page) => ({
      ...page,
      blocks: [...page.blocks].sort(
        (left, right) => left.orderIndex - right.orderIndex,
      ),
      anchors: [...page.anchors],
    }));
}
