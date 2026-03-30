export function asToolText(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value),
      },
    ],
  };
}

export function buildToolFailure(code: string, message: string, retryable: boolean) {
  return {
    ok: false as const,
    error: {
      code,
      message,
      retryable,
    },
  };
}

export function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
