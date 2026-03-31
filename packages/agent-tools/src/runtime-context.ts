import type { ModelProfileRecord } from "@anchordesk/db";

export type AssistantToolRuntimeContext = {
  modelProfile?: ModelProfileRecord | null;
};
