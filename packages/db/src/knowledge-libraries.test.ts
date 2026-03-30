import { describe, expect, test } from "vitest";

import { computeWorkspaceLibraryScope } from "./knowledge-libraries";

describe("computeWorkspaceLibraryScope", () => {
  test("includes the workspace private library and active searchable global subscriptions", () => {
    expect(
      computeWorkspaceLibraryScope({
        workspaceId: "workspace-1",
        libraries: [
          {
            id: "library-private",
            libraryType: "workspace_private",
            status: "active",
            workspaceId: "workspace-1",
          },
          {
            id: "library-global-active",
            libraryType: "global_managed",
            status: "active",
            workspaceId: null,
          },
          {
            id: "library-global-archived",
            libraryType: "global_managed",
            status: "archived",
            workspaceId: null,
          },
        ],
        subscriptions: [
          {
            workspaceId: "workspace-1",
            libraryId: "library-global-active",
            status: "active",
            searchEnabled: true,
          },
          {
            workspaceId: "workspace-1",
            libraryId: "library-global-archived",
            status: "active",
            searchEnabled: true,
          },
        ],
      }),
    ).toEqual({
      privateLibraryId: "library-private",
      accessibleLibraryIds: ["library-private", "library-global-active"],
      subscribedLibraryIds: ["library-global-active"],
      searchableLibraryIds: ["library-private", "library-global-active"],
    });
  });

  test("keeps paused subscriptions accessible but removes them from searchable scope", () => {
    expect(
      computeWorkspaceLibraryScope({
        workspaceId: "workspace-1",
        libraries: [
          {
            id: "library-private",
            libraryType: "workspace_private",
            status: "active",
            workspaceId: "workspace-1",
          },
          {
            id: "library-global-paused",
            libraryType: "global_managed",
            status: "active",
            workspaceId: null,
          },
        ],
        subscriptions: [
          {
            workspaceId: "workspace-1",
            libraryId: "library-global-paused",
            status: "paused",
            searchEnabled: true,
          },
        ],
      }),
    ).toEqual({
      privateLibraryId: "library-private",
      accessibleLibraryIds: ["library-private", "library-global-paused"],
      subscribedLibraryIds: ["library-global-paused"],
      searchableLibraryIds: ["library-private"],
    });
  });

  test("ignores revoked or search-disabled subscriptions", () => {
    expect(
      computeWorkspaceLibraryScope({
        workspaceId: "workspace-1",
        libraries: [
          {
            id: "library-private",
            libraryType: "workspace_private",
            status: "active",
            workspaceId: "workspace-1",
          },
          {
            id: "library-global-revoked",
            libraryType: "global_managed",
            status: "active",
            workspaceId: null,
          },
          {
            id: "library-global-hidden",
            libraryType: "global_managed",
            status: "active",
            workspaceId: null,
          },
        ],
        subscriptions: [
          {
            workspaceId: "workspace-1",
            libraryId: "library-global-revoked",
            status: "revoked",
            searchEnabled: true,
          },
          {
            workspaceId: "workspace-1",
            libraryId: "library-global-hidden",
            status: "active",
            searchEnabled: false,
          },
        ],
      }),
    ).toEqual({
      privateLibraryId: "library-private",
      accessibleLibraryIds: ["library-private", "library-global-hidden"],
      subscribedLibraryIds: ["library-global-hidden"],
      searchableLibraryIds: ["library-private"],
    });
  });
});
