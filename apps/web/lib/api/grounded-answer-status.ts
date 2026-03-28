type GroundedAnswerConfidence = "high" | "medium" | "low";

export type GroundedAnswerStatus = {
  confidence: GroundedAnswerConfidence | null;
  unsupportedReason: string | null;
  missingInformation: string[];
};

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

export function readGroundedAnswerStatus(
  structuredJson: Record<string, unknown> | null | undefined,
): GroundedAnswerStatus {
  const confidenceValue = structuredJson?.confidence;
  const confidence =
    confidenceValue === "high" || confidenceValue === "medium" || confidenceValue === "low"
      ? confidenceValue
      : null;
  const unsupportedReasonValue = structuredJson?.unsupported_reason;
  const unsupportedReason =
    typeof unsupportedReasonValue === "string" && unsupportedReasonValue.trim()
      ? unsupportedReasonValue.trim()
      : null;
  const missingInformation = Array.isArray(structuredJson?.missing_information)
    ? uniqueStrings(
        structuredJson.missing_information
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean),
      )
    : [];

  return {
    confidence,
    unsupportedReason,
    missingInformation,
  };
}

export function describeGroundedAnswerConfidence(status: GroundedAnswerStatus) {
  if (status.unsupportedReason) {
    return "依据不足";
  }

  if (status.confidence === "high") {
    return "高置信";
  }

  if (status.confidence === "medium") {
    return "中置信";
  }

  if (status.confidence === "low") {
    return "低置信";
  }

  return null;
}

