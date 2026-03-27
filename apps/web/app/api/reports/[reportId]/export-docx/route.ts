import { asc, eq } from "drizzle-orm";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

import { getDb, reportSections } from "@law-doc/db";

import { auth } from "@/auth";
import { requireOwnedReport } from "@/lib/guards/resources";

export const runtime = "nodejs";

function normalizeParagraphText(text: string) {
  return text
    .replace(/^#+\s*/gm, "")
    .replace(/^\-\s*/gm, "• ")
    .trim();
}

function buildFilename(title: string) {
  const safe = title.replace(/[^\w\u4e00-\u9fa5.-]+/g, "_").replace(/_+/g, "_");
  return `${safe || "report"}.docx`;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const { reportId } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const report = await requireOwnedReport(reportId, userId);
  if (!report) {
    return Response.json({ error: "Report not found" }, { status: 404 });
  }

  const db = getDb();
  const sections = await db
    .select()
    .from(reportSections)
    .where(eq(reportSections.reportId, reportId))
    .orderBy(asc(reportSections.orderIndex));

  const children = [
    new Paragraph({
      text: report.title,
      heading: HeadingLevel.TITLE,
    }),
    ...sections.flatMap((section) => {
      const chunks = section.contentMarkdown
        .split(/\n{2,}/)
        .map((item) => normalizeParagraphText(item))
        .filter(Boolean);

      return [
        new Paragraph({
          text: section.title,
          heading: HeadingLevel.HEADING_1,
        }),
        ...(chunks.length > 0
          ? chunks.map(
              (chunk) =>
                new Paragraph({
                  children: [new TextRun(chunk)],
                }),
            )
          : [
              new Paragraph({
                children: [new TextRun("待补充内容")],
              }),
            ]),
      ];
    }),
  ];

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const filename = buildFilename(report.title);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}

export const GET = POST;
