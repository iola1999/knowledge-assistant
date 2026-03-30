"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS,
  type KnowledgeLibraryStatus,
  type WorkspaceLibrarySubscriptionStatus,
} from "@anchordesk/contracts";

import { useMessage } from "@/components/shared/message-provider";
import {
  formatKnowledgeLibraryStatus,
  formatWorkspaceLibrarySubscriptionStatus,
} from "@/lib/api/knowledge-libraries";
import { buttonStyles, cn, ui } from "@/lib/ui";

type WorkspaceLibraryCatalogItem = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  status: KnowledgeLibraryStatus;
  documentCount: number;
  subscriptionStatus: WorkspaceLibrarySubscriptionStatus | null;
  searchEnabled: boolean;
  updatedAt: string;
};

export function WorkspaceLibrarySubscriptions({
  workspaceId,
  libraries,
}: {
  workspaceId: string;
  libraries: WorkspaceLibraryCatalogItem[];
}) {
  const router = useRouter();
  const message = useMessage();
  const [pendingLibraryId, setPendingLibraryId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function mutateSubscription(input: {
    libraryId: string;
    status: WorkspaceLibrarySubscriptionStatus;
    searchEnabled?: boolean;
  }) {
    setPendingLibraryId(input.libraryId);

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/library-subscriptions`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(input),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        message.error(body?.error ?? "订阅更新失败");
        return;
      }

      message.success(
        input.status === WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS.REVOKED
          ? "已移除资料库挂载"
          : input.status === WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS.PAUSED
            ? "已暂停检索"
            : input.searchEnabled
              ? "已启用订阅并参与检索"
              : "已恢复订阅",
      );
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      message.error(error instanceof Error && error.message ? error.message : "订阅更新失败");
    } finally {
      setPendingLibraryId(null);
    }
  }

  return (
    <section className={ui.sectionPanel}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 className="text-[1.1rem] font-semibold text-app-text">全局资料库订阅</h2>
          <p className="text-[13px] leading-6 text-app-muted-strong">
            启用后会参与对话检索
          </p>
        </div>
        <span className={ui.chipSoft}>
          {libraries.length} 个可见资料库
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        {libraries.length > 0 ? (
          libraries.map((library) => {
            const isBusy = pendingLibraryId !== null || isPending;
            const isCurrentMutation = pendingLibraryId === library.id;
            const canSubscribe = library.status === "active";

            return (
              <article
                key={library.id}
                className="grid gap-4 rounded-[24px] border border-app-border bg-app-surface-soft/58 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-5"
              >
                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[15px] font-semibold text-app-text">{library.title}</h3>
                      <span className={ui.chipSoft}>
                        {formatKnowledgeLibraryStatus(library.status)}
                      </span>
                      <span className={ui.chip}>
                        {formatWorkspaceLibrarySubscriptionStatus(library.subscriptionStatus)}
                      </span>
                      {library.subscriptionStatus &&
                      library.subscriptionStatus !==
                        WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS.REVOKED ? (
                        <span className={ui.chip}>
                          {library.searchEnabled ? "参与检索" : "仅挂载"}
                        </span>
                      ) : null}
                    </div>
                    {library.description ? (
                      <p className="text-[13px] leading-6 text-app-muted-strong">
                        {library.description}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 text-[12px] text-app-muted">
                    <span>{library.documentCount} 份资料</span>
                    <span>更新于 {formatLibraryUpdatedAt(library.updatedAt)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  {library.subscriptionStatus === WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS.ACTIVE ? (
                    <>
                      <button
                        type="button"
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                        disabled={isBusy}
                        onClick={() =>
                          void mutateSubscription({
                            libraryId: library.id,
                            status: WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS.PAUSED,
                            searchEnabled: false,
                          })
                        }
                      >
                        {isCurrentMutation ? "处理中..." : "暂停检索"}
                      </button>
                      <button
                        type="button"
                        className={buttonStyles({ variant: "ghost", size: "sm" })}
                        disabled={isBusy}
                        onClick={() =>
                          void mutateSubscription({
                            libraryId: library.id,
                            status: WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS.REVOKED,
                            searchEnabled: false,
                          })
                        }
                      >
                        移除挂载
                      </button>
                    </>
                  ) : library.subscriptionStatus === WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS.PAUSED ? (
                    <>
                      <button
                        type="button"
                        className={buttonStyles({ size: "sm" })}
                        disabled={isBusy || !canSubscribe}
                        onClick={() =>
                          void mutateSubscription({
                            libraryId: library.id,
                            status: WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS.ACTIVE,
                            searchEnabled: true,
                          })
                        }
                      >
                        {isCurrentMutation ? "处理中..." : "恢复检索"}
                      </button>
                      <button
                        type="button"
                        className={buttonStyles({ variant: "ghost", size: "sm" })}
                        disabled={isBusy}
                        onClick={() =>
                          void mutateSubscription({
                            libraryId: library.id,
                            status: WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS.REVOKED,
                            searchEnabled: false,
                          })
                        }
                      >
                        移除挂载
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className={buttonStyles({ size: "sm" })}
                      disabled={isBusy || !canSubscribe}
                      onClick={() =>
                        void mutateSubscription({
                          libraryId: library.id,
                          status: WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS.ACTIVE,
                          searchEnabled: true,
                        })
                      }
                    >
                      {isCurrentMutation ? "处理中..." : canSubscribe ? "订阅并检索" : "当前不可订阅"}
                    </button>
                  )}
                </div>
              </article>
            );
          })
        ) : (
          <div className={cn(ui.subpanel, "text-[13px] text-app-muted-strong")}>
            当前没有可订阅的全局资料库
          </div>
        )}
      </div>
    </section>
  );
}

function formatLibraryUpdatedAt(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
