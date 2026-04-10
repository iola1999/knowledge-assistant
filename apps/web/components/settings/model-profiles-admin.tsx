"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { useMessage } from "@/components/shared/message-provider";
import { EditorialPageHeader } from "@/components/shared/editorial-page-header";
import { SystemManagementSidebar } from "@/components/settings/system-management-sidebar";
import { SettingsShell } from "@/components/shared/settings-shell";
import {
  formatUserFacingModelProfileLabel,
  type AdminModelProfile,
} from "@/lib/api/model-profiles";
import { buttonStyles, cn, inputStyles, navItemStyles, ui } from "@/lib/ui";

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

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (nextValue: boolean) => void;
}) {
  return (
    <div className={cn(ui.subpanel, "flex items-center justify-between gap-3 px-3.5 py-3")}>
      <div className="grid gap-0.5">
        <span className="text-[13px] font-medium text-app-text">{label}</span>
        <span className="text-[12px] text-app-muted-strong">{checked ? "已开启" : "已关闭"}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition focus:outline-none focus:ring-4 focus:ring-app-accent/10",
          checked
            ? "border-transparent bg-app-primary"
            : "border-app-outline-variant/35 bg-app-surface-high",
        )}
        onClick={() => onChange(!checked)}
      >
        <span
          className={cn(
            "pointer-events-none inline-flex size-5 rounded-full bg-app-surface-lowest shadow-sm transition-transform",
            checked ? "translate-x-6" : "translate-x-1",
          )}
        />
      </button>
    </div>
  );
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
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4">
          <EditorialPageHeader title="模型管理" />

          <section className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
            <aside className="grid content-start gap-3 rounded-2xl bg-app-surface-low p-3.5 shadow-soft">
              <div className="flex items-center justify-between gap-3 px-1">
                <h2 className="text-[13px] font-semibold text-app-text">模型列表</h2>
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
                    selectedId === NEW_MODEL_DRAFT_ID && "before:left-1.5 before:inset-y-4",
                  )}
                  onClick={() => handleSelectProfile(null)}
                >
                  <strong className="text-[13px] font-semibold">新建模型</strong>
                </button>

                {items.length === 0 ? (
                  <div className={cn(ui.subpanel, "grid gap-1.5")}>
                    <strong className="text-[14px] font-semibold text-app-text">还没有模型</strong>
                    <span className="text-[13px] text-app-muted">先创建一个默认模型</span>
                  </div>
                ) : (
                  items.map((profile) => {
                    const selected = profile.id === selectedId;
                    const listLabel = formatUserFacingModelProfileLabel(profile);
                    const subtitle =
                      profile.modelName.trim() && profile.modelName.trim() !== listLabel
                        ? profile.modelName
                        : null;
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
                          selected && "before:left-1.5 before:inset-y-4",
                        )}
                        onClick={() => handleSelectProfile(profile.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 grid gap-0.5">
                            <strong className="truncate text-[13px] font-semibold">
                              {listLabel}
                            </strong>
                            {subtitle ? (
                              <span className="truncate text-[12px] text-app-muted">{subtitle}</span>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {profile.isDefault ? <span className={ui.chipSoft}>默认</span> : null}
                            <span className={profile.enabled ? ui.chipSoft : ui.chip}>
                              {profile.enabled ? "启用" : "停用"}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            <section className={cn(ui.panelLarge, "grid gap-5")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="text-[1.2rem] font-semibold text-app-text">
                  {selectedProfile ? "编辑模型" : "新建模型"}
                </h2>
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

              <div className="grid gap-3 md:grid-cols-2">
                <ToggleField
                  label="启用模型"
                  checked={draft.enabled}
                  onChange={(nextValue) =>
                    setDraft((current) => ({
                      ...current,
                      enabled: nextValue,
                    }))
                  }
                />
                <ToggleField
                  label="设为默认"
                  checked={draft.isDefault}
                  onChange={(nextValue) =>
                    setDraft((current) => ({
                      ...current,
                      isDefault: nextValue,
                    }))
                  }
                />
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
