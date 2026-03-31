"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { ArrowLeftIcon } from "@/components/icons";
import { useMessage } from "@/components/shared/message-provider";
import {
  SettingsShell,
  SettingsShellSidebar,
} from "@/components/shared/settings-shell";
import {
  describeModelProfileApiType,
  formatEnabledModelProfileLabel,
  type AdminModelProfile,
} from "@/lib/api/model-profiles";
import { buttonStyles, cn, inputStyles, selectStyles, ui } from "@/lib/ui";

type ModelProfileDraft = {
  id: string | null;
  displayName: string;
  modelName: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  isDefault: boolean;
};

const NEW_MODEL_DRAFT_ID = "__new_model__";

function buildDraft(
  profile: AdminModelProfile | null,
  options: {
    shouldDefault: boolean;
  },
): ModelProfileDraft {
  if (!profile) {
    return {
      id: null,
      displayName: "",
      modelName: "",
      baseUrl: "https://api.anthropic.com",
      apiKey: "",
      enabled: true,
      isDefault: options.shouldDefault,
    };
  }

  return {
    id: profile.id,
    displayName: profile.displayName,
    modelName: profile.modelName,
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    enabled: profile.enabled,
    isDefault: profile.isDefault,
  };
}

function selectDraftProfile(
  profiles: AdminModelProfile[],
  selectedId: string | null,
) {
  return profiles.find((profile) => profile.id === selectedId) ?? null;
}

