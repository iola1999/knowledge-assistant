"use client";

import { useEffect, useRef, useState } from "react";

import {
  buildPdfSearchResults,
  resolveInitialPdfPage,
  splitHighlightedText,
} from "@/lib/api/pdf-viewer";
import { buttonStyles, cn, textSelectionStyles, ui } from "@/lib/ui";

type PdfDocumentProxy = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<{
    getViewport: (options: { scale: number }) => { width: number; height: number };
    render: (options: {
      canvasContext: CanvasRenderingContext2D;
      viewport: unknown;
    }) => { promise: Promise<void> };
    getTextContent: () => Promise<{
      items: Array<{ str?: string }>;
    }>;
  }>;
};

type PdfJsModule = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (input: { url: string }) => {
    promise: Promise<PdfDocumentProxy>;
  };
};

export function PdfViewer({
  fileUrl,
  title,
  initialPage,
  highlightedText,
  children,
}: {
  fileUrl: string;
  title: string;
  initialPage: number;
  highlightedText?: string;
  children?: React.ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PdfDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [currentPageInput, setCurrentPageInput] = useState(String(initialPage));
  const [currentPageText, setCurrentPageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ pageNo: number; snippet: string }>>(
    [],
  );
  const [status, setStatus] = useState<string | null>("正在加载 PDF...");
  const [scale, setScale] = useState(1.2);
  const [pageTextCache, setPageTextCache] = useState<Record<number, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      try {
        setStatus("正在加载 PDF...");
        const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsModule;
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const loadedDocument = await pdfjs.getDocument({ url: fileUrl }).promise;
        if (cancelled) {
          return;
        }

        setPdfDocument(loadedDocument);
        setPageCount(loadedDocument.numPages);
        const nextPage = resolveInitialPdfPage({
          highlightedAnchorPage: initialPage,
          totalPages: loadedDocument.numPages,
        });
        setCurrentPage(nextPage);
        setCurrentPageInput(String(nextPage));
        setStatus(null);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "加载 PDF 失败");
      }
    }

    void loadPdf();

    return () => {
      cancelled = true;
    };
  }, [fileUrl, initialPage]);

  useEffect(() => {
    const documentProxy = pdfDocument;
    if (!documentProxy || !canvasRef.current) {
      return;
    }

    let cancelled = false;
    const activeDocument = documentProxy;

    async function renderPage() {
      const page = await activeDocument.getPage(currentPage);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({
        canvasContext: context,
        viewport,
      }).promise;

      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((item) => item.str ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (cancelled) {
        return;
      }

      setCurrentPageText(text);
      setPageTextCache((previous) =>
        previous[currentPage] === text ? previous : { ...previous, [currentPage]: text },
      );
    }

    void renderPage();

    return () => {
      cancelled = true;
    };
  }, [currentPage, pdfDocument, scale]);

  useEffect(() => {
    const documentProxy = pdfDocument;
    if (!documentProxy) {
      return;
    }

    const normalizedQuery = searchQuery.trim();
    if (!normalizedQuery) {
      setSearchResults([]);
      return;
    }

    let cancelled = false;
    const activeDocument = documentProxy;

    async function runSearch() {
      const pages: Array<{ pageNo: number; text: string }> = [];
      const nextCache = { ...pageTextCache };

      for (let pageNo = 1; pageNo <= activeDocument.numPages; pageNo += 1) {
        if (!nextCache[pageNo]) {
          const page = await activeDocument.getPage(pageNo);
          const textContent = await page.getTextContent();
          nextCache[pageNo] = textContent.items
            .map((item) => item.str ?? "")
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
        }

        pages.push({ pageNo, text: nextCache[pageNo] });
      }

      if (cancelled) {
        return;
      }

      setPageTextCache(nextCache);
      setSearchResults(buildPdfSearchResults(normalizedQuery, pages).slice(0, 12));
    }

    void runSearch();

    return () => {
      cancelled = true;
    };
  }, [pageTextCache, pdfDocument, searchQuery]);

  function jumpToPage(pageNo: number) {
    const nextPage = resolveInitialPdfPage({
      requestedPage: pageNo,
      totalPages: pageCount || 1,
    });

    setCurrentPage(nextPage);
    setCurrentPageInput(String(nextPage));
  }

  const highlightedSegments = splitHighlightedText(
    currentPageText || "当前页暂无可提取文本。",
    highlightedText?.trim() || searchQuery.trim(),
  );
  const currentPageTextMaxHeight = highlightedText ? "max-h-[280px]" : "max-h-[220px]";

  return (
    <div className="grid w-full gap-5 lg:grid-cols-[304px_minmax(0,1fr)] 2xl:grid-cols-[344px_minmax(0,1fr)_396px]">
      <div className="min-w-0 self-start lg:col-start-1 lg:row-start-1 xl:sticky xl:top-6">
        <div className="grid gap-3.5 rounded-[20px] border border-app-border/60 bg-white/40 p-3.5 shadow-soft backdrop-blur-sm md:p-4">
          <label className="flex flex-col gap-1.5">
            <span className="px-1 text-[13px] font-medium text-app-muted-strong">页内搜索</span>
            <input
              className={cn(ui.input, "bg-white/70")}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索当前 PDF 中的关键词"
            />
          </label>

          {searchResults.length > 0 ? (
            <div className="grid max-h-[calc(100vh-16rem)] gap-2 overflow-y-auto pr-1">
              {searchResults.map((result) => (
                <button
                  key={`${result.pageNo}-${result.snippet}`}
                  className="w-full min-w-0 rounded-[18px] border border-app-border/60 bg-white/55 px-3.5 py-2.5 text-left text-[13px] transition hover:border-app-border-strong hover:bg-white"
                  onClick={() => jumpToPage(result.pageNo)}
                  type="button"
                >
                  <strong className="mb-1 block text-app-text">第 {result.pageNo} 页</strong>
                  <span className="block break-words text-[13px] leading-relaxed text-app-muted line-clamp-4">
                    {result.snippet}
                  </span>
                </button>
              ))}
            </div>
          ) : searchQuery ? (
            <p className="px-1 text-[13px] text-app-muted">未找到相关内容。</p>
          ) : null}
        </div>
      </div>

      <div className="min-w-0 lg:col-start-2 lg:row-start-1 2xl:col-start-2 2xl:row-start-1 2xl:row-span-2">
        <div className="grid gap-4 rounded-[20px] border border-app-border/60 bg-white/40 p-3.5 shadow-soft backdrop-blur-sm md:p-4">
          <div className="flex flex-col gap-2.5 border-b border-app-border/40 pb-2.5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 grid gap-1">
              <h3 className="text-[14px] font-semibold text-app-text">PDF 阅读器</h3>
              <p className="max-w-full truncate text-[12px] text-app-muted sm:max-w-[320px]" title={title}>
                {title}
                {pageCount > 0 ? ` · 共 ${pageCount} 页` : ""}
              </p>
            </div>
            <div className="flex w-full flex-wrap items-center justify-start gap-1.5 rounded-xl border border-app-border/40 bg-app-surface-soft/50 p-1 lg:w-auto">
              <button
                className={buttonStyles({ variant: "ghost", size: "sm" })}
                disabled={currentPage <= 1}
                onClick={() => jumpToPage(currentPage - 1)}
                type="button"
              >
                上一页
              </button>
              <input
                className="h-7 w-[56px] rounded-lg border border-app-border/60 bg-white px-2 py-0 text-center text-[12px] outline-none focus:border-app-border-strong focus:ring-2 focus:ring-app-accent/10"
                inputMode="numeric"
                value={currentPageInput}
                onChange={(event) => setCurrentPageInput(event.target.value)}
                onBlur={() => jumpToPage(Number(currentPageInput))}
              />
              <button
                className={buttonStyles({ variant: "ghost", size: "sm" })}
                disabled={pageCount > 0 ? currentPage >= pageCount : true}
                onClick={() => jumpToPage(currentPage + 1)}
                type="button"
              >
                下一页
              </button>
              <div className="hidden h-4 w-px bg-app-border/60 lg:block" />
              <button
                className={buttonStyles({ variant: "ghost", size: "sm" })}
                disabled={scale <= 0.8}
                onClick={() => setScale((value) => Math.max(0.8, value - 0.2))}
                type="button"
              >
                缩小
              </button>
              <button
                className={buttonStyles({ variant: "ghost", size: "sm" })}
                onClick={() => setScale((value) => Math.min(2, value + 0.2))}
                type="button"
              >
                放大
              </button>
            </div>
          </div>

          {status ? <p className="px-1 text-[13px] text-app-muted">{status}</p> : null}

          <div className="overflow-y-auto overflow-x-hidden rounded-xl border border-app-border/50 bg-white p-2 shadow-sm">
            <canvas ref={canvasRef} className="block h-auto w-full max-w-full" />
          </div>
        </div>
      </div>

      <div className="min-w-0 self-start lg:col-span-2 lg:row-start-3 2xl:sticky 2xl:top-6 2xl:col-span-1 2xl:col-start-3 2xl:row-start-1 2xl:row-span-2">
        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3.5 overflow-hidden rounded-[20px] border border-app-border/60 bg-white/46 p-3.5 shadow-soft backdrop-blur-sm md:p-4 lg:max-h-[calc(100vh-3rem)]">
          <div className="grid gap-1.5 border-b border-app-border/40 pb-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="grid gap-1">
                <h3 className="text-[14px] font-semibold text-app-text">高亮与解析</h3>
                <p className="text-[12px] text-app-muted">第 {currentPage} 页</p>
              </div>
              {highlightedText ? (
                <span className={cn(ui.chipSoft, "shrink-0")}>已按引用高亮</span>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto overflow-x-hidden pr-1">
            <div className="grid gap-3.5">
              <div className="grid gap-2">
                <div className="flex items-center justify-between px-1">
                  <strong className="text-[13px] font-medium text-app-text">
                    第 {currentPage} 页文本
                  </strong>
                  <span className="text-[12px] text-app-muted">
                    {highlightedText ? "优先显示高亮片段" : "当前页完整提取"}
                  </span>
                </div>
                <div
                  className={cn(
                    "rounded-xl border border-app-border/60 bg-white/75 shadow-sm",
                    currentPageTextMaxHeight,
                  )}
                >
                  <div
                    className={cn(
                      textSelectionStyles.content,
                      "h-full overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-all [overflow-wrap:anywhere] p-3.5 text-[13px] leading-[1.75] text-app-text",
                    )}
                  >
                    {highlightedSegments.map((segment, index) =>
                      segment.highlighted ? (
                        <mark
                          key={`${segment.text}-${index}`}
                          className="rounded-sm bg-yellow-200/80 px-0.5 font-medium text-black"
                        >
                          {segment.text}
                        </mark>
                      ) : (
                        <span key={`${segment.text}-${index}`}>{segment.text}</span>
                      ),
                    )}
                  </div>
                </div>
              </div>

              {children ? (
                <div className="grid gap-2.5 border-t border-app-border/40 pt-3.5">
                  <div className="flex items-center justify-between gap-3 px-1">
                    <strong className="text-[13px] font-medium text-app-text">全部解析页</strong>
                    <span className="text-right text-[12px] text-app-muted">可继续滚动查看全部页面</span>
                  </div>
                  {children}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
