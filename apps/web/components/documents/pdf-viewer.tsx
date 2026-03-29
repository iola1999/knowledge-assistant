"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  buildPdfSearchResults,
  resolveInitialPdfPage,
  splitHighlightedText,
} from "@/lib/api/pdf-viewer";
import { buttonStyles, cn, ui } from "@/lib/ui";

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

  return (
    <div className="flex flex-col lg:flex-row items-start gap-6 w-full">
      {/* 左侧独立搜索大纲区 */}
      <div className="w-full shrink-0 min-w-0 lg:w-[280px] xl:w-[320px] pb-6">
        <div className="sticky top-6 grid gap-4 min-w-0 w-full max-w-full">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-app-muted-strong px-1">页内搜索</span>
            <input
              className={cn(ui.input, "bg-white/60")}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索当前 PDF 中的关键词"
            />
          </label>

          {searchResults.length > 0 ? (
            <div className="grid gap-2">
              {searchResults.map((result) => (
                <button
                  key={`${result.pageNo}-${result.snippet}`}
                  className="w-full min-w-0 rounded-2xl border border-app-border/60 bg-white/40 px-4 py-3 text-left text-sm hover:border-app-border-strong hover:bg-white transition whitespace-normal break-words break-all"
                  onClick={() => jumpToPage(result.pageNo)}
                  type="button"
                >
                  <strong className="text-app-text block mb-1">第 {result.pageNo} 页</strong>
                  <span className="text-app-muted text-[13px] leading-relaxed block line-clamp-4 break-words">
                    {result.snippet}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            searchQuery ? <p className="text-[13px] text-app-muted px-1">未找到相关内容。</p> : null
          )}
        </div>
      </div>

      {/* 中间主要层 */}
      <div className="grid min-w-0 flex-1 gap-6">
        <div className="grid gap-5 rounded-2xl border border-app-border/60 bg-white/40 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-app-border/40 pb-3">
            <div className="grid gap-1">
              <h3 className="text-[15px] font-semibold text-app-text">PDF 阅读器</h3>
              <p className="text-[12px] text-app-muted truncate max-w-[300px]" title={title}>
                {title}
                {pageCount > 0 ? ` · 共 ${pageCount} 页` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 shrink-0 bg-app-surface-soft/50 p-1 rounded-xl border border-app-border/40">
              <button
                className={buttonStyles({ variant: "ghost", size: "sm" })}
                disabled={currentPage <= 1}
                onClick={() => jumpToPage(currentPage - 1)}
                type="button"
              >
                上一页
              </button>
              <input
                className="h-8 w-[60px] rounded-lg border border-app-border/60 bg-white px-2 py-0 text-center text-[13px] outline-none focus:border-app-border-strong focus:ring-2 focus:ring-app-accent/10"
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
              <div className="w-px h-4 bg-app-border/60 mx-1" />
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

        {status ? <p className="text-[13px] text-app-muted px-1">{status}</p> : null}
        
        <div className="overflow-auto rounded-xl border border-app-border/50 bg-white p-2 shadow-sm">
          <canvas ref={canvasRef} className="block h-auto w-full max-w-none" />
        </div>

        <div className="grid gap-2.5">
          <div className="flex items-center justify-between px-1">
            <strong className="text-[13px] font-medium text-app-text">第 {currentPage} 页文本</strong>
            {highlightedText ? <span className="text-[12px] text-app-muted">已按引用内容高亮</span> : null}
          </div>
            <div className="rounded-xl border border-app-border/60 bg-white/70 p-4 leading-[1.8] text-[14px] text-app-text shadow-sm">
            {highlightedSegments.map((segment, index) =>
              segment.highlighted ? (
                <mark key={`${segment.text}-${index}`} className="bg-yellow-200/80 text-black font-medium rounded-sm px-0.5">{segment.text}</mark>
              ) : (
                <span key={`${segment.text}-${index}`}>{segment.text}</span>
              ),
            )}
          </div>
        </div>
      </div>

      {children}
    </div>
  </div>
  );
}
