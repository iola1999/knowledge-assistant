"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { useMessage } from "@/components/shared/message-provider";
import { EditorialPageHeader } from "@/components/shared/editorial-page-header";
import { SystemManagementSidebar } from "@/components/settings/system-management-sidebar";
import { SettingsShell } from "@/components/shared/settings-shell";
import {
  describeModelProfileApiType,
  formatEnabledModelProfileLabel,
  type AdminModelProfile,
} from "@/lib/api/model-profiles";
import { buttonStyles, cn, inputStyles, navItemStyles, selectStyles, ui } from "@/lib/ui";

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

function describeApiTypeLabel(apiType: string) {
  const label = describeModelProfileApiType(apiType);
  if (label.endsWith(" Compatible")) {
    return `兼容 ${label.replace(" Compatible", "")}`;
  }
  return label;
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
  const [isSaving, setIsSaving] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setItems(profiles);
    setSelectedId((current) => {
      if (current === NEW_MODEL_DRAFT_ID) {
        return NEW_MODEL_DRAFT_ID;
      }

      if (profiles.some((profile) => profile.id === current)) {
        return current;
      }

      return profiles[0]?.id ?? NEW_MODEL_DRAFT_ID;
    });
  }, [profiles]);

  useEffect(() => {
    setDraft(
      buildDraft(selectDraftProfile(items, selectedId), {
        shouldDefault: items.length === 0,
      }),
    );
  }, [items, selectedId]);

  const selectedProfile = selectDraftProfile(items, selectedId);

  function handleSelectProfile(profileId: string | null) {
    const nextSelectedId = profileId ?? NEW_MODEL_DRAFT_ID;
    setSelectedId(nextSelectedId);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) {
      return;
    }

    setIsSaving(true);
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
      message.success(draft.id ? "模型已更新" : "模型已创建");

      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      message.error(
        error instanceof Error && error.message ? error.message : "保存模型失败",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <SettingsShell sidebar={<SystemManagementSidebar activeSection="models" />}>
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4">
          <EditorialPageHeader
            eyebrow="系统管理"
            title="模型管理"
            description="维护可用模型与默认模型。"
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <span className={ui.chipSoft}>已配置 {items.length} 个模型</span>
                <button
                  type="button"
                  className={buttonStyles({ variant: "secondary", size: "sm", shape: "pill" })}
                  onClick={() => handleSelectProfile(null)}
                >
                  新建模型
                </button>
              </div>
            }
          />

          <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="grid content-start gap-3 rounded-2xl bg-app-surface-low p-3.5 shadow-soft">
              <div className="flex items-center justify-between gap-3 px-1">
                <h2 className="text-[13px] font-semibold text-app-text">模型列表</h2>
                <span className={ui.chip}>默认模型会用于新会话和报告生成</span>
              </div>

              <div className="grid gap-1">
                <button
                  type="button"
                  aria-current={selectedId === NEW_MODEL_DRAFT_ID ? "page" : undefined}
                  className={cn(
                    "relative grid gap-0.5 rounded-[14px] px-3.5 py-3 text-left text-[13px] font-medium transition",
                    selectedId === NEW_MODEL_DRAFT_ID
                      ? "bg-app-surface-lowest text-app-text shadow-soft"
                      : "text-app-muted-strong hover:bg-white/60 hover:text-app-text",
                    navItemStyles({ selected: selectedId === NEW_MODEL_DRAFT_ID }),
                  )}
                  onClick={() => handleSelectProfile(null)}
                >
                  <strong className="text-[13px] font-semibold">新建模型</strong>
                  <span className="text-[12px] text-app-muted">新增一个可供用户选择的模型</span>
                </button>

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
                        aria-current={selected ? "page" : undefined}
                        className={cn(
                          "relative grid gap-1 rounded-[14px] px-3.5 py-3 text-left transition",
                          selected
                            ? "bg-app-surface-lowest text-app-text shadow-soft"
                            : "text-app-muted-strong hover:bg-white/60 hover:text-app-text",
                          navItemStyles({ selected }),
                        )}
                        onClick={() => handleSelectProfile(profile.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 grid gap-0.5">
                            <strong className="truncate text-[13px] font-semibold">
                              {formatEnabledModelProfileLabel(profile)}
                            </strong>
                            <span className="truncate text-[12px] text-app-muted">
                              {describeApiTypeLabel(profile.apiType)}
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
              </div>
            </aside>

            <section className={cn(ui.panelLarge, "grid gap-5")}>
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
                <span>接口地址</span>
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
                <span>密钥</span>
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
                <button
                  className={buttonStyles({ size: "sm" })}
                  disabled={isSaving || isPending}
                  type="submit"
                >
                  {isSaving || isPending
                    ? "保存中..."
                    : selectedProfile
                      ? "保存模型"
                      : "创建模型"}
                </button>
              </div>
            </section>
          </section>
        </div>
      </SettingsShell>
    </form>
  );
}
