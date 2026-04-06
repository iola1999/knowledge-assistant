export type OptionalQueryParamValue = string | string[] | undefined;

export function normalizeOptionalStringParam(
  value: OptionalQueryParamValue,
): string | undefined {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const normalized = normalizeOptionalStringParam(entry);
      if (normalized) {
        return normalized;
      }
    }
    return undefined;
  }

  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
