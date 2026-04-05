import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_PARSE_STATUS,
  DOCUMENT_STATUS,
  RUN_STATUS,
} from "@anchordesk/contracts";

const mocks = vi.hoisted(() => {
  const tables = {
    documentJobs: Symbol("documentJobs"),
    documentVersions: Symbol("documentVersions"),
    documents: Symbol("documents"),
  };

  const updates: Array<{ table: unknown; values: unknown }> = [];

  const auth = vi.fn();
  const requireOwnedDocumentJob = vi.fn();
  const requireSuperAdminManagedDocumentJob = vi.fn();
  const isSuperAdmin = vi.fn();
  const enqueueIngestFlow = vi.fn();
  const withProducerSpan = vi.fn(async (_input, callback: () => Promise<unknown>) => callback());

  const db = {
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: unknown) => ({
        where: vi.fn(async () => {
          updates.push({ table, values });
          return [];
        }),
      })),
    })),
  };

  return {
    auth,
    db,
    enqueueIngestFlow,
    isSuperAdmin,
    requireOwnedDocumentJob,
    requireSuperAdminManagedDocumentJob,
    tables,
    updates,
    withProducerSpan,
  };
});

vi.mock("@/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/guards/resources", () => ({
  requireOwnedDocumentJob: mocks.requireOwnedDocumentJob,
  requireSuperAdminManagedDocumentJob: mocks.requireSuperAdminManagedDocumentJob,
}));

vi.mock("@/lib/auth/super-admin", () => ({
  isSuperAdmin: mocks.isSuperAdmin,
}));

vi.mock("@anchordesk/db", () => ({
  documentJobs: mocks.tables.documentJobs,
  documentVersions: mocks.tables.documentVersions,
  documents: mocks.tables.documents,
  getDb: () => mocks.db,
}));

vi.mock("@anchordesk/queue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anchordesk/queue")>();
  return {
    ...actual,
    enqueueIngestFlow: mocks.enqueueIngestFlow,
  };
});

vi.mock("@anchordesk/tracing", () => ({
  withProducerSpan: mocks.withProducerSpan,
}));

let POST: typeof import("../../app/api/document-jobs/[jobId]/retry/route").POST;

beforeAll(async () => {
  ({ POST } = await import("../../app/api/document-jobs/[jobId]/retry/route"));
});

beforeEach(() => {
  mocks.updates.length = 0;
  mocks.auth.mockReset();
  mocks.requireOwnedDocumentJob.mockReset();
  mocks.requireSuperAdminManagedDocumentJob.mockReset();
  mocks.isSuperAdmin.mockReset();
  mocks.enqueueIngestFlow.mockReset();
  mocks.withProducerSpan.mockClear();
});

describe("POST /api/document-jobs/[jobId]/retry", () => {
  it("rejects completed jobs unless forceReparse is requested", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "user-1" },
    });
    mocks.requireOwnedDocumentJob.mockResolvedValue({
      id: "job-1",
      status: RUN_STATUS.COMPLETED,
      documentVersionId: "version-1",
      documentId: "document-1",
      workspaceId: "workspace-1",
      libraryId: "library-1",
      metadataJson: {
        indexing_mode: "full",
      },
    });
    mocks.isSuperAdmin.mockReturnValue(false);

    const response = await POST(new Request("http://localhost/api/document-jobs/job-1/retry", {
      method: "POST",
    }), {
      params: Promise.resolve({ jobId: "job-1" }),
    });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("Only failed jobs can be retried");
    expect(mocks.enqueueIngestFlow).not.toHaveBeenCalled();
  });

  it("allows force reparse for completed jobs and enqueues the flow with cache bypass", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "user-1" },
    });
    mocks.requireOwnedDocumentJob.mockResolvedValue({
      id: "job-2",
      status: RUN_STATUS.COMPLETED,
      documentVersionId: "version-2",
      documentId: "document-2",
      workspaceId: "workspace-2",
      libraryId: "library-2",
      metadataJson: {
        indexing_mode: "full",
      },
    });
    mocks.isSuperAdmin.mockReturnValue(false);
    mocks.enqueueIngestFlow.mockResolvedValue({ id: "queue-job-1" });

    const response = await POST(
      new Request("http://localhost/api/document-jobs/job-2/retry", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          forceReparse: true,
        }),
      }),
      {
        params: Promise.resolve({ jobId: "job-2" }),
      },
    );
    const body = (await response.json()) as { ok: true };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: mocks.tables.documentJobs,
          values: expect.objectContaining({
            stage: DEFAULT_PARSE_STATUS,
            status: RUN_STATUS.QUEUED,
            progress: 0,
            queueJobId: expect.stringMatching(/^version-2--.+--parse$/),
          }),
        }),
        expect.objectContaining({
          table: mocks.tables.documentVersions,
          values: expect.objectContaining({
            parseStatus: DEFAULT_PARSE_STATUS,
          }),
        }),
        expect.objectContaining({
          table: mocks.tables.documents,
          values: expect.objectContaining({
            status: DOCUMENT_STATUS.PROCESSING,
          }),
        }),
      ]),
    );
    const documentJobUpdate = mocks.updates.find(
      (entry) => entry.table === mocks.tables.documentJobs,
    );
    const queueRunId = mocks.enqueueIngestFlow.mock.calls[0]?.[0]?.queueRunId;

    expect(queueRunId).toEqual(expect.any(String));
    expect(documentJobUpdate?.values).toEqual(
      expect.objectContaining({
        queueJobId: `version-2--${queueRunId}--parse`,
      }),
    );
    expect(mocks.enqueueIngestFlow).toHaveBeenCalledWith({
      workspaceId: "workspace-2",
      libraryId: "library-2",
      documentId: "document-2",
      documentVersionId: "version-2",
      indexingMode: "full",
      forceReparse: true,
      queueRunId: expect.any(String),
    });
  });
});
