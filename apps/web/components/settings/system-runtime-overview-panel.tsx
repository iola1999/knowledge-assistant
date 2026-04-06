"use client";

import { useMemo, useState } from "react";

import { EditorialPageHeader } from "@/components/shared/editorial-page-header";
import { SystemManagementSidebar } from "@/components/settings/system-management-sidebar";
import { SettingsShell } from "@/components/shared/settings-shell";
import {
  SYSTEM_RUNTIME_WINDOWS,
  type SystemRuntimeFailureBucket,
  type SystemRuntimeOverview,
  type SystemRuntimeWindowId,
} from "@/lib/api/system-runtime-overview-shared";
import { formatRelativeWorkspaceActivity } from "@/lib/api/workspace-overview";
import { chipButtonStyles, cn, ui } from "@/lib/ui";

const numberFormatter = new Intl.NumberFormat("zh-CN");
const timestampFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatCount(value: number) {
  return numberFormatter.format(value);
}

function formatRate(value: number | null) {
  if (value == null) {
    return "—";
  }

  return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}%`;
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "暂无";
  }

  return timestampFormatter.format(new Date(value));
}

function formatRelativeTimestamp(value: string | null) {
  if (!value) {
    return "暂无";
  }

  return formatRelativeWorkspaceActivity(new Date(value));
}

function resolveRateTone(value: number | null) {
  if (value == null) {
    return {
      valueClass: "text-app-text",
      barClass: "bg-app-border",
      badgeClass: ui.chip,
    };
  }

  if (value >= 95) {
    return {
      valueClass: "text-emerald-800",
      barClass: "bg-emerald-500/80",
      badgeClass:
        "inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800",
    };
  }

  if (value >= 80) {
    return {
      valueClass: "text-app-accent",
      barClass: "bg-app-accent/75",
      badgeClass: ui.chipSoft,
    };
  }

  return {
    valueClass: "text-red-600",
    barClass: "bg-red-500/80",
    badgeClass:
      "inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-medium text-red-600",
  };
}

function formatStageLabel(value: string) {
  const labels: Record<string, string> = {
    queued: "排队中",
    extracting_text: "抽取文本",
    parsing_layout: "解析版面",
    chunking: "切块中",
    embedding: "向量化",
    indexing: "写入索引",
    ready: "完成",
    failed: "失败",
  };

  return labels[value] ?? value;
}

function RuntimeMetricCard({
  label,
  value,
  detail,
  eyebrow,
  rate,
}: {
  label: string;
  value: string;
  detail: string;
  eyebrow: string;
  rate?: number | null;
}) {
  const tone = resolveRateTone(rate ?? null);

  return (
    <section className={cn(ui.subcard, "grid gap-2.5")}>
      <div className="grid gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-app-secondary">
          {eyebrow}
        </span>
        <span className="text-[13px] font-medium text-app-muted-strong">{label}</span>
      </div>
      <div className="grid gap-1.5">
        <strong className={cn("text-[1.45rem] font-semibold", tone.valueClass)}>{value}</strong>
        {rate != null ? (
          <div className="h-1.5 overflow-hidden rounded-full bg-app-surface-soft">
            <div
              className={cn("h-full rounded-full transition-[width]", tone.barClass)}
              style={{
                width: `${Math.max(0, Math.min(rate, 100))}%`,
              }}
            />
          </div>
        ) : null}
      </div>
      <p className="text-[11px] leading-4.5 text-app-muted">{detail}</p>
    </section>
  );
}

function RuntimeKeyValueRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl bg-app-surface-lowest/52 px-3 py-2.5 shadow-soft">
      <div className="grid gap-0.5">
        <span className="text-[12px] font-medium text-app-text">{label}</span>
        {detail ? <span className="text-[11px] text-app-muted">{detail}</span> : null}
      </div>
      <span className="text-[12px] font-medium text-app-muted-strong">{value}</span>
    </div>
  );
}

function RuntimeFailureList({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: SystemRuntimeFailureBucket[];
  emptyText: string;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-app-text">{title}</h3>
        <span className={ui.chipSoft}>{items.length} 项</span>
      </div>
      {items.length > 0 ? (
        <div className="grid gap-2">
          {items.map((item) => (
            <div
              key={item.label}
              className="flex items-start justify-between gap-3 rounded-xl border border-app-border/80 bg-white/82 px-2.5 py-1.5"
            >
              <span className="min-w-0 text-[11px] leading-4.5 text-app-muted-strong">
                {item.label}
              </span>
              <span className="shrink-0 text-[11px] font-medium text-app-text">
                {formatCount(item.count)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-app-border/80 bg-app-surface-soft/44 px-2.5 py-2.5 text-[11px] text-app-muted">
          {emptyText}
        </div>
      )}
    </div>
  );
}

function RuntimeScopeBar({
  label,
  count,
  total,
}: {
  label: string;
  count: number;
  total: number;
}) {
  const width = total > 0 ? Math.max(0, Math.round((count / total) * 100)) : 0;

  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className="text-app-muted-strong">{label}</span>
        <span className="font-medium text-app-text">{formatCount(count)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-app-surface-soft">
        <div
          className="h-full rounded-full bg-app-accent/75"
          style={{
            width: `${width}%`,
          }}
        />
      </div>
    </div>
  );
}

export function SystemRuntimeOverviewPanel({
  overview,
}: {
  overview: SystemRuntimeOverview;
}) {
  const [activeWindowId, setActiveWindowId] = useState<SystemRuntimeWindowId>("7d");
  const activeWindow = overview.windows[activeWindowId];
  const generatedAt = useMemo(() => new Date(overview.generatedAt), [overview.generatedAt]);
  const comparisonRows = useMemo(
    () => [
      {
        label: "活跃用户",
        values: SYSTEM_RUNTIME_WINDOWS.map((window) =>
          formatCount(overview.windows[window.id].activeUsers),
        ),
      },
      {
        label: "新会话",
        values: SYSTEM_RUNTIME_WINDOWS.map((window) =>
          formatCount(overview.windows[window.id].newConversations),
        ),
      },
      {
        label: "用户消息",
        values: SYSTEM_RUNTIME_WINDOWS.map((window) =>
          formatCount(overview.windows[window.id].userMessages),
        ),
      },
      {
        label: "完成回答",
        values: SYSTEM_RUNTIME_WINDOWS.map((window) =>
          formatCount(overview.windows[window.id].assistantCompleted),
        ),
      },
      {
        label: "失败回答",
        values: SYSTEM_RUNTIME_WINDOWS.map((window) =>
          formatCount(overview.windows[window.id].assistantFailed),
        ),
      },
      {
        label: "引用覆盖率",
        values: SYSTEM_RUNTIME_WINDOWS.map((window) =>
          formatRate(overview.windows[window.id].citationCoverageRate),
        ),
      },
      {
        label: "检索命中率",
        values: SYSTEM_RUNTIME_WINDOWS.map((window) =>
          formatRate(overview.windows[window.id].retrievalHitRate),
        ),
      },
      {
        label: "入库成功率",
        values: SYSTEM_RUNTIME_WINDOWS.map((window) =>
          formatRate(overview.windows[window.id].ingestSuccessRate),
        ),
      },
    ],
    [overview.windows],
  );

  return (
    <SettingsShell sidebar={<SystemManagementSidebar activeSection="runtime" />}>
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4">
        <EditorialPageHeader
          eyebrow="系统管理"
          title="运行概览"
          description="面向超管的实时运营面板，集中查看使用活跃度、回答链路、资料入库和配置就绪度。"
          actions={
            <div className="grid justify-items-end gap-2">
              <div className="flex flex-wrap items-center justify-end gap-2">
                {SYSTEM_RUNTIME_WINDOWS.map((window) => (
                  <button
                    key={window.id}
                    type="button"
                    className={chipButtonStyles({
                      active: activeWindowId === window.id,
                    })}
                    onClick={() => setActiveWindowId(window.id)}
                  >
                    {window.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 text-[12px] text-app-muted">
                <span className={ui.chipSoft}>
                  刷新于 {timestampFormatter.format(generatedAt)}
                </span>
                <span className={ui.chip}>
                  当前查看{" "}
                  {SYSTEM_RUNTIME_WINDOWS.find((item) => item.id === activeWindowId)?.label}
                </span>
              </div>
            </div>
          }
        />

        <section className={cn(ui.panelLarge, "grid gap-4")}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <RuntimeKeyValueRow
              label="在线会话"
              value={formatCount(overview.snapshot.activeSessions)}
              detail="授权仍有效的登录会话"
            />
            <RuntimeKeyValueRow
              label="启用模型"
              value={`${formatCount(overview.readiness.enabledModels)} / ${formatCount(overview.readiness.totalModels)}`}
              detail={overview.readiness.hasDefaultModel ? "已设置默认模型" : "缺少默认模型"}
            />
            <RuntimeKeyValueRow
              label="升级状态"
              value={`${formatCount(overview.readiness.runningUpgrades)} 运行中 / ${formatCount(overview.readiness.failedUpgrades)} 失败`}
              detail="来自升级任务记录"
            />
            <RuntimeKeyValueRow
              label="关键设置"
              value={`${formatCount(overview.readiness.configuredCriticalSettings)} / ${formatCount(overview.readiness.totalCriticalSettings)}`}
              detail={overview.readiness.registrationOpen ? "当前允许注册" : "当前关闭注册"}
            />
          </div>
        </section>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <RuntimeMetricCard
            eyebrow="使用"
            label="活跃用户"
            value={formatCount(activeWindow.activeUsers)}
            detail={`活跃空间 ${formatCount(activeWindow.activeWorkspaces)} · 用户消息 ${formatCount(activeWindow.userMessages)}`}
          />
          <RuntimeMetricCard
            eyebrow="会话"
            label="新会话"
            value={formatCount(activeWindow.newConversations)}
            detail={`最近 ${SYSTEM_RUNTIME_WINDOWS.find((item) => item.id === activeWindowId)?.label ?? ""} 内创建`}
          />
          <RuntimeMetricCard
            eyebrow="回答"
            label="回答成功率"
            value={formatRate(activeWindow.assistantSuccessRate)}
            detail={`完成 ${formatCount(activeWindow.assistantCompleted)} · 失败 ${formatCount(activeWindow.assistantFailed)}`}
            rate={activeWindow.assistantSuccessRate}
          />
          <RuntimeMetricCard
            eyebrow="引用"
            label="引用覆盖率"
            value={formatRate(activeWindow.citationCoverageRate)}
            detail={`带引用回答 ${formatCount(activeWindow.assistantWithCitations)} / ${formatCount(activeWindow.assistantCompleted)}`}
            rate={activeWindow.citationCoverageRate}
          />
          <RuntimeMetricCard
            eyebrow="入库"
            label="入库成功率"
            value={formatRate(activeWindow.ingestSuccessRate)}
            detail={`成功 ${formatCount(activeWindow.documentJobsCompleted)} · 失败 ${formatCount(activeWindow.documentJobsFailed)} · 取消 ${formatCount(activeWindow.documentJobsCancelled)}`}
            rate={activeWindow.ingestSuccessRate}
          />
          <RuntimeMetricCard
            eyebrow="检索"
            label="检索命中率"
            value={formatRate(activeWindow.retrievalHitRate)}
            detail={`命中 ${formatCount(activeWindow.retrievalRunsWithHits)} / ${formatCount(activeWindow.retrievalRuns)} · 平均 ${activeWindow.averageRetrievalResultsPerRun ?? "—"} 条`}
            rate={activeWindow.retrievalHitRate}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
          <section className={cn(ui.panelLarge, "grid gap-4")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="grid gap-0.5">
                <h2 className="text-[1rem] font-semibold text-app-text">时间窗对照</h2>
                <p className="text-[13px] leading-5 text-app-muted-strong">
                  所有关键运营指标按 24 小时、7 天、30 天并排对照，便于判断近期波动。
                </p>
              </div>
              <span className={ui.chipSoft}>当前高亮 {activeWindowId}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-[13px]">
                <thead>
                  <tr className="text-app-muted-strong">
                    <th className="pb-2 pr-3 font-medium">指标</th>
                    {SYSTEM_RUNTIME_WINDOWS.map((window) => (
                      <th key={window.id} className="pb-2 px-2 font-medium">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-0.5",
                            window.id === activeWindowId ? "bg-app-surface-strong text-app-text" : "",
                          )}
                        >
                          {window.label}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row) => (
                    <tr key={row.label} className="align-top">
                      <td className="border-t border-app-border/70 py-2.5 pr-3 text-app-text">
                        {row.label}
                      </td>
                      {row.values.map((value, index) => {
                        const window = SYSTEM_RUNTIME_WINDOWS[index]!;
                        return (
                          <td
                            key={`${row.label}-${window.id}`}
                            className={cn(
                              "border-t border-app-border/70 px-2 py-2.5 text-app-muted-strong",
                              window.id === activeWindowId &&
                                "bg-app-surface-soft/44 text-app-text",
                            )}
                          >
                            {value}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={cn(ui.panelLarge, "grid gap-4")}>
            <div className="grid gap-0.5">
              <h2 className="text-[1rem] font-semibold text-app-text">系统账本</h2>
              <p className="text-[13px] leading-5 text-app-muted-strong">
                当前数据库快照和配置就绪度，用于判断系统是否可持续处理请求。
              </p>
            </div>

            <div className="grid gap-2">
              <RuntimeKeyValueRow label="总用户" value={formatCount(overview.snapshot.totalUsers)} />
              <RuntimeKeyValueRow
                label="工作空间"
                value={`${formatCount(overview.snapshot.totalWorkspaces)} / 归档 ${formatCount(overview.snapshot.archivedWorkspaces)}`}
              />
              <RuntimeKeyValueRow
                label="会话总量"
                value={`${formatCount(overview.snapshot.totalConversations)} / 归档 ${formatCount(overview.snapshot.archivedConversations)}`}
              />
              <RuntimeKeyValueRow
                label="资料总量"
                value={`${formatCount(overview.snapshot.totalDocuments)} / 临时附件 ${formatCount(overview.snapshot.totalConversationAttachments)}`}
              />
              <RuntimeKeyValueRow
                label="资料状态"
                value={`就绪 ${formatCount(overview.snapshot.readyDocuments)} · 处理中 ${formatCount(overview.snapshot.processingDocuments)} · 失败 ${formatCount(overview.snapshot.failedDocuments)}`}
              />
              <RuntimeKeyValueRow
                label="积压任务"
                value={`排队 ${formatCount(overview.snapshot.queuedDocumentJobs)} · 运行 ${formatCount(overview.snapshot.runningDocumentJobs)}`}
              />
            </div>

            <div className="grid gap-2">
              <h3 className="text-[14px] font-semibold text-app-text">关键设置</h3>
              <div className="grid gap-2">
                {overview.readiness.criticalSettings.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-3 rounded-xl border border-app-border/80 bg-white/82 px-3 py-2"
                  >
                    <span className="text-[12px] text-app-muted-strong">{item.label}</span>
                    <span
                      className={
                        item.configured
                          ? "inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
                          : "inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600"
                      }
                    >
                      {item.configured ? "已配置" : "缺失"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <h3 className="text-[14px] font-semibold text-app-text">新鲜度</h3>
              <div className="grid gap-2">
                <RuntimeKeyValueRow
                  label="最近登录"
                  value={formatRelativeTimestamp(overview.freshness.lastLoginAt)}
                  detail={formatTimestamp(overview.freshness.lastLoginAt)}
                />
                <RuntimeKeyValueRow
                  label="最近用户提问"
                  value={formatRelativeTimestamp(overview.freshness.lastUserMessageAt)}
                  detail={formatTimestamp(overview.freshness.lastUserMessageAt)}
                />
                <RuntimeKeyValueRow
                  label="最近成功回答"
                  value={formatRelativeTimestamp(overview.freshness.lastAssistantCompletedAt)}
                  detail={formatTimestamp(overview.freshness.lastAssistantCompletedAt)}
                />
                <RuntimeKeyValueRow
                  label="最近检索"
                  value={formatRelativeTimestamp(overview.freshness.lastRetrievalRunAt)}
                  detail={formatTimestamp(overview.freshness.lastRetrievalRunAt)}
                />
              </div>
            </div>
          </section>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className={cn(ui.panelLarge, "grid gap-4")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="grid gap-0.5">
                <h2 className="text-[1rem] font-semibold text-app-text">问答与引用</h2>
                <p className="text-[13px] leading-5 text-app-muted-strong">
                  当前时间窗内的回答终态、工具回执和引用来源拆分。
                </p>
              </div>
              <span className={resolveRateTone(activeWindow.assistantSuccessRate).badgeClass}>
                成功率 {formatRate(activeWindow.assistantSuccessRate)}
              </span>
            </div>

            <div className="grid gap-2">
              <RuntimeKeyValueRow
                label="完成回答"
                value={formatCount(activeWindow.assistantCompleted)}
                detail={`失败 ${formatCount(activeWindow.assistantFailed)} · 仍在流式 ${formatCount(activeWindow.assistantStreaming)}`}
              />
              <RuntimeKeyValueRow
                label="工具回执"
                value={`${formatCount(activeWindow.toolCompleted)} 成功 / ${formatCount(activeWindow.toolFailed)} 失败`}
                detail={`成功率 ${formatRate(activeWindow.toolSuccessRate)}`}
              />
              <RuntimeKeyValueRow
                label="引用总量"
                value={formatCount(activeWindow.citationCount)}
                detail={`带引用回答 ${formatCount(activeWindow.assistantWithCitations)} / ${formatCount(activeWindow.assistantCompleted)}`}
              />
            </div>

            <div className="grid gap-2.5 rounded-[18px] border border-app-border bg-app-surface-soft/38 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[14px] font-semibold text-app-text">引用来源拆分</h3>
                <span className={ui.chipSoft}>{formatCount(activeWindow.citationCount)} 条</span>
              </div>
              <RuntimeScopeBar
                label="工作空间资料"
                count={activeWindow.citationsWorkspace}
                total={activeWindow.citationCount}
              />
              <RuntimeScopeBar
                label="全局资料库"
                count={activeWindow.citationsGlobal}
                total={activeWindow.citationCount}
              />
              <RuntimeScopeBar
                label="网页来源"
                count={activeWindow.citationsWeb}
                total={activeWindow.citationCount}
              />
            </div>

            <RuntimeFailureList
              title="回答失败原因"
              items={overview.assistantFailures[activeWindowId]}
              emptyText="当前时间窗内没有记录到回答失败。"
            />
          </section>

          <section className={cn(ui.panelLarge, "grid gap-4")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="grid gap-0.5">
                <h2 className="text-[1rem] font-semibold text-app-text">资料链路</h2>
                <p className="text-[13px] leading-5 text-app-muted-strong">
                  聚焦文档新增、入库终态和当前队列积压，方便判断解析与任务进程是否顺畅。
                </p>
              </div>
              <span className={resolveRateTone(activeWindow.ingestSuccessRate).badgeClass}>
                成功率 {formatRate(activeWindow.ingestSuccessRate)}
              </span>
            </div>

            <div className="grid gap-2">
              <RuntimeKeyValueRow
                label="新增资料"
                value={formatCount(activeWindow.documentsCreated)}
                detail={`当前总量 ${formatCount(overview.snapshot.totalDocuments)}`}
              />
              <RuntimeKeyValueRow
                label="入库终态"
                value={`${formatCount(activeWindow.documentJobsCompleted)} 成功 / ${formatCount(activeWindow.documentJobsFailed)} 失败 / ${formatCount(activeWindow.documentJobsCancelled)} 取消`}
                detail={`当前排队 ${formatCount(overview.snapshot.queuedDocumentJobs)} · 运行 ${formatCount(overview.snapshot.runningDocumentJobs)}`}
              />
              <RuntimeKeyValueRow
                label="检索结果"
                value={`${formatCount(activeWindow.retrievalRunsWithHits)} / ${formatCount(activeWindow.retrievalRuns)} 命中`}
                detail={`平均每次 ${activeWindow.averageRetrievalResultsPerRun ?? "—"} 条结果`}
              />
            </div>

            <div className="grid gap-2.5 rounded-[18px] border border-app-border bg-app-surface-soft/38 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[14px] font-semibold text-app-text">当前积压阶段</h3>
                <span className={ui.chipSoft}>
                  {formatCount(overview.documentStageBacklog.reduce((sum, item) => sum + item.count, 0))} 项
                </span>
              </div>
              {overview.documentStageBacklog.length > 0 ? (
                <div className="grid gap-3">
                  {overview.documentStageBacklog.map((item) => (
                    <RuntimeScopeBar
                      key={item.stage}
                      label={formatStageLabel(item.stage)}
                      count={item.count}
                      total={Math.max(
                        1,
                        overview.documentStageBacklog.reduce((sum, current) => sum + current.count, 0),
                      )}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-app-border/80 bg-white/82 px-3 py-3 text-[12px] text-app-muted">
                  当前没有排队或运行中的文档任务。
                </div>
              )}
            </div>

            <RuntimeFailureList
              title="入库失败原因"
              items={overview.ingestFailures[activeWindowId]}
              emptyText="当前时间窗内没有记录到入库失败。"
            />
          </section>
        </div>
      </div>
    </SettingsShell>
  );
}
