import {
  systemSettingsDefaultValuesUpgrade,
  systemSettingsMetadataUpgrade,
  systemSettingsUpgrade,
} from "./system-settings.mjs";
import { modelProfilesUpgrade } from "./model-profiles.mjs";
import { knowledgeLibrariesUpgrade } from "./knowledge-libraries.mjs";
import { workspaceDirectoriesUpgrade } from "./workspace-directories.mjs";

export const appUpgrades = [
  systemSettingsUpgrade,
  systemSettingsMetadataUpgrade,
  systemSettingsDefaultValuesUpgrade,
  modelProfilesUpgrade,
  workspaceDirectoriesUpgrade,
  knowledgeLibrariesUpgrade,
];
