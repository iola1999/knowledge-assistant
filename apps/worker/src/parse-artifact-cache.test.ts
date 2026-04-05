import { describe, expect, it } from "vitest";

import {
  CURRENT_PARSER_ARTIFACT_VERSION,
  shouldReuseCachedParseArtifact,
} from "./parse-artifact-cache";

describe("shouldReuseCachedParseArtifact", () => {
  it("reuses cache only when the parser artifact version is current", () => {
    expect(
      shouldReuseCachedParseArtifact({
        forceReparse: false,
        parserVersion: CURRENT_PARSER_ARTIFACT_VERSION,
      }),
    ).toBe(true);
  });

  it("rejects cache reuse when the artifact was produced by an older parser version", () => {
    expect(
      shouldReuseCachedParseArtifact({
        forceReparse: false,
        parserVersion: "parser-service-v1",
      }),
    ).toBe(false);
  });

  it("rejects cache reuse when force reparse is requested", () => {
    expect(
      shouldReuseCachedParseArtifact({
        forceReparse: true,
        parserVersion: CURRENT_PARSER_ARTIFACT_VERSION,
      }),
    ).toBe(false);
  });

  it("rejects cache reuse when the artifact does not record a parser version", () => {
    expect(
      shouldReuseCachedParseArtifact({
        forceReparse: false,
        parserVersion: null,
      }),
    ).toBe(false);
  });
});
