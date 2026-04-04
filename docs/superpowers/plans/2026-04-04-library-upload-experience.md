# Library Upload Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add visible upload progress, longer document-upload presign windows, and actionable retry/error states for knowledge-base uploads.

**Architecture:** Keep the existing presign -> object storage PUT -> document job creation flow. Extract upload progress and retryable batch state into small client-side helpers, then wire the knowledge-base explorer modal to those helpers without changing the document-job contract.

**Tech Stack:** Next.js client components, browser `XMLHttpRequest`, Vitest, workspace storage presign routes

---

### Task 1: Harden Upload Helpers

**Files:**
- Create: `apps/web/lib/api/upload-file-request.ts`
- Create: `apps/web/lib/api/upload-file-request.test.ts`
- Create: `apps/web/lib/api/document-upload.ts`
- Create: `apps/web/lib/api/document-upload.test.ts`

- [ ] Write failing tests for byte-level upload progress and failed-item retry selection
- [ ] Implement the minimal helper code to satisfy those tests
- [ ] Re-run the helper tests and keep them green

### Task 2: Extend Presign Lifetime For Library Documents

**Files:**
- Modify: `packages/storage/src/index.ts`
- Create: `packages/storage/src/index.test.ts`
- Modify: `apps/web/app/api/workspaces/[workspaceId]/uploads/presign/route.ts`
- Modify: `apps/web/app/api/knowledge-libraries/[libraryId]/uploads/presign/route.ts`

- [ ] Write failing tests for default and overridden presign expiry handling
- [ ] Implement the minimal storage helper change and route usage
- [ ] Re-run the storage tests and keep them green

### Task 3: Wire The Knowledge-Base Upload Modal

**Files:**
- Modify: `apps/web/components/workspaces/knowledge-base-explorer.tsx`
- Modify: `apps/web/lib/api/document-jobs.test.ts`

- [ ] Refactor the modal to show per-file progress and error rows using the new helpers
- [ ] Add retry-failed-items behavior without re-uploading successful files
- [ ] Re-run targeted tests, then run typecheck/build verification for the touched surface
