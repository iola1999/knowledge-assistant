// @vitest-environment jsdom

import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const composerSpy = vi.fn();

vi.mock("@anchordesk/contracts", () => ({
  MESSAGE_STATUS: {
    STREAMING: "streaming",
  },
}));

vi.mock("./composer", () => ({
  Composer: (props: { rows?: number }) => {
    composerSpy(props);
    return createElement("div", {
      "data-testid": "composer",
      "data-rows": String(props.rows ?? ""),
    });
  },
}));

vi.mock("./conversation-session", () => ({
  ConversationSession: () => createElement("div", { "data-testid": "conversation-session" }),
}));

import { WorkspaceConversationPanel } from "./workspace-conversation-panel";

describe("WorkspaceConversationPanel", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    composerSpy.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  test("keeps visible breathing room above the sticky composer", () => {
    act(() => {
      root.render(
        createElement(WorkspaceConversationPanel, {
          conversationId: "conversation-1",
          workspaceId: "workspace-1",
          initialMessages: [],
          initialTimelineMessagesByAssistant: {},
          initialCitations: [],
          availableModelProfiles: [],
        }),
      );
    });

    const sessionContainer = container.querySelector('[data-testid="conversation-session"]')
      ?.parentElement;
    const composerShell = container.querySelector('[data-testid="composer"]')?.parentElement;

    expect(sessionContainer?.className).toContain("pb-6");
    expect(sessionContainer?.className).toContain("min-[720px]:pb-8");
    expect(composerShell?.className).not.toContain("pt-3");
    expect(composerShell?.className).not.toContain("pb-3");
  });

  test("uses a taller stage composer on conversation pages", () => {
    act(() => {
      root.render(
        createElement(WorkspaceConversationPanel, {
          conversationId: "conversation-1",
          workspaceId: "workspace-1",
          initialMessages: [],
          initialTimelineMessagesByAssistant: {},
          initialCitations: [],
          availableModelProfiles: [],
        }),
      );
    });

    expect(composerSpy).toHaveBeenCalled();
    expect(composerSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      rows: 3,
      variant: "stage",
    });
  });
});
