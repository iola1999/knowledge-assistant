import {
  systemSettingsDefaultValuesUpgrade,
  systemSettingsMetadataUpgrade,
  systemSettingsUpgrade,
} from "./system-settings.mjs";
import { knowledgeLibrariesUpgrade } from "./knowledge-libraries.mjs";
import { workspaceDirectoriesUpgrade } from "./workspace-directories.mjs";

export const appUpgrades = [
  systemSettingsUpgrade,
  systemSettingsMetadataUpgrade,
  systemSettingsDefaultValuesUpgrade,
  workspaceDirectoriesUpgrade,
  knowledgeLibrariesUpgrade,
];
