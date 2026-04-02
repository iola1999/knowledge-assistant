"use client";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useState, useTransition } from "react";

import { useMessage } from "@/components/shared/message-provider";
import { SystemManagementSidebar } from "@/components/settings/system-management-sidebar";
import { SettingsShell } from "@/components/shared/settings-shell";
import {
  filterSystemSettingSections,
  type SystemSettingRow,
  type SystemSettingSection,
} from "@/lib/api/system-settings";
import { buttonStyles, cn, inputStyles, ui } from "@/lib/ui";

function flattenSettings(rows: SystemSettingRow[]) {
  return rows.reduce<Record<string, string>>((acc, row) => {
    acc[row.settingKey] = row.valueText ?? "";
    return acc;
  }, {});
}

function flattenSections(sections: SystemSettingSection[]) {
  return flattenSettings(sections.flatMap((section) => section.items));
}

export function SystemSettingsForm({
  sections,
}: {
  sections: SystemSettingSection[];
}) {
  const router = useRouter();
  const message = useMessage();
  const [values, setValues] = useState<Record<string, string>>(() =>
    flattenSections(sections),
  );
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    setValues(flattenSections(sections));
  }, [sections]);

  const visibleSections = filterSystemSettingSections(sections, deferredQuery);
  const hasSettings = sections.length > 0;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const response = await fetch("/api/system-settings", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          settings: Object.entries(values).map(([settingKey, valueText]) => ({
            settingKey,
            valueText,
          })),
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | { error?: string; settings?: SystemSettingRow[] }
        | null;

      if (!response.ok) {
        message.error(body?.error ?? "保存系统参数失败");
        return;
      }

      if (body?.settings) {
        setValues(flattenSettings(body.settings));
      }

      message.success("已保存，重启相关进程后生效");

      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      message.error(
        error instanceof Error && error.message ? error.message : "保存系统参数失败",
      );
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <SettingsShell
        sidebar={<SystemManagementSidebar activeSection="settings" />}
      >
        <div className="flex w-full min-w-0 flex-col gap-4">
          <div className="sticky top-4 z-20 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-app-border/70 bg-white/90 px-4 py-3 shadow-soft backdrop-blur-sm">
            <h2 className="text-[1.25rem] font-semibold text-app-text">运行时参数</h2>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <label className="w-full sm:w-[280px]">
                <span className="sr-only">搜索系统参数</span>
                <input
                  autoComplete="off"
                  className={inputStyles({ size: "compact" })}
                  placeholder="搜 key、说明、provider"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>

              <button className={buttonStyles({ size: "sm" })} disabled={isPending} type="submit">
                {isPending ? "刷新中..." : "保存系统参数"}
              </button>
            </div>
          </div>

          {!hasSettings ? (
            <section className={cn(ui.panel, "grid gap-2")}>
              <h2 className="text-[1.24rem] font-semibold text-app-text">系统参数尚未初始化</h2>
              <p className={ui.muted}>先运行一次 `pnpm dev`，再回来维护数据库配置。</p>
            </section>
          ) : visibleSections.length === 0 ? (
            <section className={cn(ui.panel, "grid gap-2")}>
              <h2 className="text-[1.24rem] font-semibold text-app-text">没有匹配的系统参数</h2>
              <p className={ui.muted}>换个参数名、说明词或 provider 名再试。</p>
            </section>
          ) : (
            visibleSections.map((section) => (
              <section
                id={section.id}
                key={section.id}
                className={cn(ui.sectionPanel, "scroll-mt-8")}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-0.5">
                    <h3 className="text-[1.1rem] font-semibold text-app-text">{section.title}</h3>
                    <p className={ui.mutedStrong}>{section.description}</p>
                  </div>
                  <span className="rounded-full border border-app-border bg-app-surface-soft px-2.5 py-0.5 text-[12px] text-app-muted">
                    {section.items.length} 项
                  </span>
                </div>

                <div className="mt-4 grid gap-4">
                  {section.items.map((setting) => (
                    <div
                      key={setting.settingKey}
                      className="grid gap-3 border-t border-app-border pt-4 md:grid-cols-[260px_minmax(0,1fr)] md:gap-4"
                    >
                      <div className="grid content-start gap-1.5">
                        <code className={ui.codeChip}>{setting.settingKey}</code>
                        {setting.summary || setting.description ? (
                          <p className="text-sm leading-6 text-app-muted-strong">
                            {setting.summary ?? setting.description}
                          </p>
                        ) : null}
                      </div>

                      <div className="min-w-0">
                        <SystemSettingInput
                          setting={setting}
                          value={values[setting.settingKey] ?? ""}
                          onChange={(value) =>
                            setValues((current) => ({
                              ...current,
                              [setting.settingKey]: value,
                            }))
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </SettingsShell>
    </form>
  );
}

function SystemSettingInput({
  setting,
  value,
  onChange,
}: {
  setting: SystemSettingSection["items"][number];
  value: string;
  onChange: (value: string) => void;
}) {
  if (setting.inputKind === "textarea") {
    return (
      <textarea
        className={ui.textarea}
        rows={4}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  if (setting.inputKind === "boolean") {
    return (
      <select className={ui.select} value={value || "false"} onChange={(event) => onChange(event.target.value)}>
        <option value="true">开启</option>
        <option value="false">关闭</option>
      </select>
    );
  }

  return (
    <input
      autoComplete="off"
      className={ui.input}
      type={setting.inputKind}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