export function ModelProfilesAdmin({
  profiles,
}: {
  profiles: AdminModelProfile[];
}) {
  const router = useRouter();
  const message = useMessage();
  const [items, setItems] = useState(profiles);
  const [selectedId, setSelectedId] = useState<string>(
    profiles[0]?.id ?? NEW_MODEL_DRAFT_ID,
  );
  const [draft, setDraft] = useState<ModelProfileDraft>(() =>
    buildDraft(profiles[0] ?? null, { shouldDefault: profiles.length === 0 }),
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setItems(profiles);
    const nextSelectedId =
      selectedId === NEW_MODEL_DRAFT_ID
        ? NEW_MODEL_DRAFT_ID
        : profiles.find((profile) => profile.id === selectedId)?.id ??
          profiles[0]?.id ??
          NEW_MODEL_DRAFT_ID;
    setSelectedId(nextSelectedId);
    setDraft(
      buildDraft(selectDraftProfile(profiles, nextSelectedId), {
        shouldDefault: profiles.length === 0,
      }),
    );
  }, [profiles, selectedId]);

  const selectedProfile = selectDraftProfile(items, selectedId);

  function handleSelectProfile(profileId: string | null) {
    const nextSelectedId = profileId ?? NEW_MODEL_DRAFT_ID;
    setSelectedId(nextSelectedId);
    setDraft(
      buildDraft(selectDraftProfile(items, nextSelectedId), {
        shouldDefault: items.length === 0,
      }),
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const endpoint = draft.id
        ? `/api/admin/model-profiles/${draft.id}`
        : "/api/admin/model-profiles";
      const method = draft.id ? "PATCH" : "POST";
      const response = await fetch(endpoint, {
        method,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          displayName: draft.displayName,
          modelName: draft.modelName,
          baseUrl: draft.baseUrl,
          apiKey: draft.apiKey,
          enabled: draft.enabled,
          isDefault: draft.isDefault,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | {
            error?: string;
            profileId?: string | null;
            profiles?: AdminModelProfile[];
          }
        | null;

      if (!response.ok || !body?.profiles) {
        message.error(body?.error ?? "保存模型失败");
        return;
      }

      const nextSelectedId =
        body.profileId ??
        body.profiles.find((profile) => profile.isDefault)?.id ??
        body.profiles[0]?.id ??
        NEW_MODEL_DRAFT_ID;

      setItems(body.profiles);
      setSelectedId(nextSelectedId);
      setDraft(
        buildDraft(selectDraftProfile(body.profiles, nextSelectedId), {
          shouldDefault: body.profiles.length === 0,
        }),
      );
      message.success(draft.id ? "模型已更新" : "模型已创建");

      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      message.error(
        error instanceof Error && error.message ? error.message : "保存模型失败",
      );
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <SettingsShell
        sidebar={
          <SettingsShellSidebar>
            <Link
              href="/workspaces"
              className="inline-flex items-center gap-1.5 self-start rounded-full px-1.5 py-1 text-[13px] text-app-muted-strong transition hover:bg-white/82 hover:text-app-text"
            >
              <ArrowLeftIcon />
              返回工作台
            </Link>

            <div className="grid gap-4">
              <div className="px-1">
                <h1 className="text-[1.25rem] font-semibold text-app-text">系统管理</h1>
              </div>

              <div className="rounded-2xl border border-app-border bg-app-sidebar/50 p-2">
                <nav className="grid gap-0.5" aria-label="系统管理导航">
                  <Link
                    href="/admin/models"
                    className="rounded-xl bg-white px-2.5 py-2 text-[14px] font-medium text-app-text shadow-soft"
                  >
                    模型管理
                  </Link>
                  <Link
                    href="/settings/libraries"
                    className="rounded-xl px-2.5 py-2 text-[14px] text-app-muted-strong transition hover:bg-white hover:text-app-text"
                  >
                    全局资料库
                  </Link>
                  <Link
                    href="/settings"
                    className="rounded-xl px-2.5 py-2 text-[14px] text-app-muted-strong transition hover:bg-white hover:text-app-text"
                  >
                    系统参数
                  </Link>
                </nav>
              </div>

              <div className={cn(ui.subpanel, "grid gap-2")}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] font-medium text-app-text">已配置模型</span>
                  <span className={ui.chipSoft}>{items.length}</span>
                </div>
                <button
                  type="button"
                  className={buttonStyles({ block: true, size: "sm" })}
                  onClick={() => handleSelectProfile(null)}
                >
                  新建模型
                </button>
              </div>
            </div>
          </SettingsShellSidebar>
        }
      >
        <div className="mx-auto grid w-full max-w-[1180px] gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
          <section className={cn(ui.sectionPanel, "grid content-start gap-3")}>
            <div className="flex items-center justify-between gap-3">
              <div className="grid gap-0.5">
                <h2 className="text-[1.1rem] font-semibold text-app-text">模型列表</h2>
                <p className={ui.mutedStrong}>默认模型会用于新会话和报告生成。</p>
              </div>
            </div>

            {items.length === 0 ? (
              <div className={cn(ui.subpanel, "grid gap-1.5")}>
                <strong className="text-[14px] font-semibold text-app-text">还没有模型</strong>
                <span className="text-[13px] text-app-muted">
                  先创建一个默认模型。
                </span>
              </div>
            ) : (
              items.map((profile) => {
                const selected = profile.id === selectedId;

                return (
                  <button
                    key={profile.id}
                    type="button"
                    className={cn(
                      "grid gap-2 rounded-2xl border px-4 py-3 text-left transition",
                      selected
                        ? "border-app-border-strong bg-white shadow-soft"
                        : "border-app-border bg-app-surface-soft/76 hover:border-app-border-strong hover:bg-white",
                    )}
                    onClick={() => handleSelectProfile(profile.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 grid gap-1">
                        <strong className="truncate text-[14px] font-semibold text-app-text">
                          {formatEnabledModelProfileLabel(profile)}
                        </strong>
                        <span className="truncate text-[12px] text-app-muted">
                          {describeModelProfileApiType(profile.apiType)}
                        </span>
                      </div>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {profile.isDefault ? <span className={ui.chipSoft}>默认</span> : null}
                        <span className={profile.enabled ? ui.chipSoft : ui.chip}>
                          {profile.enabled ? "启用" : "停用"}
                        </span>
                      </div>
                    </div>
                    <code className="truncate text-[12px] text-app-muted-strong">
                      {profile.modelName}
                    </code>
                  </button>
                );
              })
            )}
          </section>

          <section className={cn(ui.sectionPanel, "grid gap-5")}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid gap-1">
                <h2 className="text-[1.2rem] font-semibold text-app-text">
                  {selectedProfile ? "编辑模型" : "新建模型"}
                </h2>
                <p className={ui.mutedStrong}>
                  {selectedProfile
                    ? formatEnabledModelProfileLabel(selectedProfile)
                    : "新增一个可供用户选择的模型。"}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className={ui.chipSoft}>Claude Compatible</span>
                {draft.isDefault ? <span className={ui.chipSoft}>默认</span> : null}
                <span className={draft.enabled ? ui.chipSoft : ui.chip}>
                  {draft.enabled ? "启用" : "停用"}
                </span>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className={ui.label}>
                <span>显示名称</span>
                <input
                  className={inputStyles()}
                  value={draft.displayName}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      displayName: event.target.value,
                    }))
                  }
                />
              </label>

              <label className={ui.label}>
                <span>模型名称</span>
                <input
                  className={inputStyles()}
                  value={draft.modelName}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      modelName: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <label className={ui.label}>
              <span>Base URL</span>
              <input
                className={inputStyles()}
                value={draft.baseUrl}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    baseUrl: event.target.value,
                  }))
                }
              />
            </label>

            <label className={ui.label}>
              <span>API Key</span>
              <input
                className={inputStyles()}
                type="password"
                value={draft.apiKey}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    apiKey: event.target.value,
                  }))
                }
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className={ui.label}>
                <span>可用状态</span>
                <select
                  className={selectStyles()}
                  value={draft.enabled ? "true" : "false"}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      enabled: event.target.value === "true",
                    }))
                  }
                >
                  <option value="true">启用</option>
                  <option value="false">停用</option>
                </select>
              </label>

              <label className={ui.label}>
                <span>默认模型</span>
                <select
                  className={selectStyles()}
                  value={draft.isDefault ? "true" : "false"}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      isDefault: event.target.value === "true",
                    }))
                  }
                >
                  <option value="false">普通</option>
                  <option value="true">设为默认</option>
                </select>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2">
              {selectedProfile ? (
                <button
                  type="button"
                  className={buttonStyles({ variant: "ghost", size: "sm" })}
                  onClick={() =>
                    setDraft(buildDraft(selectedProfile, { shouldDefault: false }))
                  }
                >
                  还原
                </button>
              ) : null}
              <button className={buttonStyles()} disabled={isPending} type="submit">
                {isPending ? "刷新中..." : selectedProfile ? "保存模型" : "创建模型"}
              </button>
            </div>
          </section>
        </div>
      </SettingsShell>
    </form>
  );
}
