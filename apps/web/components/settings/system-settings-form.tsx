"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import type { SystemSettingRow, SystemSettingSection } from "@/lib/api/system-settings";

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
        message:
          "系统设置已保存。重启 pnpm dev 后，web / worker / agent / parser 才会统一加载新配置。",
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
    <form className="settings-form" onSubmit={onSubmit}>
      {sections.map((section) => (
        <section key={section.id} className="card stack">
          <div className="stack">
            <h2>{section.title}</h2>
            <p className="muted">{section.description}</p>
          </div>
          <div className="form">
            {section.items.map((setting) => (
              <label key={setting.settingKey}>
                <code>{setting.settingKey}</code>
                <span className="muted">
                  {setting.description ?? "当前设置还没有补充说明。"}
                </span>
                {setting.inputKind === "textarea" ? (
                  <textarea
                    rows={4}
                    value={values[setting.settingKey] ?? ""}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [setting.settingKey]: event.target.value,
                      }))
                    }
                  />
                ) : (
                  <input
                    autoComplete="off"
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

      <div className="card stack">
        <div className="toolbar">
          <button disabled={isPending} type="submit">
            {isPending ? "刷新中..." : "保存系统设置"}
          </button>
          <p className="muted">保存后需要重启 `pnpm dev` 才会让后台进程统一生效。</p>
        </div>
        {status ? (
          <p className={status.tone === "error" ? "error" : "muted"}>
            {status.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
