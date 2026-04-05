export const CURRENT_PARSER_ARTIFACT_VERSION = "parser-service-v2";

export function shouldReuseCachedParseArtifact(input: {
  forceReparse: boolean;
  parserVersion: string | null | undefined;
}) {
  if (input.forceReparse) {
    return false;
  }

  return input.parserVersion === CURRENT_PARSER_ARTIFACT_VERSION;
}
