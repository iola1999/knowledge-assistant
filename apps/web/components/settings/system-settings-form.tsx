"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import type { SystemSettingRow, SystemSettingSection } from "@/lib/api/system-settings";
import { buttonStyles, cn, ui } from "@/lib/ui";

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
  const [values, setValues] = useState<Record<string, string>>(() =>
    flattenSections(sections),
  );
  const [status, setStatus] = useState<{
    tone: "error" | "muted";
    message: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setValues(flattenSections(sections));
  }, [sections]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

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
        setStatus({
          tone: "error",
          message: body?.error ?? "保存系统设置失败",
        });
        return;
      }

      if (body?.settings) {
        setValues(flattenSettings(body.settings));
      }

      setStatus({
        tone: "muted",
        message: "已保存，重启 `pnpm dev` 后生效",
      });

      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message:
          error instanceof Error && error.message
            ? error.message
            : "保存系统设置失败",
      });
    }
  }

  return (
    <form className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]" onSubmit={onSubmit}>
      <aside className="grid content-start gap-4 xl:sticky xl:top-8">
        <section className={cn(ui.panel, "grid gap-3")}>
          <div className="space-y-1">
            <p className={ui.eyebrow}>Sections</p>
            <h2>配置分组</h2>
          </div>
          <nav className="grid gap-2">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="flex min-h-10 items-center justify-between rounded-xl border border-transparent bg-app-surface-soft/80 px-3 text-sm text-app-muted-strong transition hover:border-app-border-strong hover:bg-white"
              >
                <span>{section.title}</span>
                <span className="text-xs text-app-muted">{section.items.length}</span>
              </a>
            ))}
          </nav>
        </section>

        <section className={cn(ui.panel, "grid gap-3")}>
          <button className={buttonStyles({ block: true })} disabled={isPending} type="submit">
            {isPending ? "刷新中..." : "保存系统设置"}
          </button>
          {status ? (
            <p className={status.tone === "error" ? ui.error : ui.muted}>
              {status.message}
            </p>
          ) : null}
        </section>
      </aside>

      <div className="grid gap-4">
        {sections.map((section) => (
          <section id={section.id} key={section.id} className={cn(ui.panel, "grid gap-4 scroll-mt-8")}>
            <div className="grid gap-1">
              <p className={ui.eyebrow}>{section.id}</p>
              <h2>{section.title}</h2>
            </div>
            <div className="grid gap-4">
              {section.items.map((setting) => (
                <label key={setting.settingKey} className={ui.label}>
                  <code className={ui.codeChip}>{setting.settingKey}</code>
                  {setting.inputKind === "textarea" ? (
                    <textarea
                      className={ui.textarea}
                      rows={4}
                      value={values[setting.settingKey] ?? ""}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [setting.settingKey]: event.target.value,
                        }))
                      }
                    />
                  ) : setting.inputKind === "boolean" ? (
                    <select
                      className={ui.select}
                      value={values[setting.settingKey] || "false"}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [setting.settingKey]: event.target.value,
                        }))
                      }
                    >
                      <option value="true">开启</option>
                      <option value="false">关闭</option>
                    </select>
                  ) : (
                    <input
                      autoComplete="off"
                      className={ui.input}
                      type={setting.inputKind}
                      value={values[setting.settingKey] ?? ""}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [setting.settingKey]: event.target.value,
                        }))
                      }
                    />
                  )}
                </label>
              ))}
            </div>
          </section>
        ))}
      </div>
    </form>
  );
}
