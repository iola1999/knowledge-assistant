import { z } from "zod";

import { MODEL_PROFILE_API_TYPE } from "@anchordesk/contracts";

export type AdminModelProfile = {
  id: string;
  apiType: string;
  displayName: string;
  modelName: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  isDefault: boolean;
};

export type EnabledModelProfileOption = {
  id: string;
  displayName: string;
  modelName: string;
  isDefault: boolean;
};

export const deprecatedModelSystemSettingKeys = [
  "anthropic_api_key",
  "anthropic_base_url",
  "anthropic_model",
  "anthropic_final_answer_model",
] as const;

const modelProfileText = z.string().trim();

export const modelProfileMutationSchema = z.object({
  displayName: modelProfileText.min(1, "显示名称不能为空"),
  modelName: modelProfileText.min(1, "模型名称不能为空"),
  baseUrl: modelProfileText.url("Base URL 格式不正确"),
  apiKey: modelProfileText.min(1, "API Key 不能为空"),
  enabled: z.boolean().default(true),
  isDefault: z.boolean().default(false),
});

export function isVisibleSystemSettingKey(settingKey: string) {
  return !deprecatedModelSystemSettingKeys.includes(
    settingKey as (typeof deprecatedModelSystemSettingKeys)[number],
  );
}

export function describeModelProfileApiType(apiType: string) {
  if (apiType === MODEL_PROFILE_API_TYPE.ANTHROPIC) {
    return "Anthropic Compatible";
  }

  return apiType;
}

export function formatEnabledModelProfileLabel(
  profile: Pick<EnabledModelProfileOption, "displayName" | "modelName">,
) {
  const displayName = profile.displayName.trim();
  const modelName = profile.modelName.trim();

  if (!displayName || displayName === modelName) {
    return modelName;
  }

  return `${displayName} · ${modelName}`;
}

export function formatUserFacingModelProfileLabel(
  profile: Pick<EnabledModelProfileOption, "displayName" | "modelName">,
) {
  const displayName = profile.displayName.trim();
  const modelName = profile.modelName.trim();

  return displayName || modelName;
}

export function resolveInitialModelProfileId(input: {
  availableModelProfiles: EnabledModelProfileOption[];
  defaultModelProfileId?: string | null;
  preferredModelProfileId?: string | null;
}) {
  const availableIds = new Set(
    input.availableModelProfiles.map((profile) => profile.id),
  );
  const preferredModelProfileId = input.preferredModelProfileId?.trim() ?? "";
  if (preferredModelProfileId && availableIds.has(preferredModelProfileId)) {
    return preferredModelProfileId;
  }

  const defaultModelProfileId = input.defaultModelProfileId?.trim() ?? "";
  if (defaultModelProfileId && availableIds.has(defaultModelProfileId)) {
    return defaultModelProfileId;
  }

  return input.availableModelProfiles[0]?.id ?? null;
}
