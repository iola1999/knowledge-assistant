const LEGACY_MODEL_SETTING_KEYS = [
  "anthropic_api_key",
  "anthropic_base_url",
  "anthropic_model",
  "anthropic_final_answer_model",
];

function readConfiguredText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function pickConfiguredText(...values) {
  for (const value of values) {
    const normalized = readConfiguredText(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

async function readLegacyModelSettings(client) {
  const result = await client.query(
    `
      select setting_key, value_text
      from system_settings
      where setting_key = any($1::text[])
    `,
    [LEGACY_MODEL_SETTING_KEYS],
  );

  return result.rows.reduce((acc, row) => {
    acc[row.setting_key] = row.value_text;
    return acc;
  }, {});
}

async function ensureDefaultModelProfile(client, env) {
  const existingDefault = await client.query(
    `
      select id
      from llm_model_profiles
      where is_default = true
      limit 1
    `,
  );
  if (existingDefault.rows[0]?.id) {
    return {
      defaultModelProfileId: existingDefault.rows[0].id,
      createdDefaultProfile: false,
      promotedExistingProfile: false,
    };
  }

  const existingProfile = await client.query(
    `
      select id
      from llm_model_profiles
      order by created_at asc
      limit 1
    `,
  );
  if (existingProfile.rows[0]?.id) {
    await client.query(
      `
        update llm_model_profiles
        set
          enabled = true,
          is_default = true,
          updated_at = now()
        where id = $1
      `,
      [existingProfile.rows[0].id],
    );

    return {
      defaultModelProfileId: existingProfile.rows[0].id,
      createdDefaultProfile: false,
      promotedExistingProfile: true,
    };
  }

  const legacySettings = await readLegacyModelSettings(client);
  const modelName =
    pickConfiguredText(legacySettings.anthropic_model, env.ANTHROPIC_MODEL) ??
    "claude-sonnet-4-5";
  const baseUrl =
    pickConfiguredText(legacySettings.anthropic_base_url, env.ANTHROPIC_BASE_URL) ??
    "https://api.anthropic.com";
  const apiKey =
    pickConfiguredText(legacySettings.anthropic_api_key, env.ANTHROPIC_API_KEY) ??
    "example-anthropic-api-key";
  const displayName = modelName;

  const inserted = await client.query(
    `
      insert into llm_model_profiles (
        api_type,
        display_name,
        model_name,
        base_url,
        api_key,
        enabled,
        is_default,
        created_at,
        updated_at
      ) values ($1, $2, $3, $4, $5, true, true, now(), now())
      returning id
    `,
    ["anthropic", displayName, modelName, baseUrl, apiKey],
  );

  return {
    defaultModelProfileId: inserted.rows[0]?.id ?? null,
    createdDefaultProfile: true,
    promotedExistingProfile: false,
  };
}

export const modelProfilesUpgrade = {
  key: "2026-04-model-profiles-backfill",
  description:
    "Seed a default Claude-compatible model profile from legacy Anthropic settings, backfill conversations, and remove deprecated model settings.",
  blocking: true,
  safeInDevStartup: true,
  async run(context) {
    const ensuredDefault = await ensureDefaultModelProfile(context.client, context.env);

    let conversationsBackfilled = 0;
    if (ensuredDefault.defaultModelProfileId) {
      const result = await context.client.query(
        `
          update conversations
          set
            model_profile_id = $1,
            updated_at = now()
          where model_profile_id is null
        `,
        [ensuredDefault.defaultModelProfileId],
      );

      conversationsBackfilled = result.rowCount ?? 0;
    }

    const removedLegacySettingsResult = await context.client.query(
      `
        delete from system_settings
        where setting_key = any($1::text[])
      `,
      [LEGACY_MODEL_SETTING_KEYS],
    );

    return {
      defaultModelProfileId: ensuredDefault.defaultModelProfileId,
      createdDefaultProfile: ensuredDefault.createdDefaultProfile,
      promotedExistingProfile: ensuredDefault.promotedExistingProfile,
      conversationsBackfilled,
      removedLegacySettings: removedLegacySettingsResult.rowCount ?? 0,
    };
  },
};
